import { buildPayload, classifyResponse, SUBMISSION_ERROR_MESSAGE } from './survey.js';

const card = document.querySelector('.survey-card');
const splash = document.querySelector('#splash-screen');
const form = document.querySelector('#survey-form');
const steps = [...form.querySelectorAll('[data-form-step]')];
const caption = document.querySelector('#step-caption');
const progressSegments = [...document.querySelectorAll('.progress-track span')];
const modal = document.querySelector('#feedback-modal');
const modalPanel = modal.querySelector('.modal-panel');
const modalTitle = document.querySelector('#modal-title');
const modalMessage = document.querySelector('#modal-message');
const modalClose = document.querySelector('#modal-close');
const button = document.querySelector('#submit-button');
const buttonLabel = button.querySelector('.button-label');
const backButtons = [...form.querySelectorAll('[data-back]')];
const nameField = form.elements.namedItem('name');
const emailField = form.elements.namedItem('email');
const question1Field = form.elements.namedItem('question1');
const question2Field = form.elements.namedItem('question2');
const stepNames = ['Your details', 'Your current needs', 'Future interest'];

let step = 0;
let requestId;
let submitting = false;
let submitted = false;
let splashFinished = false;
let modalReturnFocus;
const dropdownControllers = [];

function dismissSplash() {
  if (splashFinished) return;
  splashFinished = true;
  card.inert = false;
  card.classList.add('is-ready');
  splash.classList.add('is-leaving');
  splash.setAttribute('aria-hidden', 'true');
  splash.inert = true;
  window.setTimeout(() => { splash.hidden = true; }, 400);
}

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  dismissSplash();
} else {
  window.setTimeout(dismissSplash, 3800);
}

function openModal({ state = 'notice', title, message, action = 'OK', returnFocus = caption }) {
  dropdownControllers.forEach((controller) => controller.close());
  modalReturnFocus = returnFocus;
  modalPanel.dataset.state = state;
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalClose.textContent = action;
  card.inert = true;
  modal.hidden = false;
  modalClose.focus({ preventScroll: true });
}

function closeModal() {
  if (modal.hidden) return;
  const restartAfterSuccess = submitted && modalPanel.dataset.state === 'success';
  modal.hidden = true;
  card.inert = false;
  if (restartAfterSuccess) {
    resetSurvey();
    return;
  }
  const target = modalReturnFocus?.isConnected && !modalReturnFocus.disabled ? modalReturnFocus : caption;
  target.focus({ preventScroll: true });
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
modal.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    modalClose.focus();
  }
});

function showNotice(title, message, returnFocus) {
  openModal({ title, message, returnFocus });
}

function createDropdown(select) {
  const root = document.querySelector(`[data-dropdown="${select.id}"]`);
  const trigger = root.querySelector('.dropdown-trigger');
  const display = trigger.querySelector('span');
  const list = root.querySelector('.dropdown-list');
  const items = [...select.options].filter((option) => option.value).map((option, index) => {
    const item = document.createElement('li');
    item.id = `${select.id}-option-${index}`;
    item.role = 'option';
    item.tabIndex = -1;
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.setAttribute('aria-selected', 'false');
    list.append(item);
    return item;
  });

  function sync() {
    const selected = [...select.options].find((option) => option.value === select.value);
    display.textContent = selected?.textContent || 'Select an answer';
    root.classList.toggle('is-filled', Boolean(select.value));
    items.forEach((item) => item.setAttribute('aria-selected', String(item.dataset.value === select.value)));
  }

  function close() {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
  }

  function focusItem(item) {
    item?.focus({ preventScroll: true });
    if (!item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.bottom > listRect.bottom - 6) list.scrollTop += itemRect.bottom - listRect.bottom + 6;
    if (itemRect.top < listRect.top + 6) list.scrollTop -= listRect.top - itemRect.top + 6;
  }

  function open(focusOption = false, preferLast = false) {
    dropdownControllers.forEach((controller) => controller.close());
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    const triggerRect = trigger.getBoundingClientRect();
    const availableBelow = innerHeight - triggerRect.bottom - 16;
    const availableAbove = triggerRect.top - 16;
    const desiredHeight = Math.min(232, list.scrollHeight);
    const placeAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
    root.dataset.placement = placeAbove ? 'above' : 'below';
    list.style.maxHeight = `${Math.max(36, Math.min(232, placeAbove ? availableAbove : availableBelow))}px`;
    if (focusOption) {
      const selectedIndex = items.findIndex((item) => item.dataset.value === select.value);
      focusItem(items[selectedIndex >= 0 ? selectedIndex : preferLast ? items.length - 1 : 0]);
    }
  }

  function choose(item) {
    select.value = item.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    if (list.hidden) open(); else close();
  });
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      open(true, event.key === 'ArrowUp' || event.key === 'End');
    } else if (event.key === 'Escape') {
      close();
    }
  });
  items.forEach((item) => item.addEventListener('click', () => choose(item)));
  list.addEventListener('keydown', (event) => {
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusItem(items[(current + delta + items.length) % items.length]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusItem(items[event.key === 'Home' ? 0 : items.length - 1]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (current >= 0) choose(items[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      trigger.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      close();
    }
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target)) close();
  });
  select.addEventListener('change', sync);
  sync();
  return {
    close,
    trigger,
    lock: () => { trigger.disabled = true; select.disabled = true; },
    reset: () => { trigger.disabled = false; select.disabled = false; sync(); },
  };
}

