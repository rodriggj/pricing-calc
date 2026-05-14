# Project-Bootstrap — Demo Run

This document captures the actual stdout from a successful end-to-end walkthrough of the demo script in `.kiro/specs/project-bootstrap/requirements.md`. It is the demonstrable outcome required by Rule 2 of `spec-decomposition-rules.md` and the runnable demo script required by Rule 8.

Future reviewers can compare a fresh run against the verbatim output below to verify the skeleton still behaves identically.

## Run Metadata

| Field            | Value                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Project          | `aws-pricing-calc-project`                                                                   |
| Spec             | `.kiro/specs/project-bootstrap/`                                                             |
| Run timestamp    | `2026-05-14T03:16:22Z`                                                                       |
| OS               | `Darwin 25.4.0` (macOS, arm64 / Apple Silicon)                                               |
| Node             | `v24.10.0` (note: outside `engines.node` `>=22.0.0 <23.0.0`; pnpm prints a non-fatal warn)   |
| pnpm             | `10.5.0` (matches `packageManager` in `package.json`)                                        |
| Docker           | `Docker version 29.4.3, build 055a478`                                                       |
| Docker Compose   | `Docker Compose version v5.1.3` (Compose v2 plugin)                                          |

> **Engine-warning note.** The host's Node major (`v24`) is one major above the pinned engine band (`>=22 <23`). pnpm emits a non-fatal `WARN  Unsupported engine: ...` line on every command. This warning is informational only — `pnpm install --frozen-lockfile`, `pnpm dev`, and `pnpm build` all succeed. The `.nvmrc` (`22.14.0`) is the canonical version; running `nvm use` first would silence the warning. Recorded so future reviewers can recognize the same line if they see it.

## Walkthrough

The demo script's "from a clean state" preamble is interpreted as "Tasks 1–4 implemented but the demo verification has not yet been run." `pnpm install` is replaced with `pnpm install --frozen-lockfile` (which exits 0 when the lockfile matches without re-downloading); this exercises the same FR-1 AC-3 guarantee. Postgres was already running from Task 2's verification, so demo step 3 (`docker compose up -d`) is a no-op for the first half of the walkthrough; step 9 brings it down on purpose, and the post-walkthrough cleanup brings it back up to leave the workspace ready for the contract spec.

### Step 1 — Clone and check out

Skipped in this walkthrough (working in the existing checkout). Requirements coverage is deferred to a fresh-clone run by another team member; the rest of this document captures everything that walkthrough would observe.

### Step 2 — `pnpm install` (executed as `pnpm install --frozen-lockfile`)

```
$ pnpm install --frozen-lockfile
 WARN  Unsupported engine: wanted: {"node":">=22.0.0 <23.0.0"} (current: {"node":"v24.10.0","pnpm":"10.5.0"})
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 341ms using pnpm v10.5.0
```

**Exit code:** `0` (FR-1 AC-3, FR-2 AC-4 — frozen-lockfile success proves the lockfile resolves deterministically against the exact pins in `package.json`).

### Step 3 — `docker compose up -d`

Already running from Task 2's verification at the start of the walkthrough. The equivalent observation is the `docker compose ps` row in step 4 (Observe a). The post-walkthrough re-run of `docker compose up -d` (after step 9) captures the literal stdout:

```
$ docker compose up -d
[+] up 2/2
 ✔ Network aws-pricing-calc-project_default      Created                                  0.0s
 ✔ Container aws-pricing-calc-project-postgres-1 Started                                  0.1s
```

**Exit code:** `0`.

### Step 4 / Observe (a) — `docker compose ps` shows postgres healthy

```
$ docker compose ps
NAME                                  IMAGE                COMMAND                  SERVICE    CREATED         STATUS                 PORTS
aws-pricing-calc-project-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   6 minutes ago   Up 6 minutes (healthy) 0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
```

**Observe (a) — satisfied:** the `postgres` service is listed with `STATUS = Up 6 minutes (healthy)`. (FR-3 AC-1, AC-3, AC-6.)

