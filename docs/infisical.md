# Secrets with Infisical

Samity Manager used to expect a `.env` file on every developer's disk. Secrets now live in
[Infisical](https://app.infisical.com) and are injected into the process at start-up, so the
application code is unchanged: it still reads `process.env` (API) and `import.meta.env.VITE_*`
(Vite) exactly as before.

Official pages used by this runbook:

- CLI install / overview — <https://infisical.com/docs/cli/overview>
- `infisical init` — <https://infisical.com/docs/cli/commands/init>
- `infisical run` — <https://infisical.com/docs/cli/commands/run>
- First secret quickstart — <https://infisical.com/docs/documentation/platform/secrets-mgmt/quick-starts/deliver-first-secret>
- Machine identities — <https://infisical.com/docs/documentation/platform/identities/machine-identities>
- Universal Auth — <https://infisical.com/docs/documentation/platform/identities/universal-auth>
- Secret scanning — <https://infisical.com/docs/cli/scanning-overview>

## Scope of this repo

| Destination         | Status here                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Local development   | Wrapped: `npm run dev` / `npm run dev:api` / `npm run dev:web` run through `infisical run --env=dev`                                      |
| Production process  | Wrapped: `@samity/api` `start` runs through `infisical run --env=prod` (needs a machine identity)                                         |
| CI (GitHub Actions) | Not wired — it installs, typechecks, lints, tests and builds with dummy values and needs no secrets. Snippet below if you want real ones. |
| Docker / Kubernetes | No `Dockerfile`, `docker-compose.yml` or manifests exist in this repo, so nothing was changed there.                                      |

## 1. Environment variables this app reads

Names only — never commit or paste values. Import each one into the Infisical project
(Development, and later Staging/Production) with the same name.

**API runtime (`apps/api/src/env.ts`)** — Zod-validated, boot fails fast if malformed:

- `NODE_ENV` — `development` | `test` | `production`
- `PORT`
- `CORS_ORIGINS` — comma-separated browser origins
- `LOG_LEVEL` — `fatal` | `error` | `warn` | `info` | `debug` | `trace`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `MEMBER_ENC_KEY` — AES-256-GCM master key for NID / bank / phone field encryption
- `SAVINGS_INTEREST_FREQUENCY` — `monthly` | `yearly`

**API scripts and feature modules:**

- `SUPABASE_DB` — Postgres connection string (`npm run db:migrate`, `npm run db:seed`)
- `SUPABASE_PROJECT_ID` — `npm run db:types`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — scheduled report email
- `SMS_GATEWAY_URL`, `SMS_GATEWAY_API_KEY`, `SMS_GATEWAY_BODY`, `SMS_GATEWAY_NAME` — HTTP SMS gateway adapter

**Web (Vite, `apps/web`)** — only `VITE_`-prefixed names reach the browser:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_PROXY` — dev-only, overrides the `/api/v1` proxy target

`.env.example` (committed, placeholders only) documents the Supabase, API and web keys — use the list above as the complete import checklist. It is a name reference only: nothing in the app reads it, and real values must not be written back into it.

## 2. Create the account and project

1. Sign up at <https://app.infisical.com>.
2. **Secrets Management → + Add New Project**, name it after the service (e.g. `samity-manager`).
3. Every new project starts with Development, Staging and Production environments — keep that.
4. On the **Secrets Overview** page you can drag and drop an existing `.env` file (or use
   **Paste Secrets**) to import everything at once, then pick the target environments.

Import the keys listed in section 1. If any environment file was ever shared by email, chat or a
git commit, rotate those values — see section 8.

## 3. Install the CLI and authenticate

> **No CLI installed yet? Nothing breaks.** `npm run dev`, `npm run dev:api`,
> `npm run dev:web` and `npm run secrets:run` go through
> `scripts/secrets-run.mjs`, which detects whether the Infisical CLI exists:
> with it, commands are wrapped in `infisical run --env=dev` as before; without
> it, a short warning is printed and the command runs directly — the app boots
> in demo mode (in-memory data, Zod default config) until secrets arrive.
> The only exception is the production `start` script, which passes
> `--require-infisical` and refuses to boot a secrets-less process.

```bash
# Windows
winget install infisical
# macOS
brew install infisical/get-cli/infisical
# any OS with Node
npm install -g @infisical/cli
```

On this machine (Windows) use `winget install infisical`, or `npm install -g @infisical/cli`.

```bash
npm run secrets:login            # opens the browser
npm run secrets:login:headless   # infisical login -i — WSL 2, Codespaces, remote SSH, no browser
```

## 4. Link the codebase

```bash
npm run secrets:init   # infisical init
```

This writes `.infisical.json`, which holds the project ID and the default environment. It contains
**no secrets** and is safe to commit — do commit it so every checkout, the preview harness and CI
resolve the same project. It is deliberately not in `.gitignore`.

After this, `infisical run --env=dev -- <command>` needs no further configuration.

## 5. Inject secrets at runtime

Already wired in `package.json`:

```bash
npm run dev          # secrets-run → infisical run --env=dev -- ... (API :4000 + web :5173)
npm run dev:api      # secrets-run → infisical run --env=dev -- ...
npm run dev:web      # secrets-run → infisical run --env=dev -- ...
```

The unwrapped commands remain as `dev:local`, `dev:api:local`, `dev:web:local` for debugging the
launch chain itself.

For one-off commands that need secrets, use the generic wrapper:

```bash
npm run secrets:run -- npm run db:migrate
npm run secrets:run -- npm run db:seed
```

During development you can restart on secret change with `infisical run --watch --env=dev -- npm run dev:local`.

Vite picks up `VITE_`-prefixed variables straight from the process environment, so `VITE_API_URL`
and the Supabase keys arrive the same way they used to arrive from `.env` — no code change.

Production (`node dist/server.js`) is wrapped as `apps/api` `start` with `--env=prod`; the raw
command remains available as `start:local`. Non-interactive environments must authenticate with a
machine identity (section 6) — `infisical run` reads the access token from `INFISICAL_TOKEN`.

## 6. Non-local environments (CI/CD, Kubernetes, production)

Never use interactive login there. Create a machine identity with Universal Auth:

1. **Access Control → Machine Identities → Create**, give it an organization role.
2. Back in the identity, **Add Client Secret** (set a TTL and, ideally, a limited number of uses).
3. Add the identity to the project (**Access Control → Machine Identities → Add Machine Identity to
   Project → Assign Existing**) and give it a project role scoped to the environment it needs —
   Development for CI, Production only for production.

Keep the Client ID in variables and the Client Secret in the platform's own secret store, and scope
the identity to the minimum project, environment and folder:

```bash
# obtain a short-lived access token (run inside the platform, never echoed to a log)
export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --silent --plain)

