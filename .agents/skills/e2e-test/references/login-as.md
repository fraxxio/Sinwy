# login-as

```bash
bun run dev:login-as (--email <email> | --user-id <id>) [--state]
```

This creates a real Better Auth session for a verified user and confirms that Better Auth accepts it. It refuses unverified users, because the app wouldn't let them sign in. It prints JSON with `userId`, `email`, `sessionId`, `expiresAt` and `cookie`. With `--state`, it also prints `storageStateFile`.

## Browser

```bash
bun run dev:login-as --email <email> --state
bunx playwright-cli open
bunx playwright-cli state-load .playwright-cli/auth/<userId>.json
bunx playwright-cli goto http://localhost:3000/auth/postlogin
```

`/auth/postlogin` sends the user to the right place for their org state (see [app-map.md](app-map.md)). The storage-state cookie is set for the `WEB_APP_URL` host, so open pages on `http://localhost:3000`, not on the backend port.

To log in as a second user, run `bunx playwright-cli close` and open a new browser first. You can also use a named session (`bunx playwright-cli -s=<name> …`) and keep both open.

## API calls

```bash
COOKIE=$(bun run --silent dev:login-as --email <email> | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).cookie)')
curl -s -H "cookie: $COOKIE" http://localhost:3001/api/user/flags
```

## Differences from a real login

- The session has empty `ip_address` and `user_agent`.
- No `active_organization_id` is set until a route sets it.
- The login form, Google OAuth and the "unverified email" path aren't exercised. Test those through the form.