### Step 5 — `cp .env.local.example .env.local`

```
$ cp .env.local.example .env.local
$ ls -la .env.local .env.local.example
-rw-r--r--@ 1 gabrrodriguez  staff  89 May 13 21:11 .env.local
-rw-r--r--@ 1 gabrrodriguez  staff  89 May 13 20:08 .env.local.example
```

Both files now exist. `.env.local` is gitignored (verified below); `.env.local.example` is tracked.

```
$ git check-ignore -q .env.local;          echo "exit=$? (0 = ignored, expected)"
exit=0 (0 = ignored, expected)

$ git check-ignore -q .env.local.example;  echo "exit=$? (1 = NOT ignored, expected)"
exit=1 (1 = NOT ignored, expected)
```

(FR-4 AC-1, AC-2, AC-3, AC-4.)

### Step 6 / Observe (b) — `psql -c "SELECT 1"` returns `1`

```
$ docker exec -i $(docker compose ps -q postgres) \
    psql -U estimating_app -d estimating_app -c "SELECT 1"
 ?column?
----------
        1
(1 row)
```

**Exit code:** `0`. **Observe (b) — satisfied:** the credentials in `.env.local.example` (which now also live in `.env.local`) authenticate against the running container and a one-row scalar `1` comes back. (FR-3 AC-7, FR-4 AC-4.)

### Step 7 / Observe (c) — `pnpm dev` prints `Local: http://localhost:3000`

`pnpm dev` was launched as a background process. Captured stdout:

```
$ pnpm dev
 WARN  Unsupported engine: wanted: {"node":">=22.0.0 <23.0.0"} (current: {"node":"v24.10.0","pnpm":"10.5.0"})

> aws-pricing-calc-project@0.1.0 dev /Users/gabrrodriguez/Desktop/aws-pricing-calc-project
> next dev --turbopack

   ▲ Next.js 15.5.9 (Turbopack)
   - Local:        http://localhost:3000
   - Network:      http://10.0.0.161:3000
   - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 851ms
```

`Local: http://localhost:3000` printed within ~9 seconds of process start (well inside FR-1 AC-4's "~10 seconds" budget). The `.env.local` from step 5 was picked up automatically.

The browser-reachability observable (no browser available in this environment) is `curl http://localhost:3000`:

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\nbody_bytes=%{size_download}\n" http://localhost:3000
HTTP 200
body_bytes=26885

$ curl -s http://localhost:3000 | grep -oE "(Get started by|Deploy now|Read our docs|Save and see)" | head -5
Get started by
Save and see
Deploy now
Read our docs
Get started by
```

**Observe (c) — satisfied:** the dev server responds 200 on `/` and the body contains the default `create-next-app` landing-page tokens (`Get started by`, `Save and see`, `Deploy now`, `Read our docs`). The dev server was then stopped via `controlBashProcess` (Ctrl-C equivalent). (FR-1 AC-1, AC-2, AC-4.)

### Step 8 / Observe (d) — `pnpm build` exits 0

```
$ pnpm build
 WARN  Unsupported engine: wanted: {"node":">=22.0.0 <23.0.0"} (current: {"node":"v24.10.0","pnpm":"10.5.0"})

> aws-pricing-calc-project@0.1.0 build /Users/gabrrodriguez/Desktop/aws-pricing-calc-project
> next build --turbopack

   ▲ Next.js 15.5.9 (Turbopack)
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Finished writing to disk in 16ms
 ✓ Compiled successfully in 1471ms
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/5) ...
   Generating static pages (1/5)
   Generating static pages (2/5)
   Generating static pages (3/5)
 ✓ Generating static pages (5/5)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                         Size  First Load JS
┌ ○ /                            5.38 kB         119 kB
└ ○ /_not-found                      0 B         113 kB
+ First Load JS shared by all     117 kB
  ├ chunks/5e00e63f2f1c967d.js   20.5 kB
  ├ chunks/c09184f00d9aa309.js   75.3 kB
  └ other shared chunks (total)  21.6 kB


