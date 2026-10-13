# OPG Newsletter Unsubscribe Form — Implementation Plan

## 1. Project summary

Build a lightweight, responsive website for people who want to unsubscribe from OPG newsletter emails and optionally explain why.

The site will:

- Identify the recipient securely from their newsletter link.
- Allow the recipient to unsubscribe without entering their email address.
- Collect the recipient's reason for unsubscribing.
- Ask whether OPG may contact them again if the hiring landscape changes.
- Send the recipient's email and answers to an n8n webhook.
- Store the result in Google Sheets.
- Use a modern glassmorphism design based on OPG's yellow, black, white, and dark-gray palette.

No application database or heavy frontend framework is required.

---

## 2. Recommended user flow

### Newsletter email

Each recipient receives a personalized preference link:

```text
https://preferences.opg.com/?token={{recipient_token}}&campaign={{campaign_id}}
```

The token must identify the recipient without putting their raw email address in the URL.

### Preference page

1. The page reads `token` and `campaign` from the URL.
2. The recipient is shown a clear unsubscribe action.
3. The two feedback questions are displayed as optional fields.
4. The recipient clicks **Unsubscribe**.
5. The frontend sends the token and answers to n8n.
6. n8n validates the token and retrieves the recipient's email.
7. n8n records the unsubscribe and feedback in Google Sheets.
8. The page displays a success message.

The unsubscribe must still succeed when the recipient does not answer the feedback questions.

### Recommended success message

> You're all set. You will no longer receive OPG newsletter emails. Thank you for helping us improve our outreach.

---

## 3. Form content

### Question 1

**Label:** What made you unsubscribe today?

**Control:** Dropdown

**Options:**

- Not looking for opportunities or talent right now
- The content is not relevant to me
- I receive emails too often
- I have already found a role or filled my hiring need
- I prefer another communication channel
- I do not remember subscribing
- Other

When **Other** is selected, display an optional textarea:

```text
Please tell us a little more
```

### Question 2

**Label:** If the hiring landscape changes, may OPG contact you again?

**Control:** Dropdown

**Options:**

- Yes
- No

**Supporting text:**

> Choosing “Yes” records your future contact preference. It does not resubscribe you to the newsletter today.

### Primary action

```text
Unsubscribe
```

If at least one answer is selected, the same action can submit the feedback together with the unsubscribe request.

---

## 4. Recommended technology stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Vite for local development and production builds

Avoid React, Next.js, a component library, and a CSS framework for this project. The page is small enough to maintain with plain HTML, CSS, and JavaScript.

### Automation and storage

- n8n production webhook
- Google Sheets
- Google Sheets credentials stored only in n8n

### Hosting

Use any static hosting service that supports HTTPS:

- Cloudflare Pages
- Netlify
- Vercel
- Existing OPG web hosting

### Browser support

Support the latest two versions of:

- Chrome
- Edge
- Firefox
- Safari
- Mobile Safari
- Chrome for Android

---

## 5. High-level architecture

```text
OPG newsletter
      |
      | Personalized URL with opaque recipient token
      v
Static HTML/CSS/JavaScript form
      |
      | HTTPS POST with token and responses
      v
n8n production webhook
      |
      | Validate token and normalize fields
      v
Google Sheets
      |
      v
n8n JSON response
      |
      v
Success or error state in the browser
```

Secrets, Google credentials, and recipient lookup logic must remain in n8n. They must not be included in frontend JavaScript.

---

## 6. Suggested project structure

```text
opg-newsletter-preferences/
├── index.html
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── public/
│   └── assets/
│       └── opg-logo.png
└── src/
    ├── main.js
    └── styles.css
```

Copy the supplied OPG logo into:

```text
public/assets/opg-logo.png
```

### Environment variable

`.env.example`

```text
VITE_N8N_WEBHOOK_URL=https://your-n8n-domain.example/webhook/opg-newsletter-preferences
```

The webhook URL is not a secret. Authentication and recipient validation must use the recipient token, not a secret embedded in the frontend.

---

## 7. UI and visual design specification

### Color palette

```css
--color-yellow: #f4b512;
--color-black: #080808;
--color-surface: #151515;
--color-surface-light: #222222;
--color-white: #ffffff;
--color-text-muted: #b8b8b8;
--color-border: rgba(255, 255, 255, 0.12);
```

Adjust the yellow after sampling the final logo asset if necessary.

### Glassmorphism card

```css
background: rgba(20, 20, 20, 0.76);
border: 1px solid rgba(255, 255, 255, 0.12);
backdrop-filter: blur(20px);
box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
border-radius: 24px;
```

