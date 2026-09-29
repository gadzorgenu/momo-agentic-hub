# MoMo Agentic Reconciliation Hub

Enterprise-grade AI Agentic System designed to automate order reconciliation for small and medium-sized enterprises (SMEs) in Ghana.

## Project Summary
The MoMo Agentic Reconciliation Hub automates reconciliation of Mobile Money (MTN MoMo, Telecel Cash) and messaging-channel payments (e.g., WhatsApp) by using an AI agent to parse unstructured payment messages, reason about discrepancies, call typed tools, and update order state in real time.

## The Problem It Solves
- Manual Overhead: Merchants spend hours copying payment reference IDs, reading SMS receipts, and cross-referencing ledger entries against pending database orders.
- Human Error & Discrepancies: Underpayments, overpayments, and fee-related mismatches stall fulfillment and create accounting headaches.
- Lack of Real-Time Visibility: Merchants lack a unified dashboard to see live parsing, reasoning steps, and immediate automated status updates.

## How It Solves It
- Autonomous Tool Execution: An LLM-driven agent receives raw, unstructured Mobile Money SMS messages or customer receipts and autonomously selects and executes tools defined with Zod schemas (e.g., `fetchOrderDetails`, `verifyMomoReceipt`, `updateOrderStatus`).
- Real-Time Reasoning Stream: The NestJS backend streams the agent's live reasoning steps, tool calls, and outputs to the frontend using Server-Sent Events (SSE) and RxJS so operators can watch decisions as they happen.
- Human-in-the-Loop Safeguards: When anomalies or underpayments are detected, the agent pauses and alerts the merchant via the React dashboard; a human operator can approve or reject the discrepancy before the system updates the database.

## Key Features
- LLM Agentic controller with autonomous tool selection
- Zod-validated tool schemas for safe tool execution
- SSE + RxJS streaming of agent thoughts and tool outputs
- Human approval workflows for anomalies and edge cases
- Unified React dashboard for live monitoring and action

## Tech Stack Architecture
- Backend: NestJS, @langchain/langgraph, @langchain/openai, Zod
- Frontend: React, Vite, Tailwind CSS, @microsoft/fetch-event-source, Lucide React
- Communication: REST endpoints and SSE for real-time thought-streaming

## Development
1. Backend: see `backend/README.md` for backend-specific setup and env vars.
2. Frontend: see `frontend/README.md` for frontend dev commands.

Start the two parts (example):

```bash
# from repo root
cd backend && pnpm install && pnpm run start:dev
cd ../frontend && pnpm install && pnpm run dev
```

## Contributing
Contributions, bug reports, and feature requests are welcome. Please open issues and PRs against this repository.

## License
MIT (or choose a license appropriate for your project)
