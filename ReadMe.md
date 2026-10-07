# MoMo Agentic Reconciliation Hub

Enterprise-grade AI Agentic System designed to automate order reconciliation for small and medium-sized enterprises (SMEs) in Ghana.

## Project Summary
The MoMo Agentic Reconciliation Hub automates reconciliation of Mobile Money (MTN MoMo, Telecel Cash) and messaging-channel payments (e.g., WhatsApp) by using an AI agent to parse unstructured payment messages, reason about discrepancies, call typed tools, and update order state in real time.

## The Problem It Solves
- Manual Overhead: Merchants spend hours copying payment reference IDs, reading SMS receipts, and cross-referencing ledger entries against pending database orders.
- Human Error & Discrepancies: Underpayments, overpayments, and fee-related mismatches stall fulfillment and create accounting headaches.
- Lack of Real-Time Visibility: Merchants lack a unified dashboard to see live parsing, reasoning steps, and immediate automated status updates.

## How It Solves It
- **SMS extraction**: gpt-4o-mini (Zod structured output) pulls the transaction ID, sender, phone, amount and timestamp out of MTN MoMo, Telecel Cash and AT Money SMS. Every extracted value is checked against the raw text, and a deterministic parser takes over when the LLM is unavailable or wrong.
- **LangGraph reconciliation**: a `StateGraph` dedupes on `momoTxId`, matches the payment to a pending order, and classifies it as exact match, underpayment, overpayment, unmatched or duplicate. Exact matches are verified automatically.
- **Human-in-the-loop**: anomalies pause the graph with `interrupt()`. The dashboard shows the case with **Accept**, **Request Balance** or **Reject Transaction** buttons, and the operator's choice resumes the graph.
- **Live execution stream**: every node, reasoning step, tool call and result is streamed to the dashboard over Server-Sent Events, with an audit log in Postgres.

## Tech Stack
- Backend: NestJS, LangGraph (`@langchain/langgraph`), `@langchain/openai`, Zod, Prisma + PostgreSQL, RxJS (SSE)
- Frontend: React, Vite, Tailwind CSS, Lucide React, native `EventSource`
- Contract: `backend/src/contracts.ts` is imported by both backend and frontend for end-to-end types

See [`backend/docs/api-and-schemas.md`](backend/docs/api-and-schemas.md) for the API, event format, graph and decision rules.

## Development

```bash
# from repo root
docker compose up -d --wait postgres

cd backend
cp .env.example .env          # add OPENAI_API_KEY (optional)
npm install
npx prisma db push && npm run seed
npm run start:dev             # http://localhost:3000

cd ../frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to the backend)
```

Tests: `cd backend && npm test`.

## Contributing
Contributions, bug reports, and feature requests are welcome. Please open issues and PRs against this repository.

## License
MIT (or choose a license appropriate for your project)