### Page layout

- Center one form card on a dark gradient background.
- Place the OPG logo at the top of the card or page header.
- Use yellow only for important accents, focus states, status icons, and the primary action.
- Keep the form width between `520px` and `620px` on desktop.
- Use a single-column layout on mobile.
- Maintain at least `16px` horizontal page padding on small screens.

### Responsive breakpoints

```text
Mobile:  320px–639px
Tablet:  640px–1023px
Desktop: 1024px and above
```

### Accessibility requirements

- Use actual `<label>` elements for every field.
- Use native `<select>`, `<textarea>`, and `<button>` controls.
- Ensure text contrast meets WCAG AA.
- Keep keyboard focus indicators visible.
- Use `aria-live="polite"` for the success message.
- Use `role="alert"` for submission errors.
- Ensure all touch controls are approximately `44px` high or larger.
- Do not communicate status using color alone.

---

## 8. Frontend states

The page must support the following states.

### Loading

- Read the token from the URL.
- Disable the submit button until initialization is complete.
- Show a short loading indicator only if necessary.

### Ready

- Display the form.
- Keep the email address hidden or partially masked.
- Do not place a full email address in the DOM unless required.

### Submitting

- Disable the button.
- Change the label to `Unsubscribing…`.
- Prevent duplicate requests.

### Success

- Replace the form with the success message.
- Confirm that the newsletter unsubscribe is active.

### Invalid link

Display:

> This unsubscribe link is invalid or has expired. Please contact OPG for assistance.

Do not reveal whether a particular email address exists.

### Network or automation error

Display:

> We could not update your preferences right now. Please try again in a moment.

Re-enable the button so the recipient can retry.

---

## 9. Frontend request contract

### Request

```http
POST /webhook/opg-newsletter-preferences
Content-Type: text/plain;charset=UTF-8
```

```json
{
  "token": "opaque-recipient-token",
  "campaignId": "2026-october-newsletter",
  "reason": "The content is not relevant to me",
  "otherReason": "",
  "futureContact": "No",
  "source": "newsletter-preference-page",
  "submittedAt": "2026-10-13T05:30:00.000Z",
  "website": ""
}
```

`website` is a honeypot field. It must remain empty for real users.

The body is a JSON string sent as plain text to avoid the browser's cross-origin
`OPTIONS` preflight against n8n. The n8n validation node parses it as JSON.
If a same-origin proxy is added later, the transport may use
`application/json` without changing the payload fields.

Do not send an email field from the frontend. n8n must derive the email from the validated token.

### Successful response

```json
{
  "ok": true,
  "status": "unsubscribed",
  "message": "Your email preferences have been updated."
}
```

### Error responses

```text
400 — Invalid form values
401 — Invalid or expired token
429 — Too many requests
500 — Workflow or Google Sheets failure
```

The browser should always show a generic user-friendly message rather than raw n8n errors.

---

## 10. Google Sheets structure

Create one spreadsheet named:

```text
OPG Newsletter Preferences
```

### Worksheet 1: `Recipients`

| Column | Purpose |
|---|---|
| `recipient_id` | Stable unique recipient ID |
| `email` | Recipient email address |
| `token` | Random opaque token used by the newsletter link |
| `campaign_id` | Newsletter campaign identifier |
| `status` | `subscribed` or `unsubscribed` |
| `token_created_at` | Token generation timestamp |
| `token_expires_at` | Optional token expiry timestamp |
| `unsubscribed_at` | Timestamp of successful unsubscribe |
| `updated_at` | Last update timestamp |

### Worksheet 2: `Responses`

| Column | Purpose |
|---|---|
| `response_id` | UUID generated by n8n |
| `recipient_id` | ID from the recipient lookup |
| `email` | Email resolved by n8n |
| `campaign_id` | Source newsletter campaign |
| `reason` | Selected unsubscribe reason |
| `other_reason` | Optional free-text response |
| `future_contact` | `Yes`, `No`, or blank |
| `unsubscribe_status` | Expected value: `unsubscribed` |
| `unsubscribed_at` | Unsubscribe timestamp |
| `feedback_submitted_at` | Feedback timestamp |
| `source` | `newsletter-preference-page` |

Restrict access to the spreadsheet because it contains personal information.

---

## 11. Recipient-token approach

### MVP approach

1. Generate a long random token for each newsletter recipient.
2. Store the token and corresponding email in the `Recipients` worksheet.
3. Insert the token into the newsletter link using the email platform's personalization field.
4. Send only the token back to n8n.
5. Look up the email in Google Sheets using the token.

Example token:

```text
cc70bb47-0dcb-45fb-9ce9-0ddf32bb3f5d
```

### Token requirements

- Must not be a sequential number.
- Must not be the recipient's email address.
- Must be difficult to guess.
- Should be unique per recipient.
- Preferably unique per campaign.
- May expire after a defined period such as 90 days.
- Must not be written to analytics tools or application logs unnecessarily.

If the newsletter platform already provides a secure contact ID or unsubscribe token, use that instead of generating another token.

---

## 12. n8n workflow design

### Workflow name

```text
OPG — Newsletter Unsubscribe and Feedback
```

### Nodes

#### 1. Webhook

- Method: `POST`
- Path: `opg-newsletter-preferences`
- Use the production webhook URL when deployed.
- Response mode: Respond using a `Respond to Webhook` node.
- Set the allowed origin to the production form domain.

#### 2. Validate request

Use an Edit Fields or Code node to normalize:

- `token`
- `campaignId`
- `reason`
- `otherReason`
- `futureContact`
- `source`
- `submittedAt`
- `website`

Reject the request when:

- `token` is missing.
- The honeypot field contains a value.
- `reason` is not blank and is not one of the allowed values.
- `futureContact` is not blank, `Yes`, or `No`.
- `otherReason` exceeds the agreed maximum length.

Recommended free-text maximum:

```text
500 characters
```

#### 3. Look up recipient

Use the Google Sheets node to find the row in `Recipients` where:

```text
token = submitted token
```

Also confirm:

- The token has not expired.
- The campaign ID matches when campaign-specific tokens are used.

#### 4. Invalid-token branch

Return HTTP `401` with:

```json
{
  "ok": false,
  "message": "This preference link is invalid or has expired."
}
```

#### 5. Update recipient

Use **Append or Update Row** or **Update Row** in the `Recipients` worksheet:

```text
status = unsubscribed
unsubscribed_at = current UTC timestamp
updated_at = current UTC timestamp
```

The workflow must be idempotent. Submitting the same token more than once must not create multiple recipient records or revert the unsubscribe.

#### 6. Record feedback

Append a row to `Responses` containing:

- Generated response UUID
- Resolved recipient ID
- Resolved email
- Campaign ID
- Reason
- Other reason
- Future-contact answer
- Unsubscribe status
- Timestamps
- Source

If the recipient submits the same request more than once, either:

- Update the existing response for the same recipient and campaign; or
- Keep all responses but add a unique request identifier.

Updating one response per recipient and campaign is recommended for the MVP.
Use a stable `response_key` column based on recipient ID and campaign ID for
the upsert. Escape optional free text before writing it to Google Sheets so
formula-like input is stored as text.

#### 6a. Suppress future newsletter sends

The newsletter platform must honor the `unsubscribed` status before the next
campaign, either by syncing the status to its suppression list or by using the
`Recipients` sheet as its authoritative send list. A Sheets update alone does
not stop a separate email platform from sending. The integration method depends
on OPG's newsletter provider.
For the MVP, keep one `Recipients` row per person with a global unsubscribe
status. If rows are kept per campaign, suppression must be checked across all
rows for the recipient.

#### 7. Success response

Return HTTP `200`:

```json
{
  "ok": true,
  "status": "unsubscribed",
  "message": "Your email preferences have been updated."
}
```

#### 8. Error workflow

Add an n8n Error Trigger workflow that alerts the internal owner when:

- Google Sheets cannot be reached.
- A workflow node fails.
- The response cannot be written.

Do not send the recipient's full response or token in an unsecured alert.

---

## 13. One-click unsubscribe requirement

The form page should not be the only unsubscribe mechanism for bulk newsletter messages.

Configure the email platform to include one-click unsubscribe headers:

