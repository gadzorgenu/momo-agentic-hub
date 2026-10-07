Prisma setup (backend)

1. Start Postgres from the repo root (credentials match `.env.example`):

```bash
docker compose up -d --wait postgres
```

2. Install dependencies, then push the schema and seed sample pending orders (from backend/):

```bash
npm install
npx prisma db push
npm run seed
```

Notes:
- The Prisma schema is at `backend/prisma/schema.prisma` (`Order`, `Transaction`, `AuditLog`).
- `npx prisma db push --force-reset && npm run seed` gives you a clean demo dataset.
- The seeded orders line up with the sample SMS buttons in the dashboard.
