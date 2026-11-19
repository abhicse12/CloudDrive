# CloudDrive

A cloud file storage and sharing SaaS: upload, organise, preview and securely share files,
with per-user storage quotas. Built locally first, with an architecture designed to move to
AWS (S3, RDS, ECS, CloudFront) without rewrites.

> **Status:** Phases 1–4 complete: backend foundation, authentication, and the frontend
> (landing page, auth pages, app shell, settings). File management comes in Phase 5.
> See [docs/PHASE-1-PLAN.md](docs/PHASE-1-PLAN.md) for the architecture, API design and roadmap.

## Features so far

- **Accounts:** register, log in, log out, forgot/reset password, update profile, change password
- **Secure sessions:** short-lived JWT + rotating refresh token in HttpOnly cookies, refresh-token
  reuse detection, CSRF protection, rate limiting, instant logout and suspension
- **Web app:** landing page, split-screen auth pages, dashboard shell with sidebar, settings,
  light/dark/system theme, responsive down to phone size
- **Quality:** 100+ automated tests (API against a real test database, UI with Testing Library)

## Tech stack

| Layer    | Technology                                                                                    |
| -------- | --------------------------------------------------------------------------------------------- |
| Backend  | Node.js 24, Express 5, Prisma 7, PostgreSQL 17, Zod, bcrypt, JWT, pino                        |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 8, Redux Toolkit + RTK Query, Axios, RHF + Zod |
| Testing  | Vitest, Supertest, Testing Library, jsdom                                                     |
| Tooling  | npm workspaces, ESLint, Prettier, Docker Compose                                              |
| Cloud    | AWS: S3, RDS, ECS, CloudFront, IAM, CloudWatch, Terraform _(Phase 8)_                         |

## Prerequisites

- **Node.js 24+** and npm
- **Docker Desktop** (must be running) - provides PostgreSQL, so no local install is needed

## Getting started

```bash
# 1. Install dependencies (root + server + client workspaces)
npm install

# 2. Create your local environment file, then edit it:
#    - DATABASE_URL password must match docker-compose.yml (clouddrive_dev_password)
#    - JWT_ACCESS_SECRET: generate one (command is in the file)
#    - ADMIN_*: the first admin account
cp server/.env.example server/.env

# 3. Start PostgreSQL (dev on port 5434, test on port 5433)
npm run db:up

# 4. Create the tables, generate the Prisma client, create the admin user
npm run db:deploy -w server
npm run db:generate -w server
npm run db:seed -w server

# 5. Start API (port 4000) and web app (port 5173) together
npm run dev
```

Open <http://localhost:5173>. Stop both servers with `Ctrl + C`.

The browser only talks to port 5173; Vite forwards `/api/*` to the API, so the app and API share
one origin (cookies just work). CloudFront does the same job in production.

**Password reset emails** are printed in the `[api]` terminal during development (no real email
is sent until AWS SES is added in Phase 8).

## Scripts

Run from the project root:

| Command                          | What it does                                               |
| -------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                    | Start API (4000) and web app (5173) in watch mode          |
| `npm run dev:server` / `:client` | Start only one of them                                     |
| `npm test`                       | Run all tests (API tests use the separate test database)   |
| `npm run build`                  | Production build of the web app (`client/dist`)            |
| `npm run lint` / `lint:fix`      | Check / auto-fix code quality issues                       |
| `npm run format`                 | Format all files with Prettier                             |
| `npm run db:up` / `db:down`      | Start / stop the PostgreSQL containers                     |
| `npm run db:migrate -w server`   | Create + apply a migration after changing `schema.prisma`  |
| `npm run db:seed -w server`      | Create (or promote) the admin user from `ADMIN_*` settings |
| `npm run db:studio -w server`    | Browse data in Prisma Studio (localhost:5555)              |

## Viewing the database

- **Prisma Studio:** `npm run db:studio -w server`
- **psql:** `docker exec -it clouddrive-db psql -U clouddrive`
- **GUI tools** (pgAdmin, DBeaver, VS Code extensions): host `localhost`, port **5434**,
  user `clouddrive`, database `clouddrive`

Port 5434 (not the default 5432) avoids clashing with a natively installed PostgreSQL.

