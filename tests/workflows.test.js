import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const responseId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('survey workflow connects validation to one Google Sheets response write', () => {
  const workflow = JSON.parse(readFileSync(join('automation', 'survey-responses.workflow.json'), 'utf8'));
  const names = new Set(workflow.nodes.map((node) => node.name));
  assert.equal(names.size, workflow.nodes.length);
  for (const [from, outputs] of Object.entries(workflow.connections)) {
    assert.equal(names.has(from), true);
    for (const links of outputs.main) for (const link of links ?? []) assert.equal(names.has(link.node), true);
  }
  for (const node of workflow.nodes) {
    if (node.type === 'n8n-nodes-base.code') new Function('$input', '$', node.parameters.jsCode);
  }
  const sheets = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.googleSheets');
  const webhook = workflow.nodes.find((node) => node.name === 'Survey Webhook');
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.match(webhook.parameters.path, /secure-v2/);
  assert.equal(webhook.parameters.options.allowedOrigins, undefined);
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].parameters.sheetName.value, 'Responses');
  assert.deepEqual(sheets[0].parameters.columns.matchingColumns, ['response_id']);
  assert.deepEqual(Object.keys(sheets[0].parameters.columns.value), ['response_id', 'email', 'name', 'question1', 'question2', 'submitted_at']);
  assert.deepEqual(workflow.nodes.find((node) => node.name === 'Survey Saved').parameters.responseBody, { ok: true, status: 'saved' });
  assert.deepEqual(workflow.nodes.find((node) => node.name === 'Bad Request').parameters.responseBody, { ok: false, message: 'Invalid survey response.' });
  assert.equal(workflow.active, false);
});

test('generated n8n Code nodes validate a submission and prepare the sheet row', () => {
  const workflow = JSON.parse(readFileSync(join('automation', 'survey-responses.workflow.json'), 'utf8'));
  const code = (name) => workflow.nodes.find((node) => node.name === name).parameters.jsCode;
  const body = JSON.stringify({
    responseId, name: 'Example Person', email: 'person@example.com',
    question1: 'We currently handle this in-house.', question2: 'Unsure', website: '',
  });
  const validated = new Function('$input', code('Validate Survey'))({ first: () => ({ json: { body } }) })[0].json;
  assert.equal(validated.valid, true);
  assert.equal(new Function('$input', code('Validate Survey'))({ first: () => ({ json: { body: JSON.stringify({ ...JSON.parse(body), unexpected: true }) } }) })[0].json.valid, false);
  const prepared = new Function('$input', code('Prepare Response'))({ first: () => ({ json: validated }) })[0].json;
  assert.equal(prepared.response_id, responseId);
  assert.equal(prepared.email, 'person@example.com');
  assert.equal(prepared.question2, 'Unsure');
  assert.equal(Number.isNaN(Date.parse(prepared.submitted_at)), false);
});
