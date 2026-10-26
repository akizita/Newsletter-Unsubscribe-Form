# OPG services survey

This is a public, three-step survey for a name, work email address, and two fixed-choice answers. It records responses in Google Sheets through n8n. The form labels the email field as Work Email. Submitting the final step opens a data privacy modal; the user must scroll through the notice and acknowledge it before the request is sent. After a successful save, the confirmation says outreach will pause for Yes or Unsure and cease for No.

The splash plays the four-second `OPG_AfterFX` animation on every screen size. The browser selects a 540×960 portrait, 960×540 compact, or 1280×720 desktop H.264 file from `public/assets/` based on the viewport. These files preserve the animation from `Asset/OPG_AfterFX.mov` through the earlier black-background web version, while decoding far fewer pixels than the former 1920×1080 file. The splash uses a plain black background and no video blend filter. If playback fails, the logo images provide a short fallback; reduced-motion visitors proceed directly to the form. The form uses static backgrounds instead of continuously animated borders and backdrop blur to keep rendering consistent across displays.

**Operational requirement:** The workflow in this repository only saves the response. It does not unsubscribe anyone, update a separate organization contact record, or stop Gmail outreach automatically. Connect the saved answers to the actual suppression and outreach systems before deploying the new confirmation wording; otherwise the confirmation promises an action the application cannot verify. The Work Email label is guidance, not proof of business ownership or a restriction on email domains.

## Architecture

```text
Browser → same-origin POST /api/submit → Vercel function → authenticated n8n production webhook → Google Sheets Responses tab
```

The browser receives only a generic success or error. The n8n URL and authentication secret belong in server-only environment variables. The frontend must never use a `VITE_` variable for either one. The function checks the request, limits its size, and gives retries of the same answer a stable `response_id`. The n8n workflow checks the payload again before writing the Sheet row.

## Local development and tests

1. Use Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env.local` and set `N8N_WEBHOOK_URL` to an HTTPS n8n **Test URL** (`/webhook-test/`) or a published **Production URL** (`/webhook/`). Set `N8N_WEBHOOK_SECRET` to the same random value as the n8n Header Auth credential (at least 32 characters). Do not add a `VITE_` prefix. Keep `.env.local` private. Vercel production accepts only the published `/webhook/` URL.
3. For a Test URL, click **Execute workflow** in n8n so the entire workflow listens, then submit the form while that listener is active. A test listener can be used for one call and may expire; start it again for another submission. Run `npm run dev` and visit `http://localhost:5173`. Vite provides a local `/api/submit` adapter for development; Vite itself is not the production host. Restart Vite after changing `.env.local`.
4. Run `npm test` and `npm run test:browser`. The browser test uses a local mocked n8n endpoint and does not add a real Sheet row.

The Vite preview server is for local preview only. Deploy the built `dist` site with the `api/submit.js` Vercel function.

## Required production setup

These account changes cannot be made by importing this repository alone:

1. **Replace the exposed webhook.** Disable or delete the old public workflow and its `/webhook-test/` endpoint. Import the new `automation/survey-responses.workflow.json` template, which uses `opg-services-survey-secure-v2`. Remove the old URL from any existing site deployment by redeploying. Treat historical copies of the old URL as exposed.
2. **Configure n8n.** Create a Header Auth credential with header name `X-OPG-Survey-Key` and a new random value of at least 32 characters. Attach it to **Survey Webhook**. Set the **Save Response** Google Sheets credential and spreadsheet ID. Ensure the `Responses` tab has these exact columns: `response_id,email,name,question1,question2,submitted_at`. Run the **whole workflow** with the Test URL before deployment, then publish it and copy its **Production URL** (`/webhook/`, never `/webhook-test/`) for Vercel. The workflow template does not include credentials.
3. **Configure Vercel.** Import this repository as a Vite project with build command `npm run build` and output directory `dist`. Keep `api/submit.js` in the deployed project. Set `N8N_WEBHOOK_URL` to the new n8n Production URL and `N8N_WEBHOOK_SECRET` to the Header Auth value in Vercel's server environment settings. Do not create `VITE_N8N_WEBHOOK_URL`. Deploy over HTTPS. Set separate server environment values for Preview if Preview submissions are needed.
4. **Configure abuse controls in Vercel Firewall.** In **Firewall → Configure → New Rule**, match path `/api/submit` and method `POST`; choose **Rate Limit**, a **Fixed Window** of 10 requests per 10 minutes per IP, and a 429 response. Publish the rule. Review the Firewall counts and the function's fixed-category outcomes (`saved`, `invalid_input`, `honeypot`, `upstream_failure`, etc.) and tune the limit for legitimate traffic. Do not add contact details, request bodies, or secrets to logs. A honeypot alone does not stop automated submissions.
5. **Restrict data access.** Allow only staff who need it to view the n8n workflow, credentials, and Google Sheet. The template disables saved success, error, and manual n8n executions; confirm those settings after import and check any instance-wide overrides or separate error workflow. Never send full submission data to a Slack alert.
6. **Verify before sharing.** Submit a test response on the deployed HTTPS site. Confirm the browser calls only `/api/submit`, receives success after the Sheet row appears, and has no n8n URL or secret in its network requests or built files. Check the deployed CSP and security headers. Delete the test row manually. The mocked browser test also covers a failed upstream response followed by a retry with the same `response_id`.

The `Responses` Sheet rows are retained **until staff manually delete them**, as requested. There is no automatic row deletion. Review access and old rows periodically. Consider Sheets backups and exports as part of the same manual retention policy.

## Limits and operational notes

- Names and email addresses are self-reported. The form has no email ownership verification.
- The stable `response_id` and Sheets **Append or Update Row** reduce duplicate rows on sequential retries. Concurrent requests can still race because Google Sheets is not a transactional uniqueness store.
- Vercel's IP rate limiting is a proportionate first layer for an anonymous form, not a guarantee against distributed abuse. The function does not retain IP addresses.
- The server returns generic errors; check n8n and Vercel operational logs for a failed write. Keep those logs free of personal data.
- The bundled Heavitas font may need a separate website-use license from its author before public deployment; confirm the license for your use.

To regenerate the n8n import file after changing workflow logic, run `npm run workflows:build` and re-import/review it in n8n.
