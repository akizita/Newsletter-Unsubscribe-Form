// These pure functions are embedded into n8n Code nodes by build-workflows.mjs.
// Keep each function self-contained: the Code node cannot import this file.

export function validateFormRequest(rawBody) {
  const invalid = { valid: false, status: 400, message: 'Invalid form values.' };
  let body = rawBody;

  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return invalid; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid;

  const keys = ['token', 'campaignId', 'reason', 'otherReason', 'futureContact', 'source', 'website'];
  if (keys.some((key) => body[key] !== undefined && typeof body[key] !== 'string')) return invalid;

  const token = (body.token ?? '').trim();
  const campaignId = (body.campaignId ?? '').trim();
  const reason = body.reason ?? '';
  const otherReason = (body.otherReason ?? '').trim();
  const futureContact = body.futureContact ?? '';
  const website = (body.website ?? '').trim();
  const reasons = [
    'Not looking for opportunities or talent right now',
    'The content is not relevant to me',
    'I receive emails too often',
    'I have already found a role or filled my hiring need',
    'I prefer another communication channel',
    'I do not remember subscribing',
    'Other',
  ];

  if (!token || token.length > 256 || /[\s\u0000-\u001f]/u.test(token)) return invalid;
  if (campaignId.length > 128 || /[\u0000-\u001f]/u.test(campaignId)) return invalid;
  if (website || !['', ...reasons].includes(reason)) return invalid;
  if (!['', 'Yes', 'No'].includes(futureContact)) return invalid;
  if (otherReason.length > 500 || (reason !== 'Other' && otherReason)) return invalid;
  if (body.source !== 'newsletter-preference-page') return invalid;

  return { valid: true, token, campaignId, reason, otherReason, futureContact };
}

export function validateOneClickRequest(request) {
  const invalid = { valid: false, status: 400, message: 'Invalid unsubscribe request.' };
  const token = request?.query?.token;
  if (typeof token !== 'string' || !token || token.length > 256 || /[\s\u0000-\u001f]/u.test(token)) return invalid;
  const body = request.body;
  const confirmed = body === 'List-Unsubscribe=One-Click' || body?.['List-Unsubscribe'] === 'One-Click';
  if (!confirmed) return invalid;
  return { valid: true, token, campaignId: typeof request.query?.campaign === 'string' ? request.query.campaign : '' };
}

export function verifyRecipient(row, request, now = new Date()) {
  const invalid = { valid: false, status: 401, message: 'This preference link is invalid or has expired.' };
  if (!request?.valid || !row || row.token !== request.token) return invalid;

  const recipientId = String(row.recipient_id ?? '').trim();
  const email = String(row.email ?? '').trim();
  const campaignId = String(row.campaign_id ?? '').trim();
  if (!recipientId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return invalid;
  if (campaignId && campaignId !== request.campaignId) return invalid;

  const expiry = String(row.token_expires_at ?? '').trim();
  if (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now.getTime())) return invalid;

  return {
    valid: true,
    token: request.token,
    recipientId,
    email,
    campaignId: campaignId || request.campaignId,
    oldUnsubscribedAt: row.status === 'unsubscribed' ? String(row.unsubscribed_at ?? '') : '',
    reason: request.reason ?? '',
    otherReason: request.otherReason ?? '',
    futureContact: request.futureContact ?? '',
  };
}

export function prepareWrites(recipient, priorResponse, now = new Date()) {
  if (!recipient?.valid) throw new Error('Recipient was not validated');

  const timestamp = now.toISOString();
  const unsubscribedAt = recipient.oldUnsubscribedAt || timestamp;
  const responseKey = JSON.stringify([recipient.recipientId, recipient.campaignId]);
  // Google Sheets can interpret user text starting with these characters as a formula.
  const safeOtherReason = /^[=+\-@]/u.test(recipient.otherReason) ? `'${recipient.otherReason}` : recipient.otherReason;
  const randomUuid = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
      const value = Math.floor(Math.random() * 16);
      return (part === 'x' ? value : (value & 3) | 8).toString(16);
    });
  };

  return {
    recipient: {
      token: recipient.token,
      status: 'unsubscribed',
      unsubscribed_at: unsubscribedAt,
      updated_at: timestamp,
    },
    response: {
      response_key: responseKey,
      response_id: priorResponse?.response_id || randomUuid(),
      recipient_id: recipient.recipientId,
      email: recipient.email,
      campaign_id: recipient.campaignId,
      reason: recipient.reason,
      other_reason: safeOtherReason,
      future_contact: recipient.futureContact,
      unsubscribe_status: 'unsubscribed',
      unsubscribed_at: unsubscribedAt,
      feedback_submitted_at: timestamp,
      source: 'newsletter-preference-page',
    },
  };
}
