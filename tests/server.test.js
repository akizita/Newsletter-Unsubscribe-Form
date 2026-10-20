import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionHandler, MAX_BODY_BYTES, responseIdFor } from '../server/submission.js';
import { prepareResponse, validateSurveyRequest } from '../automation/workflow-logic.js';

const origin = 'https://survey.example';
const secret = 'test-secret-at-least-thirty-two-characters';
const env = { N8N_WEBHOOK_URL: 'https://n8n.example/webhook/survey-v2', N8N_WEBHOOK_SECRET: secret };
const valid = {
  requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name: 'Example Person',
  email: 'person@example.com',
  question1: 'We currently handle this in-house.',
  question2: 'Unsure',
  website: '',
};

function request(body = valid, { method = 'POST', type = 'application/json', requestOrigin = origin } = {}) {
  return new Request(`${origin}/api/submit`, {
    method,
    headers: { Origin: requestOrigin, 'Content-Type': type },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function harness(upstream = () => Response.json({ ok: true, status: 'saved' })) {
  const calls = [];
  const logs = [];
  const handler = createSubmissionHandler({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return upstream(url, options);
    },
    logger: { info: (entry) => logs.push(entry) },
  });
  return { handler, calls, logs };
}

test('valid POST is authenticated server-to-server and returns the saved contract', async () => {
  const { handler, calls } = harness();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: 'saved' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.N8N_WEBHOOK_URL);
  assert.equal(calls[0].options.headers['X-OPG-Survey-Key'], secret);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(Object.hasOwn(calls[0].body, 'requestId'), false);
  assert.match(calls[0].body.responseId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(validateSurveyRequest(calls[0].body).valid, true);
});

test('missing, invalid, unexpected and honeypot input is rejected before n8n', async () => {
  const { handler, calls } = harness();
  for (const body of [
    {}, null, [],
    { ...valid, name: '' },
    { ...valid, name: 'x'.repeat(121) },
    { ...valid, email: 'invalid' },
    { ...valid, email: 'a..b@example.com' },
    { ...valid, question1: 'unsupported' },
    { ...valid, question2: 'Maybe' },
    { ...valid, requestId: 'invalid' },
    { ...valid, website: 'filled by bot' },
    { ...valid, extra: 'unexpected' },
    { ...valid, name: '<script>alert(1)</script>' },
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { ok: false });
  }
  assert.equal(calls.length, 0);
});

test('method, media type, origin and body size are enforced', async () => {
  const { handler, calls } = harness();
  const method = await handler(request(valid, { method: 'GET' }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
  assert.equal((await handler(request(valid, { type: 'text/plain' }))).status, 415);
  assert.equal((await handler(request(valid, { requestOrigin: 'https://elsewhere.example' }))).status, 403);
  const oversized = request({ ...valid, name: 'x'.repeat(MAX_BODY_BYTES) });
  assert.equal((await handler(oversized)).status, 413);
  assert.equal(calls.length, 0);
});

test('retries reuse the Sheets key but changed answers cannot overwrite that row', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request({ ...valid, question2: 'Yes' }))).status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.responseId, calls[1].body.responseId);
  assert.notEqual(calls[0].body.responseId, calls[2].body.responseId);
  assert.equal(responseIdFor({ ...valid }), calls[0].body.responseId);
});

test('formula-like name reaches Sheets only as text', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request({ ...valid, name: '=HYPERLINK("https://bad.example")' }))).status, 200);
  const validated = validateSurveyRequest(calls[0].body);
  assert.equal(validated.valid, true);
  assert.equal(prepareResponse(validated).name, "'=HYPERLINK(\"https://bad.example\")");
});

test('upstream and configuration failures stay generic and logs contain no personal data', async () => {
  const { handler, logs } = harness(() => Response.json({ ok: false, detail: 'private upstream error' }, { status: 500 }));
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false });
  const unconfigured = createSubmissionHandler({
    env: { ...env, N8N_WEBHOOK_URL: 'https://n8n.example/webhook-test/old' },
    logger: { info: (entry) => logs.push(entry) },
  });
  assert.equal((await unconfigured(request())).status, 503);
  assert.equal(logs.some((entry) => /Example Person|person@example.com|test-secret|private upstream error/.test(entry)), false);
});

test('only the loopback development handler accepts an n8n test webhook', async () => {
  const testEnv = { ...env, N8N_WEBHOOK_URL: 'https://n8n.example/webhook-test/survey-v2' };
  const calls = [];
  const options = {
    env: testEnv,
    fetchImpl: async (url) => {
      calls.push(url);
      return Response.json({ ok: true, status: 'saved' });
    },
    logger: { info() {} },
  };
  const localRequest = () => new Request('http://localhost:5173/api/submit', {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify(valid),
  });
  const localDevelopment = createSubmissionHandler({ ...options, allowTestWebhook: true });
  assert.equal((await localDevelopment(localRequest())).status, 200);
  assert.deepEqual(calls, [testEnv.N8N_WEBHOOK_URL]);
  assert.equal((await localDevelopment(request())).status, 503, 'a nonlocal origin cannot use the test URL');
  assert.equal((await createSubmissionHandler(options)(localRequest())).status, 503, 'production rejects the test URL');
  assert.equal(calls.length, 1);
});