```text
List-Unsubscribe: <https://automation.opg.example/webhook/opg-one-click-unsubscribe/...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The one-click endpoint should:

1. Accept the provider's POST request.
2. Validate the recipient token.
3. Mark the recipient as unsubscribed.
4. Return a successful empty or minimal response.
5. Not require the feedback questions.

The visible link inside the email can still open the branded feedback page.

Do not automatically unsubscribe on a normal page `GET` request. Email security scanners and link-preview bots may open links without the recipient intentionally clicking them.

References:

- [Gmail email subscription guidelines](https://support.google.com/mail/answer/15263077)
- [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

Confirm any additional requirements that apply to OPG's operating countries with the appropriate internal legal or compliance owner.

---

## 14. Security and privacy requirements

- Use HTTPS for the website and n8n webhook.
- Never include Google credentials in the frontend.
- Never use an email address as the recipient token.
- Never trust an email address submitted by the browser.
- Validate all dropdown values again in n8n.
- Trim and limit the optional free-text response.
- Restrict CORS to the deployed website origin.
- Add a hidden honeypot field.
- Add rate limiting at the hosting, reverse-proxy, or n8n layer when available.
- Avoid collecting IP addresses, device fingerprints, or user agents unless there is a defined business need.
- Limit spreadsheet access to authorized OPG users.
- Define how long unsubscribe feedback will be retained.
- Do not expose raw n8n error messages to users.
- Keep n8n execution-data retention as short as operationally practical because executions may contain email addresses.

---

## 15. Development phases

### Phase 1 — Project setup

- Create the Vite vanilla project.
- Add the supplied OPG logo.
- Create the HTML structure.
- Create the base color tokens and responsive layout.
- Add `.env.example`.

### Phase 2 — Form UI

- Add both dropdowns.
- Add the conditional `Other` textarea.
- Add loading, submitting, success, invalid-link, and error states.
- Add responsive styling.
- Complete keyboard and screen-reader checks.

### Phase 3 — Google Sheets

- Create the `Recipients` worksheet.
- Create the `Responses` worksheet.
- Add test recipient rows and tokens.
- Restrict spreadsheet permissions.

### Phase 4 — n8n workflow

- Create the POST webhook.
- Validate and normalize the request.
- Look up the recipient token.
- Update the recipient status.
- Store the feedback.
- Return structured JSON responses.
- Create the error workflow.

### Phase 5 — Frontend integration

- Connect the form to the test webhook.
- Handle every expected HTTP status.
- Prevent duplicate submissions.
- Confirm the email is derived by n8n.

### Phase 6 — Testing

- Test valid, invalid, expired, and missing tokens.
- Test blank feedback with a successful unsubscribe.
- Test every dropdown value.
- Test the conditional `Other` field.
- Test repeated submissions.
- Test Google Sheets and n8n failures.
- Test keyboard-only navigation.
- Test at 320px mobile width.
- Test major desktop and mobile browsers.

### Phase 7 — Deployment

- Publish the n8n workflow.
- Replace the test webhook URL with the production webhook URL.
- Build and deploy the static website.
- Configure the production domain and HTTPS.
- Update the newsletter template with personalized links.
- Configure one-click unsubscribe headers.
- Run a small internal email test before the public campaign.

---

## 16. Acceptance criteria

The MVP is complete when all of the following are true:

- The page displays the OPG logo and approved yellow/black glassmorphism design.
- The page works from 320px mobile width through desktop sizes.
- A recipient can unsubscribe without manually entering an email address.
- Feedback answers are optional and do not block the unsubscribe.
- The recipient token is validated by n8n.
- n8n retrieves the correct email from Google Sheets.
- The recipient is marked as unsubscribed.
- The newsletter platform suppresses unsubscribed recipients on subsequent sends.
- The email and selected answers are stored in the `Responses` worksheet.
- Repeated submissions do not create conflicting unsubscribe states.
- Invalid links show a safe error without revealing personal data.
- Network failures allow the user to retry.
- The form is usable by keyboard.
- No secrets are included in the frontend bundle.
- The production newsletter includes a separate one-click unsubscribe mechanism.

---

## 17. Out of scope for the MVP

- User accounts or authentication screens
- Admin dashboard
- SQL or NoSQL database
- Analytics dashboard
- Multiple newsletter preference categories
- Localization
- Automated resubscription
- CRM synchronization beyond Google Sheets

These features can be added later if the project grows.

---

## 18. Final implementation checklist

- [x] Create Vite vanilla project
- [x] Add OPG logo to `public/assets`
- [x] Build responsive form UI
- [x] Add glassmorphism styling
- [x] Add dropdown options
- [x] Add conditional `Other` textarea
- [x] Add URL-token handling
- [x] Add loading and error states
- [ ] Create Google Sheets worksheets
- [ ] Generate recipient tokens
- [ ] Create n8n webhook workflow
- [ ] Add token lookup
- [ ] Add unsubscribe update
- [ ] Connect unsubscribe status to the newsletter platform's suppression mechanism
- [ ] Add feedback response storage
- [ ] Add idempotency handling
- [ ] Add honeypot and validation
- [ ] Restrict CORS
- [ ] Add n8n error workflow
- [ ] Test valid and invalid tokens
- [ ] Test blank optional feedback
- [ ] Test mobile and keyboard accessibility
- [ ] Deploy static website
- [ ] Publish n8n workflow
- [ ] Configure one-click unsubscribe headers
- [ ] Run an internal end-to-end newsletter test