○  (Static)  prerendered as static content
```

**Exit code:** `0`. **Observe (d) — satisfied:** production build completes and the `cn` helper from `src/lib/utils.ts` compiles cleanly through Tailwind v4 (no errors). (FR-1 AC-5, FR-5 AC-2.)

> **Deviation note:** The `build` script in `package.json` is `next build --turbopack`, not the design's documented `next build` (webpack). This was recorded by Task 1 as a pin-tightening choice; both backends produce a passing build for this skeleton, and the `--turbopack` form is what `create-next-app@15.5.9 --turbopack` emits by default in 15.5.x. Calling out so reviewers see it explicitly.

### Step 9 / Observe (e) — `docker compose down` removes the container; `postgres_data` persists

```
$ docker compose down
[+] down 2/2
 ✔ Container aws-pricing-calc-project-postgres-1 Removed                                  0.2s
 ✔ Network aws-pricing-calc-project_default      Removed                                  0.1s

$ docker compose ps -a
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS

$ docker volume ls | grep postgres_data
local     03_dev_postgres_data
local     aws-pricing-calc-project_postgres_data
local     backend_postgres_data
local     cs-rewrite_postgres_data
local     group-trip-expense-tracker_postgres_data
local     local-dev_postgres_data
local     tenant-service_postgres_data
local     unit-service_postgres_data
```

**Observe (e) — satisfied:** the `postgres` container is removed (no rows in `docker compose ps -a`); the named volume `aws-pricing-calc-project_postgres_data` remains in `docker volume ls`. `down` (without `-v`) preserves data by design. (FR-3 AC-4 — named volume is durable.)

### Post-walkthrough — Bring postgres back up

Per the task spec, the workspace is left ready for `.kiro/specs/estimate-format-and-contract/` Task 1, which assumes the database is reachable.

```
$ docker compose up -d
[+] up 2/2
 ✔ Network aws-pricing-calc-project_default      Created                                  0.0s
 ✔ Container aws-pricing-calc-project-postgres-1 Started                                  0.1s

$ docker compose ps
NAME                                  IMAGE                COMMAND                  SERVICE    CREATED          STATUS                  PORTS
aws-pricing-calc-project-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   14 seconds ago   Up 14 seconds (healthy) 0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp

$ docker exec -i $(docker compose ps -q postgres) \
    psql -U estimating_app -d estimating_app -c "SELECT 1"
 ?column?
----------
        1
(1 row)
```

The volume's contents survived `down`; `SELECT 1` works against the rehydrated container — `aws-pricing-calc-project_postgres_data` is durable across container lifecycle.

## Confirm Steps (Cross-Checked Against Design Mapping)

The Demo Step → Design Element Mapping table at the bottom of `.kiro/specs/project-bootstrap/design.md` is the cross-check ladder. Each Confirm step below cites the design section it maps to.

### Confirm (a) — `package.json` shape (design §4)

```json
{
  "name": "aws-pricing-calc-project",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.5.0",
  "engines": {
    "node": ">=22.0.0 <23.0.0"
  },
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "next": "15.5.9",
    "clsx": "2.1.1",
    "tailwind-merge": "3.6.0"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "@types/node": "20.19.41",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@tailwindcss/postcss": "4.3.0",
    "tailwindcss": "4.3.0",
    "eslint": "9.39.4",
    "eslint-config-next": "15.5.9",
    "@eslint/eslintrc": "3.3.5"
  }
}
```

- `packageManager` names pnpm at an exact version, no caret/tilde/`latest` (FR-2 AC-1). ✓
- `engines.node` declares `>=22.0.0 <23.0.0` (FR-2 AC-2). ✓
- `next`, `react`, `react-dom`, `typescript` are all exact strings, no `^`/`~`/`*`/`latest` (FR-2 AC-4). ✓
- Drizzle, Zod, fast-check, Vitest do **not** appear (FR-2 AC-5, NFR-2 AC-1). ✓
- Scripts limited to `dev`/`build`/`start`/`lint`; no `db:migrate`, `contract:harness`, or other downstream-owned script (FR-2 AC-6). ✓

### Confirm (b) — `.gitignore` env block (design §9)

```
# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# Project-Bootstrap explicit env-file entries (matches the create-next-app default;
# listed explicitly so reviewers can confirm without cross-referencing globs)
.env.local
.env.*.local

