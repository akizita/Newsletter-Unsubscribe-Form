import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const viewports = [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 320, height: 480 },
  { width: 667, height: 375 },
];

async function assertFits(page, label, selector = '.survey-card') {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate((target) => {
      const element = document.querySelector(target);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        content: element.scrollHeight,
        height: element.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth,
        innerHeight,
      };
    }, selector);
    const size = `${viewport.width}x${viewport.height} ${label}`;
    assert.ok(layout.top >= -1, `${size}: top is visible (${layout.top})`);
    assert.ok(layout.bottom <= layout.innerHeight + 1, `${size}: bottom is visible (${layout.bottom})`);
    assert.ok(layout.content <= layout.height + 1, `${size}: content fits (${layout.content}/${layout.height})`);
    assert.ok(layout.scrollWidth <= layout.innerWidth, `${size}: no horizontal overflow`);
    assert.ok(layout.scrollHeight <= layout.innerHeight, `${size}: no vertical overflow`);
  }
}

async function acknowledgePrivacy(page, captureCheckedState = false) {
  assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'privacy');
  await page.locator('#privacy-content').evaluate((content) => { content.scrollTop = content.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#privacy-ack').disabled);
  await page.locator('#privacy-ack').check();
  assert.match(await page.locator('#privacy-ack').evaluate((input) => getComputedStyle(input).backgroundImage), /data:image\/svg\+xml/);
  if (captureCheckedState) {
    await page.locator('.modal-panel').evaluate((panel) => {
      for (const animation of panel.getAnimations({ subtree: true })) {
        if (animation.effect?.getTiming().iterations === 1) animation.finish();
      }
    });
    await page.screenshot({ path: join('test-artifacts', 'survey-privacy-checked-mobile-320.png') });
  }
  await page.getByRole('button', { name: 'Confirm and submit' }).click();
}

async function assertSplashFits(page) {
  const splashViewports = [
    ...viewports,
    { width: 280, height: 480 },
    { width: 280, height: 375 },
    { width: 599, height: 600 },
    { width: 600, height: 600 },
    { width: 768, height: 1024 },
    { width: 900, height: 600 },
    { width: 901, height: 601 },
    { width: 2560, height: 1080 },
    { width: 3440, height: 1440 },
  ];
  for (const viewport of splashViewports) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#splash-screen').classList.contains('is-animating'));
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('32px Heavitas')), true, 'Heavitas webfont loads');
    await page.locator('.splash-content').evaluate((panel) => {
      for (const animation of panel.getAnimations({ subtree: true })) {
        if (animation.effect?.getTiming().iterations === 1) animation.finish();
      }
    });
    const layout = await page.locator('.splash-content').evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      const wordmark = panel.querySelector('.splash-wordmark');
      const mark = panel.querySelector('.splash-mark');
      const style = getComputedStyle(panel);
      return {
        top: rect.top, bottom: rect.bottom, content: panel.scrollHeight, height: panel.clientHeight, innerHeight,
        wordmarkWidth: wordmark.clientWidth, wordmarkContent: wordmark.scrollWidth,
        wordmarkFont: getComputedStyle(wordmark).fontFamily,
        markRight: mark.getBoundingClientRect().right, wordmarkLeft: wordmark.getBoundingClientRect().left,
        markWidth: mark.getBoundingClientRect().width, wordmarkHeight: wordmark.getBoundingClientRect().height,
        subtextLeft: panel.querySelector('.splash-subtext').getBoundingClientRect().left,
        borderWidth: style.borderTopWidth, boxShadow: style.boxShadow,
      };
    });
    assert.ok(layout.top >= -1 && layout.bottom <= layout.innerHeight + 1, `${viewport.width}x${viewport.height} splash is visible`);
    assert.ok(Math.abs((layout.top + layout.bottom) / 2 - layout.innerHeight / 2) <= 2, `${viewport.width}x${viewport.height} splash is centered (${layout.top}/${layout.bottom}/${layout.innerHeight})`);
    assert.ok(layout.content <= layout.height + 4, `${viewport.width}x${viewport.height} splash content fits (${layout.content}/${layout.height})`);
    assert.ok(layout.wordmarkContent <= layout.wordmarkWidth + 1, `${viewport.width}x${viewport.height} wordmark fits`);
    assert.match(layout.wordmarkFont, /Heavitas/, `${viewport.width}x${viewport.height} splash uses Heavitas`);
    assert.ok(layout.markRight <= layout.wordmarkLeft + 1, `${viewport.width}x${viewport.height} brand has no overlap`);
    assert.ok(Math.abs(layout.subtextLeft - layout.wordmarkLeft) <= 1, `${viewport.width}x${viewport.height} subtitle aligns with wordmark`);
    assert.equal(layout.borderWidth, '0px', `${viewport.width}x${viewport.height} splash has no card border`);
    assert.equal(layout.boxShadow, 'none', `${viewport.width}x${viewport.height} splash has no card shadow`);
    assert.ok(layout.markWidth >= (viewport.width >= 1000 ? 180 : 75), `${viewport.width}x${viewport.height} logo is prominent`);
    assert.ok(layout.markWidth > layout.wordmarkHeight, `${viewport.width}x${viewport.height} logo is larger than the two-line wordmark`);
    if ([1366, 667, 280, 768, 2560, 3440].includes(viewport.width) || (viewport.width === 390 && viewport.height === 844)) {
      await page.screenshot({ path: join('test-artifacts', `survey-splash-full-${viewport.width}.png`) });
    }
  }
}

