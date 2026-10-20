# OPG services survey — production rollout

## Current design

The public three-step form sends JSON to same-origin `POST /api/submit`. A Vercel function validates the input, bounds the request body, derives a retry-stable response ID, and calls the authenticated n8n production webhook. n8n validates again, escapes spreadsheet formula prefixes, and appends or updates the `Responses` Sheet row. The success modal appears only after the write reports success. The form has no automatic unsubscribe or Gmail suppression function.

During localhost development, the Vite adapter also permits an HTTPS n8n `/webhook-test/` URL while the whole n8n workflow listens. The Vercel function does not permit test URLs.

## Browser request

```json
{
  "requestId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "name": "Example Person",
  "email": "person@example.com",
  "question1": "We currently handle this in-house.",
  "question2": "Unsure",
  "website": ""
}
```

The server accepts only these six string fields. `website` is a honeypot and must be empty. The browser-generated UUID is a retry key; the server derives the `responseId` sent to n8n. The Sheets row timestamp comes from n8n, not the browser. Names and email addresses are self-reported.

## Deployment gate

- [x] Same-origin submission function and Vite local adapter
- [x] Server validation, size limit, generic errors, authenticated upstream call, and retry-stable response ID
- [x] Header Auth n8n workflow template with validation and formula escaping
- [x] Vercel security headers and build configuration
- [x] Mocked server, build, workflow, and browser tests
- [ ] Disable the old exposed n8n webhook and import/configure/publish the new workflow
- [ ] Create n8n Header Auth credential and set matching Vercel server-only environment values
- [ ] Configure Vercel Firewall rate limit for `/api/submit`
- [ ] Restrict n8n and Sheet access; verify execution saving is off
- [ ] Deploy to Vercel over HTTPS and verify a real Sheet write and response

See [README.md](README.md) for the exact account setup and verification steps. Sheet rows remain until manually deleted.
