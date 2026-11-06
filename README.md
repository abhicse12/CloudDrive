# CloudDrive

A cloud file storage and sharing SaaS: upload, organise, preview and securely share files,
with per-user storage quotas. Built locally first, with an architecture designed to move to
AWS (S3, RDS, ECS, CloudFront) without rewrites.

> **Status:** Phase 2 of 8 complete (backend foundation). See
> [docs/PHASE-1-PLAN.md](docs/PHASE-1-PLAN.md) for the full architecture, API design and roadmap.

## Tech stack

| Layer    | Technology                                                            |
| -------- | --------------------------------------------------------------------- |
| Backend  | Node.js 24, Express 5, Prisma 7, PostgreSQL 17, Zod, pino             |
| Frontend | React, Vite, Tailwind CSS, Redux Toolkit _(Phase 4)_                  |
| Testing  | Vitest, Supertest (against a real, separate test database)            |
| Tooling  | ESLint, Prettier, Docker Compose                                      |
| Cloud    | AWS: S3, RDS, ECS, CloudFront, IAM, CloudWatch, Terraform _(Phase 8)_ |

## Prerequisites

- **Node.js 24+** and npm
- **Docker Desktop** (must be running) - provides PostgreSQL, so no local install is needed

## Getting started

```bash
# 1. Install dependencies (root + server workspace)
npm install

# 2. Create your local environment file
cp server/.env.example server/.env
#    then set DATABASE_URL's password to match docker-compose.yml (clouddrive_dev_password)

# 3. Start PostgreSQL (dev on port 5434, test on port 5433)
npm run db:up

# 4. Create the database tables and generate the Prisma client
npm run db:migrate -w server
npm run db:generate -w server

# 5. Start the API (restarts automatically when files change)
npm run dev
```

Check it works: <http://localhost:4000/api/health> and <http://localhost:4000/api/health/ready>.

## Scripts

Run from the project root:

| Command                        | What it does                                    |
| ------------------------------ | ----------------------------------------------- |
| `npm run dev`                  | Start the API in watch mode on port 4000        |
| `npm test`                     | Run the API test suite (uses the test database) |
| `npm run lint` / `lint:fix`    | Check / auto-fix code quality issues            |
| `npm run format`               | Format all files with Prettier                  |
| `npm run db:up` / `db:down`    | Start / stop the PostgreSQL containers          |
| `npm run db:migrate -w server` | Create + apply migrations after schema changes  |
| `npm run db:studio -w server`  | Browse data in Prisma Studio (localhost:5555)   |

## Viewing the database

- **Prisma Studio:** `npm run db:studio -w server`
- **psql:** `docker exec -it clouddrive-db psql -U clouddrive`
- **GUI tools** (pgAdmin, DBeaver, VS Code extensions): host `localhost`, port **5434**,
  user `clouddrive`, database `clouddrive`

Port 5434 (not the default 5432) avoids clashing with a natively installed PostgreSQL.

## Environment variables

Defined and validated in [server/src/config/env.js](server/src/config/env.js). The server
refuses to start if any value is missing or invalid.

| Variable       | Example                                    | Purpose                                    |
| -------------- | ------------------------------------------ | ------------------------------------------ |
| `NODE_ENV`     | `development`                              | `development`, `test` or `production`      |
| `PORT`         | `4000`                                     | HTTP port                                  |
| `LOG_LEVEL`    | `info`                                     | pino log level                             |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5434/db` | PostgreSQL connection                      |
| `CORS_ORIGINS` | `http://localhost:5173`                    | Comma-separated allowed browser origins    |
| `TRUST_PROXY`  | `0`                                        | Proxies in front of the API (1 behind ALB) |

## Project structure

```
clouddrive/
├── docker-compose.yml      PostgreSQL (dev + test)
├── docs/                   Architecture and planning docs
└── server/
    ├── prisma/             Schema and migrations (incl. hand-written SQL constraints)
    ├── tests/              API tests
    └── src/
        ├── app.js          Express app + middleware order
        ├── server.js       Startup and graceful shutdown
        ├── config/         env validation, logger, Prisma client
        ├── middleware/     requestId, notFound, errorHandler
        ├── routes/         API routes
        └── utils/          AppError
```

## API

All responses follow one format:

```jsonc
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." }, "requestId": "..." }
```

| Method | Path                | Description                                     |
| ------ | ------------------- | ----------------------------------------------- |
| GET    | `/api/health`       | Liveness: the process is running                |
| GET    | `/api/health/ready` | Readiness: the database is reachable (else 503) |

The complete planned API is in [docs/PHASE-1-PLAN.md](docs/PHASE-1-PLAN.md#6-api-design).