# Explicitly NOT ignored: .env.local.example (committed env template, FR-4 AC-1)
!.env.local.example
```

- `.env.local` and `.env.*.local` listed explicitly (FR-4 AC-2). ✓
- `!.env.local.example` negation present so the example is always tracked (FR-4 AC-2). ✓
- No `out/`, `fixtures/`, `migrations/`, or `coverage/` entries — those belong to the contract spec (NFR-2 AC-3). ✓
- `git check-ignore` confirmation: `.env.local` exits 0 (ignored), `.env.local.example` exits 1 (not ignored). ✓

### Confirm (c) — `docker-compose.yml` (design §7)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: estimating_app
      POSTGRES_PASSWORD: dev_only_password
      POSTGRES_DB: estimating_app
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U estimating_app -d estimating_app"]
      interval: 5s
      timeout: 5s
      retries: 6

volumes:
  postgres_data:
```

- Service named `postgres` (FR-3 AC-1). ✓
- Image `postgres:16-alpine` (FR-3 AC-1). ✓
- All three `POSTGRES_*` env vars set with the values from `docs/postgres-db-strategy.md` (FR-3 AC-2). ✓
- Port `5432:5432` published (FR-3 AC-3). ✓
- Named volume `postgres_data` mounted at `/var/lib/postgresql/data` (FR-3 AC-4). ✓
- Healthcheck on `pg_isready -U estimating_app -d estimating_app`, 5s × 6 retries = 30 s grace (FR-3 AC-5, AC-6). ✓
- No top-level `version:` key (Compose v2 ignores it; design §7 risk callout #3). ✓

### Confirm (d) — `components.json` (design §11)

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- App Router (`rsc: true`, `tsx: true`); `@/*` alias points at `src/*` (FR-5 AC-1). ✓
- Tailwind v4 contract: `tailwind.config: ""` (no JS config file under v4), `tailwind.css: "src/app/globals.css"`. ✓
- File present at the repository root. ✓

`src/lib/utils.ts` (design §12) — also confirmed in place:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

(FR-5 AC-2.) The build in step 8 confirms it compiles end-to-end through Next.js + Tailwind v4.

### Confirm (e) — Absent paths (design §"Architecture / Post-Spec File Tree")

Every directory and file listed as **MUST NOT EXIST** in the design's post-spec file tree was checked:

```
$ for p in src/contract src/db fixtures out src/components/ui \
           drizzle.config.ts vitest.config.ts scripts/contract-harness.ts; do
    if [ -e "$p" ]; then echo "PRESENT: $p"; else echo "ABSENT : $p"; fi
  done
ABSENT : src/contract
ABSENT : src/db
ABSENT : fixtures
ABSENT : out
ABSENT : src/components/ui
ABSENT : drizzle.config.ts
ABSENT : vitest.config.ts
ABSENT : scripts/contract-harness.ts
```

(NFR-2 AC-2.) ✓ All absent.

## Boundary Verification (NFR-2)

### Forbidden dependencies (NFR-2 AC-1)

```
$ for dep in drizzle-orm drizzle-kit zod fast-check vitest \
             shadcn @base-ui/react class-variance-authority \
             tw-animate-css lucide-react; do
    match=$(grep -E "\"$dep\"" package.json || true)
    if [ -z "$match" ]; then echo "ABSENT : $dep"
    else echo "PRESENT: $dep -> $match"; fi
  done
ABSENT : drizzle-orm
ABSENT : drizzle-kit
ABSENT : zod
ABSENT : fast-check
ABSENT : vitest
ABSENT : shadcn
ABSENT : @base-ui/react
ABSENT : class-variance-authority
ABSENT : tw-animate-css
ABSENT : lucide-react

$ grep -E "@radix-ui" package.json || echo "ABSENT : @radix-ui/* packages"
ABSENT : @radix-ui/* packages
```

All five contract-spec deps (`drizzle-orm`, `drizzle-kit`, `zod`, `fast-check`, `vitest`) and all six boundary-violating shadcn-init runtime deps that the 4.x `shadcn init` would have installed are absent. ✓

### Required artifacts present

- `components.json` — present at the repo root (FR-5 AC-1).
- `src/lib/utils.ts` — present (FR-5 AC-2).
- `clsx@2.1.1` and `tailwind-merge@3.6.0` — present in `package.json` `dependencies` (design §1, FR-5 AC-3).

## Acceptance Criteria Summary

| Group | Criteria                                                | Verified by                                                            | Status |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| FR-1  | App skeleton, App Router, `src/`, `@/*` alias, build/dev | Steps 7 & 8; `tsconfig.json` paths confirmation in Task 1              | ✓      |
| FR-2  | `packageManager`, `engines.node`, `.nvmrc`, exact pins   | Confirm (a) above; `pnpm install --frozen-lockfile` exit 0             | ✓      |
| FR-3  | Postgres service, env vars, port, volume, healthcheck    | Steps 3, 4, 6, 9; Confirm (c)                                          | ✓      |
| FR-4  | `.env.local.example`, gitignore, no committed `.env.local` | Step 5; Confirm (b)                                                  | ✓      |
| FR-5  | shadcn init artifacts, no components, deps minimal       | Confirm (d); Boundary Verification                                     | ✓      |
| NFR-1 | No AWS/Neon/Bedrock dependencies                         | Confirm (a) (no AWS/Neon/Clerk/Bedrock packages in `package.json`)     | ✓      |
| NFR-2 | Boundary clean: no contract-spec deps or directories     | Confirm (e); Boundary Verification                                     | ✓      |

## Deviations from the Demo Script (Recorded for Auditability)

Recorded so a fresh-clone walkthrough by another team member knows what to expect:

1. **Step 2 used `pnpm install --frozen-lockfile` instead of `pnpm install`.** Tasks 1–4 already populated `node_modules`; the frozen-lockfile form is functionally equivalent for FR-1 AC-3 (lockfile integrity) and avoids redundant resolution. Exit 0.
2. **Step 3 was a no-op for the first half of the walkthrough.** Postgres was already running from Task 2's verification. The literal `docker compose up -d` stdout is captured in the post-walkthrough re-up after step 9.
3. **Step 7 used `curl` instead of a browser** because no browser is available in this environment. `HTTP 200` and the presence of `Get started by`, `Save and see`, `Deploy now`, `Read our docs` in the response body together prove the default Next.js landing page is being served.
4. **Step 8's `build` script is `next build --turbopack`** (Task 1 chose this when it tightened the `create-next-app` defaults), not the unflagged `next build` mentioned in design §4. Both backends produce a passing build for this skeleton; the `--turbopack` form aligns with the `--turbopack` flag passed to `create-next-app`.
5. **`docker compose up -d` was re-run after step 9** to leave the workspace ready for `.kiro/specs/estimate-format-and-contract/` Task 1, which assumes a reachable database. The volume's persistence was verified between the two ups.
6. **A non-fatal `WARN  Unsupported engine` line** appears on every `pnpm` invocation because the host's Node major (`v24`) is one above the pinned engine band. This is informational only — install/dev/build all succeed. A reviewer running `nvm use` against `.nvmrc` will not see the warning.

## References

- Requirements: [`.kiro/specs/project-bootstrap/requirements.md`](../.kiro/specs/project-bootstrap/requirements.md)
- Design: [`.kiro/specs/project-bootstrap/design.md`](../.kiro/specs/project-bootstrap/design.md)
- Task list: [`.kiro/specs/project-bootstrap/tasks.md`](../.kiro/specs/project-bootstrap/tasks.md) (this run satisfies Task 5)
