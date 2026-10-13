export const REASONS = Object.freeze([
  'Not looking for opportunities or talent right now',
  'The content is not relevant to me',
  'I receive emails too often',
  'I have already found a role or filled my hiring need',
  'I prefer another communication channel',
  'I do not remember subscribing',
  'Other',
]);

export const INVALID_LINK_MESSAGE = 'This unsubscribe link is invalid or has expired. Please contact OPG for assistance.';
export const SUBMISSION_ERROR_MESSAGE = 'We could not update your preferences right now. Please try again in a moment.';

export function readLink(search) {
  const params = new URLSearchParams(search);
  const token = params.get('token')?.trim() ?? '';
  const campaignId = params.get('campaign')?.trim() ?? '';

  if (!token || token.length > 256 || /[\s\u0000-\u001f]/u.test(token) || campaignId.length > 128 || /[\u0000-\u001f]/u.test(campaignId)) {
    return null;
  }

  return { token, campaignId };
}

export function buildPayload(link, fields, now = new Date()) {
  const reason = fields.reason ?? '';
  const futureContact = fields.futureContact ?? '';

  if (!REASONS.includes(reason) && reason !== '') throw new Error('Invalid reason');
  if (!['', 'Yes', 'No'].includes(futureContact)) throw new Error('Invalid future contact preference');

  const otherReason = reason === 'Other' ? (fields.otherReason ?? '').trim() : '';
  if (otherReason.length > 500) throw new Error('Other reason is too long');

  return {
    token: link.token,
    campaignId: link.campaignId,
    reason,
    otherReason,
    futureContact,
    source: 'newsletter-preference-page',
    submittedAt: now.toISOString(),
    website: fields.website ?? '',
  };
}

export function classifyResponse(status, body) {
  if (status === 401) return 'invalid';
  if (status >= 200 && status < 300 && body?.ok === true && body.status === 'unsubscribed') return 'success';
  return 'error';
}
