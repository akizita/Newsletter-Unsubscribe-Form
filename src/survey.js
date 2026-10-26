export const REASONS = Object.freeze([
  'We already use a similar service/competitor.',
  'We currently handle this in-house.',
  'Budget constraints / Too expensive.',
  'Not a priority at this time.',
  "The service doesn't fit our current business needs.",
]);

export const FUTURE_INTEREST = Object.freeze(['Yes', 'No', 'Unsure']);
export const SUBMISSION_ERROR_MESSAGE = 'We could not save your response. Please try again in a moment.';
export const PAUSE_CONFIRMATION = 'The contact record of your organization has been updated, and all further outreach will pause immediately.';
export const CEASE_CONFIRMATION = 'The contact record of your organization has been updated, and all further outreach will cease immediately.';

export function confirmationFor(question2) {
  if (question2 === 'No') return CEASE_CONFIRMATION;
  if (question2 === 'Yes' || question2 === 'Unsure') return PAUSE_CONFIRMATION;
  throw new Error('Invalid answer to question 2');
}

export function buildPayload(fields, requestId) {
  const name = String(fields.name ?? '').trim();
  const email = String(fields.email ?? '').trim();
  const question1 = fields.question1 ?? '';
  const question2 = fields.question2 ?? '';

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error('Invalid request ID');
  }
  if (!name || name.length > 120 || /[\u0000-\u001f]/u.test(name)) throw new Error('Invalid name');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error('Invalid email');
  if (!REASONS.includes(question1)) throw new Error('Invalid answer to question 1');
  if (!FUTURE_INTEREST.includes(question2)) throw new Error('Invalid answer to question 2');

  return { requestId, name, email, question1, question2, website: fields.website ?? '' };
}

export function classifyResponse(status, body) {
  // Workflows imported from the earlier template send a JSON-encoded string.
  // Accept that response while requiring the same explicit saved contract.
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return 'error'; }
  }
  return status >= 200 && status < 300 && body?.ok === true && body.status === 'saved'
    ? 'success'
    : 'error';
}
