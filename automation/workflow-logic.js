// These self-contained functions are embedded in n8n Code nodes by build-workflows.mjs.
export function validateSurveyRequest(rawBody) {
  const invalid = { valid: false };
  let body = rawBody;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return invalid; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid;

  const keys = ['responseId', 'name', 'email', 'question1', 'question2', 'website'];
  if (Object.keys(body).length !== keys.length) return invalid;
  if (keys.some((key) => !Object.hasOwn(body, key) || typeof body[key] !== 'string')) return invalid;

  const responseId = body.responseId.trim();
  const name = body.name.trim();
  const email = body.email.trim();
  const question1 = body.question1;
  const question2 = body.question2;
  const reasons = [
    'We already use a similar service/competitor.',
    'We currently handle this in-house.',
    'Budget constraints / Too expensive.',
    'Not a priority at this time.',
    "The service doesn't fit our current business needs.",
  ];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseId)) return invalid;
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u.test(name)) return invalid;
  if (email.length > 254 || email.includes('..')) return invalid;
  const parts = email.split('@');
  if (parts.length !== 2) return invalid;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.')
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return invalid;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return invalid;
  if (!reasons.includes(question1) || !['Yes', 'No', 'Unsure'].includes(question2)) return invalid;
  if (body.website.trim()) return invalid;

  return { valid: true, responseId, name, email, question1, question2 };
}

export function prepareResponse(request, now = new Date()) {
  if (!request?.valid) throw new Error('Survey request was not validated');
  // Prevent names or email addresses beginning with formula characters from
  // being interpreted as formulas by Google Sheets.
  const asText = (value) => /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return {
    response_id: request.responseId,
    email: asText(request.email),
    name: asText(request.name),
    question1: request.question1,
    question2: request.question2,
    submitted_at: now.toISOString(),
  };
}
