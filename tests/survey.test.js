import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, classifyResponse } from '../src/survey.js';
import { prepareResponse, validateSurveyRequest } from '../automation/workflow-logic.js';

const responseId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const fields = {
  name: 'Example Person',
  email: 'person@example.com',
  question1: 'We currently handle this in-house.',
  question2: 'Unsure',
  website: '',
};

test('public survey payload has no recipient token or campaign', () => {
  const payload = buildPayload(fields, responseId);
  assert.deepEqual(payload, { requestId: responseId, ...fields });
  assert.equal(Object.hasOwn(payload, 'responseId'), false);
});

test('survey validation rejects missing, unsupported, and bot values', () => {
  const valid = { responseId, ...fields };
  for (const change of [
    { name: '' }, { email: 'not-an-email' }, { question1: '' },
    { question2: 'Maybe' }, { website: 'spam' }, { responseId: 'invalid' },
    { unexpected: 'field' },
  ]) {
    assert.equal(validateSurveyRequest({ ...valid, ...change }).valid, false);
  }
  assert.equal(validateSurveyRequest('not-json').valid, false);
  assert.throws(() => buildPayload({ ...fields, question1: '' }, responseId));
});

test('prepared sheet row uses the server time and stores formula-like text safely', () => {
  const request = validateSurveyRequest({ responseId, ...fields, name: '=1+1', email: '+person@example.com' });
  const row = prepareResponse(request, new Date('2026-10-20T00:00:00.000Z'));
  assert.deepEqual(Object.keys(row), ['response_id', 'email', 'name', 'question1', 'question2', 'submitted_at']);
  assert.equal(row.name, "'=1+1");
  assert.equal(row.email, "'+person@example.com");
  assert.equal(row.submitted_at, '2026-10-20T00:00:00.000Z');
});

test('frontend accepts only the saved response contract', () => {
  assert.equal(classifyResponse(200, { ok: true, status: 'saved' }), 'success');
  assert.equal(classifyResponse(200, JSON.stringify({ ok: true, status: 'saved' })), 'success');
  assert.equal(classifyResponse(200, 'not-json'), 'error');
  assert.equal(classifyResponse(200, { ok: true }), 'error');
  assert.equal(classifyResponse(500, null), 'error');
});