dropdownControllers.push(createDropdown(question1Field), createDropdown(question2Field));

function setStep(nextStep) {
  dropdownControllers.forEach((controller) => controller.close());
  step = nextStep;
  card.dataset.step = String(step);
  card.setAttribute('aria-labelledby', step === 0 ? 'page-title' : 'step-caption');
  steps.forEach((panel, index) => { panel.hidden = index !== step; });
  progressSegments.forEach((segment, index) => { segment.classList.toggle('active', index <= step); });
  caption.textContent = `Step ${step + 1} of 3 · ${stepNames[step]}`;
  caption.focus({ preventScroll: true });
}

function resetSurvey() {
  form.reset();
  nameField.readOnly = false;
  emailField.readOnly = false;
  dropdownControllers.forEach((dropdown) => dropdown.reset());
  form.removeAttribute('data-submitted');
  form.removeAttribute('aria-busy');
  button.disabled = false;
  buttonLabel.textContent = 'Submit response';
  backButtons.forEach((backButton) => { backButton.disabled = false; });
  requestId = undefined;
  submitted = false;
  setStep(0);
}

function validateStep(index) {
  if (index === 0) {
    const name = nameField.value.trim();
    const email = emailField.value.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f]/u.test(name)) {
      showNotice('Enter your name', 'Please enter your name to continue.', nameField);
      return false;
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      showNotice('Check your email', 'Please enter a valid email address to continue.', emailField);
      return false;
    }
    return true;
  }
  const field = index === 1 ? question1Field : question2Field;
  if (!field.value) {
    showNotice('Choose an answer', 'Please select an answer to continue.', dropdownControllers[index - 1].trigger);
    return false;
  }
  return true;
}

form.querySelectorAll('[data-next]').forEach((nextButton) => {
  nextButton.addEventListener('click', () => {
    if (submitted || validateStep(step)) setStep(step + 1);
  });
});
backButtons.forEach((backButton) => {
  backButton.addEventListener('click', () => setStep(step - 1));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || submitted) return;
  if (step < 2) {
    if (validateStep(step)) setStep(step + 1);
    return;
  }
  if (!validateStep(2)) return;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    requestId ??= window.crypto.randomUUID();
    const payload = buildPayload({
      name: nameField.value,
      email: emailField.value,
      question1: question1Field.value,
      question2: question2Field.value,
      website: form.elements.namedItem('website').value,
    }, requestId);

    submitting = true;
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    backButtons.forEach((backButton) => { backButton.disabled = true; });
    buttonLabel.textContent = 'Submitting…';

    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
    });
    const body = await response.json().catch(() => null);

    if (classifyResponse(response.status, body) === 'success') {
      submitted = true;
      form.dataset.submitted = 'true';
      nameField.readOnly = true;
      emailField.readOnly = true;
      dropdownControllers.forEach((dropdown) => dropdown.lock());
      openModal({
        state: 'success',
        title: 'Response saved',
        message: 'Your response has been saved successfully.',
        action: 'Start again',
        returnFocus: caption,
      });
    } else {
      throw new Error('Response was not saved');
    }
  } catch {
    openModal({
      title: 'We could not save your response',
      message: SUBMISSION_ERROR_MESSAGE,
      action: 'Try again',
      returnFocus: button,
    });
  } finally {
    window.clearTimeout(timeout);
    submitting = false;
    form.removeAttribute('aria-busy');
    buttonLabel.textContent = submitted ? 'Response submitted' : 'Submit response';
    button.disabled = submitted;
    backButtons.forEach((backButton) => { backButton.disabled = false; });
  }
});
