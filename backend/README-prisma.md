Prisma setup (backend)

1. Install dependencies (from backend/):

```bash
npm install
npx prisma generate
```

2. Set `DATABASE_URL` in your environment (Postgres connection string).

3. Create a migration and apply it:

```bash
npx prisma migrate dev --name init
```

4. Seed or create test orders via `npx prisma studio` or via SQL.

Notes:
- The Prisma schema is at `backend/prisma/schema.prisma`.
- After migrations `@prisma/client` will be available to the app.