infisical run --env=prod -- npm run start -w @samity/api
```

`--silent` suppresses update notices and `--plain` prints only the token. Do not pass the client
secret on a command line that is visible in process listings or CI logs; use the platform's secret
store and environment variables.

**GitHub Actions** (optional — the current workflow needs no secrets). Store the Client Secret as
`INFISICAL_CLIENT_SECRET` in repository secrets and the Client ID as a repository variable, then
add these steps before any step that needs real values:

```yaml
- name: Install Infisical CLI
  run: npm install -g @infisical/cli

- name: Inject secrets
  env:
    INFISICAL_CLIENT_ID: ${{ vars.INFISICAL_CLIENT_ID }}
    INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
  run: |
    export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
      --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --silent --plain)
    infisical run --env=dev -- npm run test
```

For Kubernetes, the recommended path is the Infisical Kubernetes Operator rather than the CLI — see
<https://infisical.com/docs/documentation/getting-started/quickstarts>.

## 7. Verify the migration

1. Start through the wrapper: `npm run dev`.
2. Confirm a known variable resolves — check its **length**, never its value, e.g. the API boots
   without fallback warnings and `curl http://localhost:4000/api/v1/health` (port is whatever
   `PORT` is set to) returns `{"status":"ok",...}`; `GET /api/v1/mis-ops/schedules` reports
   `smtpConfigured: true` once `SMTP_HOST` is in Infisical.
3. Rename the local file, if you still have one: `mv .env .env.backup` (Windows: `ren .env .env.backup`).
4. Restart through `npm run dev` and confirm the app still starts. That proves the values come from
   Infisical and not from disk.
5. Delete `.env.backup` once satisfied.

## 8. Cleanup and leaked secrets

- `.gitignore` already ignores `.env` and `.env.*` (with `!.env.example`), so `.env.backup` is
  covered too and nothing new needs to be added. Keep it that way: no real secrets in the working
  copy now that Infisical is the source of truth.
- If secret values were ever committed, they stay in git history — **rotate them in the provider**
  (Supabase keys, `MEMBER_ENC_KEY`, SMTP and SMS credentials) and update Infisical. Deleting the
  file is not enough.
- Scan for leaks with the Infisical CLI:

```bash
npm run secrets:scan             # infisical scan — files, directories and git history
npm run secrets:scan:staged      # infisical scan git-changes --staged --verbose (pre-commit)
infisical scan install --pre-commit-hook   # optional: block commits that contain secrets
```

- Never echo, log, or paste a secret value into a shell command, a commit, or a chat. Fetch lengths
  or booleans when you need to prove a variable is present.
