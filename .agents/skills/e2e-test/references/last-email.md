# last-email

```bash
bun run dev:last-email [--to <email>] [--subject <text>] [--count <n>]
```

With `EMAIL_DRIVER=console`, the backend writes each email it sends as JSON to `EMAIL_OUTBOX_DIR` (default `Sinwy.Backend/.emails`, gitignored). This tool prints the newest matches first (default 1) as a JSON array:

```json
[{
	"id": "<uuidv7>", "sentAt": "2026-…Z",
	"to": "…", "from": "…", "subject": "Verify your email",
	"props": { "verifyUrl": "http://localhost:3000/api/auth/verify-email?token=…" },
	"links": ["http://localhost:3000/api/auth/verify-email?token=…"],
	"file": "<absolute path>/Sinwy.Backend/.emails/<uuidv7>.json"
}]
```

- `--to` matches the whole address (case-insensitive). `--subject` matches part of the subject. It exits 1 if nothing matches.
- Open the link from `links` in the browser (`bunx playwright-cli goto <link>`) to follow it as the user would.
- To check the content, read `file`: its `html` field is the fully rendered email.
- Emails are sent asynchronously. If an email you expect isn't there yet, run the command again after a second before reporting it missing.

Simulated: the email was rendered and handed to the console driver, but nothing was delivered. A new or changed template still needs one real send through Resend to a dev domain before release. List that under **Real checks still needed**.