## Environment variables

Defined and validated in [server/src/config/env.js](server/src/config/env.js). The server
refuses to start if any value is missing or invalid. See
[server/.env.example](server/.env.example) for every variable with a placeholder.

| Variable                              | Default                 | Purpose                                                |
| ------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `NODE_ENV`                            | `development`           | `development`, `test` or `production`                  |
| `PORT`                                | `4000`                  | API port                                               |
| `LOG_LEVEL`                           | `info`                  | pino log level                                         |
| `DATABASE_URL`                        | -                       | PostgreSQL connection URL (required)                   |
| `CORS_ORIGINS`                        | `http://localhost:5173` | Comma-separated allowed browser origins                |
| `TRUST_PROXY`                         | `0`                     | Proxies in front of the API (1 behind an AWS ALB)      |
| `JWT_ACCESS_SECRET`                   | -                       | Signs access tokens; 32+ random characters (required)  |
| `JWT_ACCESS_TTL_SECONDS`              | `900`                   | Access token lifetime (15 min)                         |
| `REFRESH_TOKEN_TTL_DAYS`              | `7`                     | Refresh token lifetime, renewed on use                 |
| `BCRYPT_ROUNDS`                       | `12`                    | Password hashing cost (min 12 in production)           |
| `COOKIE_SECURE`                       | `false`                 | HTTPS-only cookies (must be `true` in production)      |
| `PASSWORD_RESET_TTL_MINUTES`          | `30`                    | Reset link lifetime                                    |
| `APP_URL`                             | `http://localhost:5173` | Web app URL used in email links                        |
| `EMAIL_PROVIDER`                      | `console`               | `console` prints emails to the log                     |
| `DEFAULT_STORAGE_LIMIT_BYTES`         | `5368709120`            | New user quota (5 GiB)                                 |
| `STORAGE_DRIVER`                      | `local`                 | Where file bytes live (`local` now, S3 in Phase 8)     |
| `STORAGE_LOCAL_ROOT`                  | `./storage-data`        | Local storage folder (relative to `server/`)           |
| `UPLOAD_TMP_DIR`                      | `./tmp-uploads`         | Temp folder for uploads in progress                    |
| `STORAGE_SIGNING_SECRET`              | -                       | Signs download links; 32+ random characters (required) |
| `SIGNED_URL_TTL_SECONDS`              | `300`                   | Download link lifetime (5 min)                         |
| `MAX_FILE_SIZE_MB`                    | `100`                   | Largest single file                                    |
| `MAX_FILES_PER_UPLOAD`                | `20`                    | Files per upload request                               |
| `TRASH_RETENTION_DAYS`                | `30`                    | Trash is emptied automatically after this              |
| `JOBS_ENABLED`                        | `true`                  | Run background cleanup jobs in the API process         |
| `ADMIN_EMAIL` / `_NAME` / `_PASSWORD` | -                       | Used only by `db:seed`                                 |

## Project structure

```
clouddrive/
├── docker-compose.yml        PostgreSQL (dev + test)
├── docs/                     Architecture and planning docs
├── server/                   REST API
│   ├── prisma/               Schema, migrations (incl. hand-written SQL constraints), seed
│   ├── tests/                API tests (auth, files, uploads, folders, trash, jobs, ...)
│   └── src/
│       ├── app.js            Express app + middleware order
│       ├── server.js         Startup, background jobs and graceful shutdown
│       ├── config/           env validation, logger, Prisma client
│       ├── routes/           URL → middleware → controller
│       ├── controllers/      HTTP in/out only
│       ├── services/         Business rules (auth, files, uploads, folders, trash, dashboard)
│       ├── repositories/     Database queries (always scoped to the user)
│       ├── middleware/       auth, roles, CSRF, rate limits, validation, uploads, errors
│       ├── validators/       Zod request schemas
│       ├── storage/          StorageProvider interface + local disk (S3 later)
│       ├── jobs/             Cleanup jobs and their scheduler
│       ├── email/            Email provider interface (console now, SES later)
│       └── utils/            AppError, cookies, DTOs, file types, pagination
└── client/                   React web app
    └── src/
        ├── router.jsx        Routes (lazy-loaded pages) and guards
        ├── services/         Axios client (CSRF + silent refresh) and RTK Query base
        ├── store/            Redux store
        ├── features/         auth, landing, settings (API, state, components)
        ├── layouts/          Public, Auth (split screen), App (sidebar + top bar)
        ├── pages/            One component per route
        ├── components/       Shared UI (Button, Input, Alert, ...)
        └── theme/            Light / dark / system theme
```

