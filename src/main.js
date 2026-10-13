import './styles.css';
import { buildPayload, classifyResponse, readLink, SUBMISSION_ERROR_MESSAGE } from './preferences.js';

const form = document.querySelector('#preference-form');
const initializing = document.querySelector('#initializing');
const invalidState = document.querySelector('#invalid-state');
const successState = document.querySelector('#success-state');
const reason = document.querySelector('#reason');
const otherReasonField = document.querySelector('#other-reason-field');
const otherReason = document.querySelector('#other-reason');
const futureContact = document.querySelector('#future-contact');
const website = document.querySelector('#website');
const error = document.querySelector('#form-error');
const button = document.querySelector('#submit-button');
const buttonLabel = button.querySelector('.button-label');
const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL?.trim();

let link = readLink(window.location.search);
let submitting = false;

function showState(state) {
  initializing.hidden = state !== 'loading';
  form.hidden = state !== 'ready';
  invalidState.hidden = state !== 'invalid';
  successState.hidden = state !== 'success';
  button.disabled = state !== 'ready' || submitting;
}

function showError() {
  error.textContent = SUBMISSION_ERROR_MESSAGE;
  error.hidden = false;
}

function updateOtherReason() {
  const isOther = reason.value === 'Other';
  otherReasonField.hidden = !isOther;
  if (!isOther) otherReason.value = '';
}

reason.addEventListener('change', updateOtherReason);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || !link) return;

  error.hidden = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const payload = buildPayload(link, {
      reason: reason.value,
      otherReason: otherReason.value,
      futureContact: futureContact.value,
      website: website.value,
    });

    if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) throw new Error('Webhook is not configured');

    submitting = true;
    button.disabled = true;
    buttonLabel.textContent = 'Unsubscribing…';

    const response = await fetch(webhookUrl, {
      method: 'POST',
      // A simple cross-origin request avoids an OPTIONS preflight that n8n's
      // Webhook node does not handle. The workflow parses this JSON text.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    });
    const body = await response.json().catch(() => null);
    const outcome = classifyResponse(response.status, body);

    if (outcome === 'invalid') showState('invalid');
    else if (outcome === 'success') showState('success');
    else showError();
  } catch {
    showError();
  } finally {
    window.clearTimeout(timeout);
    submitting = false;
    buttonLabel.textContent = 'Unsubscribe';
    if (!form.hidden) button.disabled = false;
  }
});

// Keep the token out of the visible address bar after this page has captured it.
if (link) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('token');
  window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
}

updateOtherReason();
showState(link ? 'ready' : 'invalid');