test('responsive survey uses custom dropdowns and modals while preserving saved answers', { skip: !existsSync(chromePath) }, async () => {
  const payloads = [];
  const secret = 'browser-test-secret-32-characters-long';
  const n8n = createHttpServer(async (request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/webhook-test/mock-survey');
    assert.equal(request.headers['x-opg-survey-key'], secret);
    assert.match(request.headers['content-type'], /^application\/json/i);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    payloads.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = payloads.length === 1 ? 500 : 200;
    response.end(JSON.stringify(payloads.length === 1 ? { ok: false } : { ok: true, status: 'saved' }));
  });
  await new Promise((resolve) => n8n.listen(0, '127.0.0.1', resolve));
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${n8n.address().port}/webhook-test/mock-survey`;
  process.env.N8N_WEBHOOK_SECRET = secret;
  const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    const browserRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname !== '/api/submit') return;
      browserRequests.push({ url: request.url(), headers: request.headers(), body: JSON.parse(request.postData()) });
    });

    let legacySplashRequests = 0;
    await page.route('**/assets/opg-afterfx*', (route) => {
      legacySplashRequests += 1;
      return route.abort();
    });
    await page.goto(server.resolvedUrls.local[0]);
    mkdirSync('test-artifacts', { recursive: true });
    assert.equal(await page.locator('#splash-screen').isVisible(), true);
    assert.equal(await page.locator('#skip-splash').count(), 0);
    assert.equal(await page.locator('.splash-progress').count(), 0);
    assert.equal(await page.locator('#splash-video, .splash-poster').count(), 0, 'the splash has no video or poster element');
    assert.deepEqual(await page.locator('.splash-wordmark span').allTextContents(), ['Outsourced', 'Pro Global']);
    assert.equal(await page.locator('.splash-subtext').textContent(), "We're ready to hear what matters to you.");
    await assertSplashFits(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#splash-screen').classList.contains('is-animating'));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.splash-content')).opacity) > .9);
    assert.equal(await page.locator('.splash-content').isVisible(), true, 'the logo artwork appears on every screen');
    assert.equal(await page.locator('.splash-mark-light').evaluate((img) => img.naturalWidth > 0), true);
    assert.equal(await page.locator('.splash-mark-gold').evaluate((img) => img.naturalWidth > 0), true);
    const logoBounds = await page.locator('.splash-mark img').evaluateAll((images) => images.map((image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      return { width: canvas.width, height: canvas.height, left, top, right, bottom };
    }));
    assert.deepEqual(logoBounds[0], logoBounds[1], 'white and gold logo have identical visible bounds');
    await page.locator('.splash-content').evaluate((panel) => {
      for (const animation of panel.getAnimations({ subtree: true })) {
        if (animation.effect?.getTiming().iterations === 1) animation.finish();
      }
    });
    await page.screenshot({ path: join('test-artifacts', 'survey-splash-final-mobile-390.png') });
    assert.equal(await page.locator('.splash-mark-gold').evaluate((img) => Number(getComputedStyle(img).opacity) > .9), true);
    assert.equal(await page.locator('.splash-mark-light').evaluate((img) => Number(getComputedStyle(img).opacity) < .1), true);
    const wordmark = await page.locator('.splash-lockup').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const panel = element.closest('.splash-content').getBoundingClientRect();
      return { opacity: Number(getComputedStyle(element).opacity), filter: getComputedStyle(element).filter, right: rect.right, panelRight: panel.right };
    });
    assert.equal(wordmark.opacity > .9, true);
    assert.equal(wordmark.filter, 'none', 'small-screen artwork does not animate a blur filter');
    assert.equal(wordmark.right <= wordmark.panelRight + 1, true);
    await page.locator('#splash-screen').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.survey-card').evaluate((card) => card.inert), false);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#splash-screen').classList.contains('is-animating'));
    assert.equal(await page.locator('#splash-video, .splash-poster').count(), 0);
    assert.equal(await page.locator('.splash-lockup').evaluate((element) => getComputedStyle(element).filter), 'none');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#splash-screen').waitFor({ state: 'hidden', timeout: 3500 });
    assert.equal(legacySplashRequests, 0, 'no screen size requests the former video or poster');
    assert.equal(await page.locator('.survey-card').evaluate((card) => card.inert), false);
    const formRendering = await page.locator('.survey-card').evaluate((card) => ({
      blur: getComputedStyle(card).backdropFilter,
      borderAnimation: getComputedStyle(card, '::before').animationName,
    }));
    assert.deepEqual(formRendering, { blur: 'none', borderAnimation: 'none' }, 'the form has no ongoing blur or border repaint');
    assert.match(await page.locator('#page-title').evaluate((title) => getComputedStyle(title).fontFamily), /Heavitas/);
    assert.equal(await page.locator('.brand img').evaluate((img) => img.naturalWidth > 0), true);
    assert.equal(await page.getByText(/unsubscribe/i).count(), 0);
    assert.equal(await page.locator('#name').getAttribute('placeholder'), 'Enter your full name');
    assert.equal(await page.locator('label[for="email"]').textContent(), 'Work Email');
    assert.equal(await page.locator('#email').getAttribute('placeholder'), 'you@company.com');
    await page.setViewportSize({ width: 1366, height: 768 });
    assert.equal(Math.round(await page.locator('.survey-card').evaluate((card) => card.getBoundingClientRect().width)), 800);
    const heading = await page.locator('#page-title').evaluate((title) => ({
      height: title.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(title).lineHeight),
      scrollWidth: title.scrollWidth,
      clientWidth: title.clientWidth,
    }));
    assert.ok(heading.height <= heading.lineHeight + 1, 'desktop heading stays on one line');
    assert.ok(heading.scrollWidth <= heading.clientWidth, 'desktop heading fits within the card');
    await assertFits(page, 'details');
    await page.setViewportSize({ width: 390, height: 844 });
    const fieldType = await page.evaluate(() => ({
      label: parseFloat(getComputedStyle(document.querySelector('label[for="name"]')).fontSize),
      input: parseFloat(getComputedStyle(document.querySelector('#name')).fontSize),
    }));
    assert.ok(fieldType.label >= 15, 'form labels are readable on mobile');
    assert.ok(fieldType.input >= 16, 'input text is readable on mobile');
    await page.screenshot({ path: join('test-artifacts', 'survey-mobile-390.png') });

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#modal-title').evaluate((title) => getComputedStyle(title).fontFamily), /Heavitas/);
    assert.match(await page.locator('#modal-title').textContent(), /Enter your name/);
    assert.equal(await page.locator('.survey-card').evaluate((card) => card.inert), true);
    await assertFits(page, 'validation modal', '.modal-panel');
    await page.getByRole('button', { name: 'OK' }).click();
    assert.equal(await page.locator('#feedback-modal').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'name');

    await page.locator('#name').fill('   ');
    await page.locator('#email').fill('person@example.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Enter your name/);
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('#name').fill('Example Person');
    await page.locator('#email').fill('person@example');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Check your work email/);
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('#email').fill('person@example.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#step-caption').textContent(), /Step 2 of 3/);
    await assertFits(page, 'reason');

    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Choose an answer/);
    await page.getByRole('button', { name: 'OK' }).click();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.locator('#question1-trigger').click();
      const menu = await page.locator('#question1-list').evaluate((list) => {
        const rect = list.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, innerHeight };
      });
      assert.ok(menu.top >= -1 && menu.bottom <= menu.innerHeight + 1, `${viewport.width}x${viewport.height}: dropdown fits the screen`);
      await page.locator('#question1-trigger').click();
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.locator('#question1-trigger').click();
    assert.equal(await page.locator('#question1-list').isVisible(), true);
    const listRadius = await page.locator('#question1-list').evaluate((list) => getComputedStyle(list).borderRadius);
    assert.notEqual(listRadius, '0px');
    const chosenReason = page.getByRole('option', { name: 'We currently handle this in-house.' });
    await chosenReason.hover();
    assert.match(await chosenReason.evaluate((option) => getComputedStyle(option).backgroundImage), /linear-gradient/);
    await page.screenshot({ path: join('test-artifacts', 'survey-dropdown-desktop-1366.png') });
    await chosenReason.click();
    assert.equal(await page.locator('#question1').inputValue(), 'We currently handle this in-house.');
    assert.match(await page.locator('#question1-display').textContent(), /in-house/);
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#step-caption').textContent(), /Step 3 of 3/);
    await assertFits(page, 'future interest');
    await page.getByRole('button', { name: 'Back' }).click();
    assert.equal(await page.locator('#question1').inputValue(), 'We currently handle this in-house.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#question2-trigger').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#question2').inputValue(), 'Unsure');

    await page.setViewportSize({ width: 320, height: 480 });
    await page.locator('#question2-trigger').click();
    await page.getByRole('option', { name: 'No' }).click();
    assert.equal(await page.locator('#question2').inputValue(), 'No');
    await page.locator('#question2-trigger').click();
    await page.getByRole('option', { name: 'Unsure' }).click();
    await page.screenshot({ path: join('test-artifacts', 'survey-mobile-short-320.png') });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: join('test-artifacts', 'survey-desktop-1366.png') });
    assert.match(await page.locator('#submit-button').evaluate((button) => getComputedStyle(button).backgroundImage), /linear-gradient/);
    assert.match(await page.locator('.back-button').last().evaluate((button) => getComputedStyle(button).backgroundImage), /linear-gradient/);
    assert.equal(await page.locator('button').evaluateAll((buttons) => buttons.some((button) => button.textContent.includes('→'))), false);

    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole('button', { name: 'Submit response' }).click();
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'privacy');
    assert.match(await page.locator('#privacy-content').textContent(), /By submitting this form, you authorize Outsourced Pro Global/);
    assert.equal(await page.locator('#privacy-content li').count(), 3);
    assert.equal(payloads.length, 0, 'opening the privacy step does not submit');
    assert.equal(await page.locator('#privacy-ack').isDisabled(), true);
    assert.equal(await page.locator('#privacy-confirm').isDisabled(), true);
    await page.locator('.modal-panel').evaluate((panel) => {
      for (const animation of panel.getAnimations({ subtree: true })) {
        if (animation.effect?.getTiming().iterations === 1) animation.finish();
      }
    });
    await page.screenshot({ path: join('test-artifacts', 'survey-privacy-modal-mobile-320.png') });
    await assertFits(page, 'privacy modal', '.modal-panel');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#feedback-modal').isVisible(), false);
    assert.equal(payloads.length, 0, 'closing the privacy step does not submit');
    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole('button', { name: 'Submit response' }).click();
    assert.equal(await page.locator('#privacy-ack').isDisabled(), true, 'reopening starts before acknowledgment');
    assert.equal(await page.locator('#privacy-content').evaluate((content) => content.scrollTop), 0);
    await acknowledgePrivacy(page, true);
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#modal-title').textContent(), /could not save/);
    assert.equal(payloads.length, 1);
    assert.equal(browserRequests.length, 1);
    assert.equal(new URL(browserRequests[0].url).origin, new URL(server.resolvedUrls.local[0]).origin);
    assert.match(browserRequests[0].headers['content-type'], /^application\/json/i);
    assert.equal(Object.hasOwn(browserRequests[0].headers, 'x-opg-survey-key'), false);
    assert.equal(Object.hasOwn(browserRequests[0].body, 'requestId'), true);
    assert.equal(Object.hasOwn(browserRequests[0].body, 'responseId'), false);
    assert.equal(payloads[0].name, 'Example Person');
    assert.equal(payloads[0].email, 'person@example.com');
    assert.equal(payloads[0].question2, 'Unsure');
    assert.equal(Object.hasOwn(payloads[0], 'token'), false);
    await page.getByRole('button', { name: 'Try again' }).click();
    assert.equal(await page.getByRole('button', { name: 'Submit response' }).isEnabled(), true);

    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'success');
    assert.equal(await page.locator('#modal-message').textContent(), 'The contact record of your organization has been updated, and all further outreach will pause immediately.');
    assert.equal(await page.locator('.modal-success-icon').isVisible(), true);
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].responseId, payloads[1].responseId, 'retry must update one row');
    assert.equal(await page.locator('#survey-form').isVisible(), true, 'answers remain behind the modal');
    await assertFits(page, 'success modal', '.modal-panel');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join('test-artifacts', 'survey-success-modal-mobile-390.png') });
    await page.getByRole('button', { name: 'Done' }).click();
    assert.equal(await page.locator('#feedback-modal').isVisible(), false);
    assert.equal(await page.locator('#survey-form').isVisible(), true);
    assert.match(await page.locator('#step-caption').textContent(), /Step 1 of 3/);
    assert.equal(await page.locator('#name').inputValue(), '');
    assert.equal(await page.locator('#email').inputValue(), '');
    assert.equal(await page.locator('#question1').inputValue(), '');
    assert.equal(await page.locator('#question2').inputValue(), '');
    assert.equal(await page.locator('#question1-display').textContent(), 'Select an answer');
    assert.equal(await page.locator('#question2-trigger').isEnabled(), true);
    assert.equal(await page.locator('#name').getAttribute('readonly'), null);
    assert.equal(await page.locator('#survey-form').getAttribute('data-submitted'), null);
    assert.equal(payloads.length, 2);

    await page.locator('#name').fill('Another Person');
    await page.locator('#email').fill('another@example.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#question1-trigger').click();
    await page.getByRole('option', { name: 'Not a priority at this time.' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#question2-trigger').click();
    await page.getByRole('option', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'success');
    assert.equal(await page.locator('#modal-message').textContent(), 'The contact record of your organization has been updated, and all further outreach will pause immediately.');
    assert.equal(payloads.length, 3);
    assert.notEqual(payloads[2].responseId, payloads[1].responseId, 'a new survey needs a new response ID');
    assert.equal(payloads[2].email, 'another@example.com');

    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('#name').fill('Third Person');
    await page.locator('#email').fill('third@company.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#question1-trigger').click();
    await page.getByRole('option', { name: 'Not a priority at this time.' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#question2-trigger').click();
    await page.getByRole('option', { name: 'No' }).click();
    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#modal-message').textContent(), 'The contact record of your organization has been updated, and all further outreach will cease immediately.');
    assert.equal(payloads.length, 4);

    const laptopPage = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
    let laptopMediaRequests = 0;
    await laptopPage.route('**/assets/opg-afterfx*', (route) => {
      laptopMediaRequests += 1;
      return route.abort();
    });
    await laptopPage.goto(server.resolvedUrls.local[0]);
    assert.equal(await laptopPage.evaluate(() => devicePixelRatio), 2);
    assert.equal(await laptopPage.locator('#splash-screen').evaluate((screen) => screen.classList.contains('is-animating')), true);
    await laptopPage.waitForTimeout(1400);
    await laptopPage.screenshot({ path: join('test-artifacts', 'survey-splash-laptop-dpr2.png') });
    await laptopPage.locator('#splash-screen').waitFor({ state: 'hidden', timeout: 3500 });
    assert.equal(laptopMediaRequests, 0, 'high-DPI laptop view does not request video or poster');
    await laptopPage.close();

    const touchPage = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
    let touchMediaRequests = 0;
    await touchPage.route('**/assets/opg-afterfx*', (route) => {
      touchMediaRequests += 1;
      return route.abort();
    });
    await touchPage.goto(server.resolvedUrls.local[0]);
    assert.equal(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    assert.equal(await touchPage.locator('#splash-screen').evaluate((screen) => screen.classList.contains('is-animating')), true, 'touch devices use the same splash');
    await touchPage.locator('#splash-screen').waitFor({ state: 'hidden' });
    assert.equal(touchMediaRequests, 0);
    await touchPage.close();

    const reducedMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await reducedMotionPage.goto(server.resolvedUrls.local[0]);
    await reducedMotionPage.locator('#splash-screen').waitFor({ state: 'hidden' });
    assert.equal(await reducedMotionPage.locator('.survey-card').evaluate((element) => element.inert), false);
    assert.equal(await reducedMotionPage.locator('#splash-screen').evaluate((screen) => screen.classList.contains('is-animating')), false);
    assert.ok(await reducedMotionPage.locator('[data-form-step="0"]').evaluate((panel) => parseFloat(getComputedStyle(panel).animationDuration) < .01));
    await reducedMotionPage.close();
  } finally {
    await browser.close();
    await server.close();
    await new Promise((resolve) => n8n.close(resolve));
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
  }
});
