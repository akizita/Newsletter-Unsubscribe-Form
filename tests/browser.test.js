import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const webhook = 'https://n8n.example/webhook/opg-newsletter-preferences';

test('browser flow at 320px: optional feedback, retry, success and invalid link', { skip: !existsSync(chromePath) }, async () => {
  process.env.VITE_N8N_WEBHOOK_URL = webhook;
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const baseUrl = server.resolvedUrls.local[0];
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
    let requests = 0;
    let payload;
    await page.route(webhook, async (route) => {
      requests += 1;
      assert.match(route.request().headers()['content-type'], /^text\/plain/i);
      payload = JSON.parse(route.request().postData());
      await route.fulfill({
        status: requests === 1 ? 500 : 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(requests === 1 ? { ok: false } : { ok: true, status: 'unsubscribed' }),
      });
    });

    await page.goto(`${baseUrl}?token=browser-test-token&campaign=oct-2026`);
    assert.equal(requests, 0, 'GET must not unsubscribe');
    assert.equal(await page.locator('#preference-form').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal overflow at 320px');
    assert.equal(new URL(page.url()).searchParams.has('token'), false, 'token removed from address bar');

    mkdirSync('test-artifacts', { recursive: true });
    await page.screenshot({ path: join('test-artifacts', 'mobile-320.png'), fullPage: true });

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'reason');
    await page.locator('#reason').selectOption({ label: 'Other' });
    assert.equal(await page.locator('#other-reason-field').isVisible(), true);
    await page.locator('#other-reason').fill('Useful feedback');
    await page.locator('#reason').selectOption('');
    assert.equal(await page.locator('#other-reason-field').isVisible(), false);
    assert.equal(await page.locator('#other-reason').inputValue(), '');

    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(requests, 1);
    assert.equal(payload.reason, '');
    assert.equal(payload.futureContact, '');
    assert.equal(Object.hasOwn(payload, 'email'), false);
    assert.match(await page.getByRole('alert').textContent(), /try again/i);
    assert.equal(await page.getByRole('button', { name: 'Unsubscribe' }).isEnabled(), true);

    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await page.getByText('You’re all set').waitFor();
    assert.equal(requests, 2);
    assert.equal(await page.locator('#preference-form').isVisible(), false);

    const missingLink = await browser.newPage();
    await missingLink.goto(baseUrl);
    assert.equal(await missingLink.getByText('We can’t use this link').isVisible(), true);
    assert.equal(await missingLink.locator('#preference-form').isVisible(), false);
    await missingLink.close();

    const invalidLink = await browser.newPage();
    await invalidLink.route(webhook, async (route) => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' }));
    await invalidLink.goto(`${baseUrl}?token=invalid-token`);
    await invalidLink.getByRole('button', { name: 'Unsubscribe' }).click();
    await invalidLink.getByText('We can’t use this link').waitFor();
    await invalidLink.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
