# OPG newsletter preferences

A small Vite website for unsubscribing from the OPG newsletter. The browser sends only an opaque recipient token and optional feedback. The n8n workflows resolve the email address from a restricted Google Sheet.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_N8N_WEBHOOK_URL` in `.env.local` to the test or production URL from the n8n **Form Webhook** node. It is a public endpoint, not a secret. The page expects a link like:

```text
http://localhost:5173/?token=OPAQUE_TOKEN&campaign=CAMPAIGN_ID
```

The page removes the token from the visible address bar after loading it. Opening the page never unsubscribes the recipient. Only a POST from the Unsubscribe button does that.

```powershell
npm test
npm run test:browser
npm run build
```

`test:browser` uses an installed Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`; set `CHROME_PATH` if it is elsewhere. The built static site is in `dist/`. The browser test mocks the webhook and does not contact n8n.

## Google Sheets setup

Create a restricted spreadsheet named `OPG Newsletter Preferences` with these two tabs. Put each header in row 1 and use the names exactly as shown.

`Recipients`:

```text
recipient_id,email,token,campaign_id,status,token_created_at,token_expires_at,unsubscribed_at,updated_at
```

`Responses`:

```text
response_key,response_id,recipient_id,email,campaign_id,reason,other_reason,future_contact,unsubscribe_status,unsubscribed_at,feedback_submitted_at,source
```

`response_key` is the stable recipient and campaign lookup key used to update one response row on a retry. Store timestamps as UTC ISO 8601 strings, for example `2026-10-13T05:30:00.000Z`. Format `token`, `recipient_id`, and `response_key` as plain text. Limit sheet access to the OPG operators who need it.

Generate a fresh 256-bit token for each recipient and campaign with `npm run token:new`. Store it only in the `Recipients` sheet and the corresponding personalized newsletter link. Do not put real recipient data or tokens in this repository. When the email platform has its own secure unsubscribe token, its integration may replace this token generation step after the n8n lookup is adapted.

For this MVP, keep one `Recipients` row per person and keep `status` unsubscribed across later campaigns. If OPG instead creates one row per campaign, its send process must check recipient-level suppression across all rows; a newer `subscribed` row must never override an earlier unsubscribe.

## n8n setup

The files in `automation/` are importable workflow templates. Run `npm run workflows:build` after changing their source.

1. Import `automation/newsletter-preferences.workflow.json`, `automation/one-click-unsubscribe.workflow.json`, and `automation/error-alert.workflow.json` into n8n. They start inactive.
2. In every Google Sheets node, replace `REPLACE_WITH_SPREADSHEET_ID` with the new spreadsheet ID and select an OPG Google Sheets credential. Confirm each node points to its named tab and that the column mappings load correctly.
3. In **Form Webhook**, set **Allowed Origins (CORS)** to the actual HTTPS form origin. The template uses `https://preferences.opg.com`; change it if the deployed domain differs.
4. In the error workflow, set the internal recipient, a verified sender address, and SMTP credentials in **Email Internal Owner**. Its content deliberately omits tokens, email addresses, and form answers. Set both unsubscribe workflows’ **Error workflow** setting to this workflow.
5. Test a recipient row through the n8n test webhook. Check blank feedback, every dropdown value, an invalid or expired token, repeated submissions, and a Sheets failure. Then publish the workflows and switch `.env.local` to the production form webhook URL.

The browser sends a JSON string with `Content-Type: text/plain;charset=UTF-8`. This is intentional: it avoids a cross-origin `OPTIONS` preflight. The **Validate Request** Code node parses the string as JSON and validates the same fields described in `IMPLEMENTATION_PLAN.md`. If OPG places a same-origin proxy in front of n8n later, the transport can switch to `application/json` while keeping the JSON payload unchanged. n8n still needs the form origin in its CORS setting so the browser can read the response.

The form workflow checks the token, optional expiry, and campaign before it updates `Recipients` and upserts `Responses`. A repeat request preserves the original unsubscribe timestamp and response ID. Google Sheets has no transaction across the two tabs; if the response write fails after the status update, the user can retry and the same response key is used. Concurrent requests for the same token should also be limited at the hosting or proxy layer because Sheets upsert is not atomic.

## Newsletter sending and one-click header

The email platform must suppress recipients whose `Recipients.status` is `unsubscribed` before any later campaign. Connect its suppression or unsubscribe mechanism to this status (or make the sheet its authoritative send list). Without this integration, updating Google Sheets alone cannot guarantee that newsletter emails stop. The exact connection depends on OPG’s newsletter provider.

Configure the newsletter platform’s one-click headers to POST to the separate workflow. For example, replace the domain and personalization fields below with OPG’s real values:

```text
List-Unsubscribe: <https://automation.opg.example/webhook/opg-one-click-unsubscribe?token={{recipient_token}}&campaign={{campaign_id}}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The one-click workflow requires an intentional POST containing `List-Unsubscribe=One-Click`; a normal GET does nothing. It updates the recipient status without asking for feedback. Keep the visible newsletter link pointed to the branded page.

## Deployment checklist

- Set the production n8n webhook URL at build time and deploy `dist/` to HTTPS static hosting.
- Use the deployed form origin in n8n CORS. Set rate limits at the hosting or reverse-proxy layer when available.
- Verify the Google credential, spreadsheet access, email alert credential, and n8n error workflow.
- Confirm the email platform actually suppresses unsubscribed recipients and sends the one-click headers.
- Run a small internal email test through both the branded page and the one-click POST before a public send.
- Define feedback retention and keep n8n execution data retention short.
- Restrict access to n8n error executions and prune them promptly; they can contain recipient data needed for troubleshooting.

No production accounts, recipient list, email platform, domain, or n8n URL are configured in this repository.
