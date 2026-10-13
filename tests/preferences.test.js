import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, classifyResponse, readLink } from '../src/preferences.js';
import { prepareWrites, validateFormRequest, validateOneClickRequest, verifyRecipient } from '../automation/workflow-logic.js';

const token = 'random-opaque-token';
const request = { token, campaignId: 'oct-2026', reason: '', otherReason: '', futureContact: '', source: 'newsletter-preference-page', submittedAt: '2026-10-13T00:00:00.000Z', website: '' };
const row = { recipient_id: 'recipient-1', email: 'person@example.com', token, campaign_id: 'oct-2026', status: 'subscribed', token_expires_at: '2026-12-31T00:00:00.000Z' };
const now = new Date('2026-10-13T00:00:00.000Z');

test('link parsing accepts an opaque token and rejects missing or malformed tokens', () => {
  assert.deepEqual(readLink('?token=random-opaque-token&campaign=oct-2026'), { token, campaignId: 'oct-2026' });
  assert.equal(readLink('?campaign=oct-2026'), null);
  assert.equal(readLink('?token=bad%20token'), null);
  assert.equal(readLink('?token=ok&campaign=bad%0Avalue'), null);
});

test('blank feedback still creates a valid unsubscribe request', () => {
  const payload = buildPayload({ token, campaignId: 'oct-2026' }, { reason: '', otherReason: '', futureContact: '', website: '' }, now);
  assert.deepEqual(payload, request);
  assert.equal(validateFormRequest(JSON.stringify(payload)).valid, true);
});

test('Other text is included only when Other is selected', () => {
  assert.equal(buildPayload({ token, campaignId: '' }, { reason: 'Other', otherReason: '  More context  ' }, now).otherReason, 'More context');
  assert.equal(buildPayload({ token, campaignId: '' }, { reason: '', otherReason: 'Ignored' }, now).otherReason, '');
  assert.equal(validateFormRequest({ ...request, reason: 'Other', otherReason: 'x'.repeat(501) }).valid, false);
  assert.equal(validateFormRequest({ ...request, reason: 'Unknown' }).valid, false);
  assert.equal(validateFormRequest({ ...request, futureContact: 'Maybe' }).valid, false);
  assert.equal(validateFormRequest({ ...request, website: 'spam' }).valid, false);
});

test('recipient verification protects expired, missing and mismatched links', () => {
  const validated = validateFormRequest(request);
  assert.equal(verifyRecipient(row, validated, now).valid, true);
  assert.equal(verifyRecipient({}, validated, now).status, 401);
  assert.equal(verifyRecipient(row, { ...validated, campaignId: 'other' }, now).status, 401);
  assert.equal(verifyRecipient({ ...row, token_expires_at: now.toISOString() }, validated, now).status, 401);
});

test('repeated requests preserve the original unsubscribe time and response id', () => {
  const validated = validateFormRequest(request);
  const first = prepareWrites(verifyRecipient(row, validated, now), {}, now);
  const again = prepareWrites(verifyRecipient({ ...row, status: 'unsubscribed', unsubscribed_at: first.recipient.unsubscribed_at }, validated, new Date('2026-10-14T00:00:00.000Z')), { response_id: first.response.response_id }, new Date('2026-10-14T00:00:00.000Z'));
  assert.equal(again.recipient.unsubscribed_at, first.recipient.unsubscribed_at);
  assert.equal(again.response.response_id, first.response.response_id);
  assert.equal(again.response.response_key, first.response.response_key);
});

test('free text that looks like a spreadsheet formula is stored as text', () => {
  const recipient = verifyRecipient(row, validateFormRequest({ ...request, reason: 'Other', otherReason: '=IMPORTDATA("https://example.com")' }), now);
  assert.equal(prepareWrites(recipient, {}, now).response.other_reason, "'=IMPORTDATA(\"https://example.com\")");
});

test('one-click requests require an intentional POST payload', () => {
  assert.equal(validateOneClickRequest({ query: { token }, body: { 'List-Unsubscribe': 'One-Click' } }).valid, true);
  assert.equal(validateOneClickRequest({ query: { token }, body: {} }).valid, false);
  assert.equal(validateOneClickRequest({ query: {}, body: { 'List-Unsubscribe': 'One-Click' } }).valid, false);
});

test('frontend only accepts the full success contract', () => {
  assert.equal(classifyResponse(200, { ok: true, status: 'unsubscribed' }), 'success');
  assert.equal(classifyResponse(200, { ok: true }), 'error');
  assert.equal(classifyResponse(401, { ok: false }), 'invalid');
  assert.equal(classifyResponse(500, null), 'error');
});