## API

All responses follow one format:

```jsonc
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": [ ... ] }, "requestId": "..." }
```

State-changing requests (`POST`, `PATCH`, `DELETE`) must send the CSRF token from
`GET /api/auth/csrf` in the `X-CSRF-Token` header. Auth tokens travel only in HttpOnly cookies.

| Method | Path                        | Auth | Description                                      |
| ------ | --------------------------- | ---- | ------------------------------------------------ |
| GET    | `/api/health`               | -    | Liveness: the process is running                 |
| GET    | `/api/health/ready`         | -    | Readiness: database and storage OK (else 503)    |
| GET    | `/api/auth/csrf`            | -    | Issue CSRF token (cookie + body)                 |
| POST   | `/api/auth/register`        | -    | Create account and log in                        |
| POST   | `/api/auth/login`           | -    | Log in                                           |
| POST   | `/api/auth/refresh`         | -    | Rotate refresh token, issue new access token     |
| POST   | `/api/auth/logout`          | -    | End this session                                 |
| GET    | `/api/auth/me`              | ✔    | Current user                                     |
| PATCH  | `/api/auth/me`              | ✔    | Update name                                      |
| POST   | `/api/auth/change-password` | ✔    | Change password, log out other devices           |
| POST   | `/api/auth/forgot-password` | -    | Email a reset link (same response for any email) |
| POST   | `/api/auth/reset-password`  | -    | Set new password from link, log out every device |

**Files, folders, trash and dashboard** (all require login; another user's items always
return 404):

| Method | Path                          | Description                                                             |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/folders?parentId=`      | Subfolders (no `parentId` = root)                                       |
| GET    | `/api/folders/tree`           | Every folder, for the "Move to…" picker                                 |
| POST   | `/api/folders`                | Create `{ name, parentId? }`                                            |
| GET    | `/api/folders/:id`            | Folder + breadcrumbs                                                    |
| PATCH  | `/api/folders/:id`            | Rename and/or move `{ name?, parentId? }`                               |
| DELETE | `/api/folders/:id`            | Move folder and its contents to trash                                   |
| POST   | `/api/folders/:id/restore`    | Restore with everything trashed along with it                           |
| DELETE | `/api/folders/:id/permanent`  | Delete forever (must be in trash)                                       |
| GET    | `/api/files`                  | `folderId` (or `all`), `q`, `category`, sort, `page`/`pageSize`         |
| POST   | `/api/files/upload`           | Multipart `files` (≤ 20) + `folderId?`; per-file results                |
| GET    | `/api/files/:id`              | File + breadcrumbs                                                      |
| GET    | `/api/files/:id/download`     | 5-minute signed link; `disposition=inline\|attachment`, `redirect=true` |
| PATCH  | `/api/files/:id`              | Rename and/or move `{ name?, folderId? }`                               |
| DELETE | `/api/files/:id`              | Move to trash                                                           |
| POST   | `/api/files/:id/restore`      | Restore from trash                                                      |
| DELETE | `/api/files/:id/permanent`    | Delete forever (must be in trash)                                       |
| POST   | `/api/files/bulk`             | `{ action: trash\|restore\|move\|delete, ids[], folderId? }`            |
| GET    | `/api/trash`                  | Top-level trashed folders and files, with purge dates                   |
| DELETE | `/api/trash`                  | Empty trash                                                             |
| GET    | `/api/dashboard/stats`        | Storage used/limit, usage by category, trash size                       |
| GET    | `/api/dashboard/recent-files` | Newest files (`limit`, default 8)                                       |
| GET    | `/api/dashboard/activity`     | Activity feed (`limit`, `cursor` → `nextCursor`)                        |

The complete planned API is in [docs/PHASE-1-PLAN.md](docs/PHASE-1-PLAN.md#6-api-design).
