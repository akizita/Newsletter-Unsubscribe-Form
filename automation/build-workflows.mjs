import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareWrites, validateFormRequest, validateOneClickRequest, verifyRecipient } from './workflow-logic.js';

const directory = dirname(fileURLToPath(import.meta.url));
const sheetId = 'REPLACE_WITH_SPREADSHEET_ID';
const allowedOrigin = 'https://preferences.opg.com';

function id(name) {
  const value = createHash('sha256').update(name).digest('hex').slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20)}`;
}

function node(name, type, typeVersion, x, y, parameters = {}, extra = {}) {
  return { id: id(name), name, type: `n8n-nodes-base.${type}`, typeVersion, position: [x, y], parameters, ...extra };
}

function code(name, x, y, source) {
  return node(name, 'code', 2, x, y, { jsCode: source });
}

function condition(name, x, y) {
  return node(name, 'if', 1, x, y, { conditions: { boolean: [{ value1: '={{ $json.valid }}', value2: true }] } });
}

function sheet(name, operation, tab, x, y, options = {}) {
  return node(name, 'googleSheets', 4.7, x, y, {
    ...(operation === 'getAll' ? {} : { operation }),
    documentId: { __rl: true, value: sheetId, mode: 'id' },
    sheetName: { __rl: true, value: tab, mode: 'name' },
    ...options,
    options: {},
  }, operation === 'getAll' ? { alwaysOutputData: true } : {});
}

function schema(columns) {
  return columns.map((column) => ({ id: column, displayName: column, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }));
}

function mappedColumns(values, match) {
  return { mappingMode: 'defineBelow', value: Object.fromEntries(values.map((key) => [key, `={{ $('Prepare Writes').first().json.${match === 'token' ? 'recipient' : 'response'}.${key} }}`])), matchingColumns: [match], schema: schema(values) };
}

function response(name, x, y, status, body, noData = false) {
  return node(name, 'respondToWebhook', 1.5, x, y, noData
    ? { respondWith: 'noData', options: { responseCode: status } }
    : { respondWith: 'json', responseBody: JSON.stringify(body), options: { responseCode: status } });
}

function webhook(name, path, x, y, cors = false) {
  return node(name, 'webhook', 2.1, x, y, {
    httpMethod: 'POST', path, responseMode: 'responseNode',
    options: cors ? { allowedOrigins: allowedOrigin } : {},
  }, { webhookId: id(`${name} webhook`) });
}

function workflow(name, nodes, routes) {
  const connections = {};
  for (const [from, to, output = 0] of routes) {
    connections[from] ??= { main: [] };
    connections[from].main[output] ??= [];
    connections[from].main[output].push({ node: to, type: 'main', index: 0 });
  }
  return {
    name, nodes, connections,
    settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', saveManualExecutions: false },
    staticData: null, pinData: {}, active: false,
  };
}

const formNodes = [
  webhook('Form Webhook', 'opg-newsletter-preferences', 0, 0, true),
  code('Validate Request', 220, 0, `const validate = ${validateFormRequest.toString()};\nreturn [{ json: validate($input.first().json.body) }];`),
  condition('Request Valid?', 440, 0),
  response('Bad Request', 660, 180, 400, { ok: false, message: 'Invalid form values.' }),
  sheet('Find Recipient', 'getAll', 'Recipients', 660, -80, { filtersUI: { values: [{ lookupColumn: 'token', lookupValue: "={{ $('Validate Request').first().json.token }}" }] } }),
  code('Verify Recipient', 880, -80, `const verify = ${verifyRecipient.toString()};\nreturn [{ json: verify($input.first().json, $('Validate Request').first().json) }];`),
  condition('Recipient Valid?', 1100, -80),
  response('Invalid Link', 1320, 80, 401, { ok: false, message: 'This preference link is invalid or has expired.' }),
  sheet('Find Response', 'getAll', 'Responses', 1320, -180, { filtersUI: { values: [{ lookupColumn: 'response_key', lookupValue: "={{ JSON.stringify([$('Verify Recipient').first().json.recipientId, $('Verify Recipient').first().json.campaignId]) }}" }] } }),
  code('Prepare Writes', 1540, -180, `const prepare = ${prepareWrites.toString()};\nreturn [{ json: prepare($('Verify Recipient').first().json, $input.first().json) }];`),
  sheet('Update Recipient', 'update', 'Recipients', 1760, -180, { columns: mappedColumns(['token', 'status', 'unsubscribed_at', 'updated_at'], 'token') }),
  sheet('Upsert Response', 'appendOrUpdate', 'Responses', 1980, -180, { columns: mappedColumns(['response_key', 'response_id', 'recipient_id', 'email', 'campaign_id', 'reason', 'other_reason', 'future_contact', 'unsubscribe_status', 'unsubscribed_at', 'feedback_submitted_at', 'source'], 'response_key') }),
  response('Form Success', 2200, -180, 200, { ok: true, status: 'unsubscribed', message: 'Your email preferences have been updated.' }),
];

const formRoutes = [
  ['Form Webhook', 'Validate Request'], ['Validate Request', 'Request Valid?'],
  ['Request Valid?', 'Find Recipient', 0], ['Request Valid?', 'Bad Request', 1],
  ['Find Recipient', 'Verify Recipient'], ['Verify Recipient', 'Recipient Valid?'],
  ['Recipient Valid?', 'Find Response', 0], ['Recipient Valid?', 'Invalid Link', 1],
  ['Find Response', 'Prepare Writes'], ['Prepare Writes', 'Update Recipient'],
  ['Update Recipient', 'Upsert Response'], ['Upsert Response', 'Form Success'],
];

const oneClickNodes = [
  webhook('One Click Webhook', 'opg-one-click-unsubscribe', 0, 0),
  code('Validate One Click', 220, 0, `const validate = ${validateOneClickRequest.toString()};\nreturn [{ json: validate($input.first().json) }];`),
  condition('One Click Valid?', 440, 0),
  response('Invalid One Click Request', 660, 180, 400, { ok: false }),
  sheet('Find One Click Recipient', 'getAll', 'Recipients', 660, -80, { filtersUI: { values: [{ lookupColumn: 'token', lookupValue: "={{ $('Validate One Click').first().json.token }}" }] } }),
  code('Verify One Click Recipient', 880, -80, `const verify = ${verifyRecipient.toString()};\nreturn [{ json: verify($input.first().json, $('Validate One Click').first().json) }];`),
  condition('One Click Recipient Valid?', 1100, -80),
  response('Invalid One Click Link', 1320, 80, 401, { ok: false }),
  code('Prepare One Click Update', 1320, -180, `const recipient = $input.first().json;\nconst timestamp = new Date().toISOString();\nreturn [{ json: { token: recipient.token, status: 'unsubscribed', unsubscribed_at: recipient.oldUnsubscribedAt || timestamp, updated_at: timestamp } }];`),
  sheet('Update One Click Recipient', 'update', 'Recipients', 1540, -180, {
    columns: { mappingMode: 'defineBelow', value: Object.fromEntries(['token', 'status', 'unsubscribed_at', 'updated_at'].map((key) => [key, `={{ $('Prepare One Click Update').first().json.${key} }}`])), matchingColumns: ['token'], schema: schema(['token', 'status', 'unsubscribed_at', 'updated_at']) },
  }),
  response('One Click Success', 1760, -180, 200, null, true),
];

const oneClickRoutes = [
  ['One Click Webhook', 'Validate One Click'], ['Validate One Click', 'One Click Valid?'],
  ['One Click Valid?', 'Find One Click Recipient', 0], ['One Click Valid?', 'Invalid One Click Request', 1],
  ['Find One Click Recipient', 'Verify One Click Recipient'], ['Verify One Click Recipient', 'One Click Recipient Valid?'],
  ['One Click Recipient Valid?', 'Prepare One Click Update', 0], ['One Click Recipient Valid?', 'Invalid One Click Link', 1],
  ['Prepare One Click Update', 'Update One Click Recipient'], ['Update One Click Recipient', 'One Click Success'],
];

const errorNodes = [
  node('Error Trigger', 'errorTrigger', 1, 0, 0),
  code('Sanitize Error Alert', 220, 0, `const event = $input.first().json;\nreturn [{ json: { workflow: event.workflow?.name || 'Unknown workflow', time: new Date().toISOString(), message: 'An OPG newsletter workflow failed. Review the restricted n8n execution log.' } }];`),
  node('Email Internal Owner', 'emailSend', 2.1, 440, 0, {
    fromEmail: 'REPLACE_WITH_VERIFIED_SENDER_EMAIL',
    toEmail: 'REPLACE_WITH_INTERNAL_ALERT_EMAIL',
    subject: 'OPG newsletter workflow error',
    emailFormat: 'text',
    text: '=Workflow: {{ $json.workflow }}\nTime: {{ $json.time }}\n{{ $json.message }}',
    options: { appendAttribution: false },
  }),
];

const outputs = [
  ['newsletter-preferences.workflow.json', workflow('OPG — Newsletter Unsubscribe and Feedback', formNodes, formRoutes)],
  ['one-click-unsubscribe.workflow.json', workflow('OPG — One Click Unsubscribe', oneClickNodes, oneClickRoutes)],
  ['error-alert.workflow.json', workflow('OPG — Newsletter Workflow Error Alert', errorNodes, [['Error Trigger', 'Sanitize Error Alert'], ['Sanitize Error Alert', 'Email Internal Owner']])],
];

for (const [name, data] of outputs) {
  writeFileSync(join(directory, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Generated ${name}`);
}
