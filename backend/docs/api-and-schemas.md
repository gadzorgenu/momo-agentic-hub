# API & Zod Schemas (Design Draft)

This document contains the REST/SSE API contract and Zod tool schemas used by the agent.

## SSE Event Types
- `thought`: Agent internal reasoning snippet. Payload: `{ id, kind: 'thought', text, timestamp }`
- `tool_call`: Tool invocation. Payload: `{ id, kind: 'tool_call', tool, input, timestamp }`
- `tool_result`: Tool result. Payload: `{ id, kind: 'tool_result', tool, output, timestamp }`
- `approval_required`: Agent paused, awaiting human decision. Payload: `{ id, kind: 'approval_required', reason, options, details, timestamp }`
- `final_status`: Final reconciliation outcome. Payload: `{ id, kind: 'final_status', status, orderId, summary, timestamp }`
- `error`: Error event. Payload: `{ id, kind: 'error', message, detail, timestamp }`

Examples of SSE event envelope:

```json
{ "event": "tool_call", "data": { "id": "run-123", "tool": "verifyMomoReceipt", "input": { ... }, "timestamp": "2026-09-29T12:00:00Z" } }
```

## REST Endpoints (high-level)
- `POST /api/reconcile/ingest` — Ingest raw receipt or webhook payload. Body: `{ source, rawText, receivedAt, metadata? }`. Returns reconciliation run id.
- `GET /api/reconcile/stream/:runId` — SSE stream of agent events for run `:runId`.
- `POST /api/reconcile/:runId/approve` — Human approval action: `{ action: 'approve'|'reject'|'escalate', actorId, note? }`.
- `GET /api/orders/:orderId` — Fetch order details.
- `POST /api/orders/:orderId/status` — Update order status (used by `updateOrderStatus` tool).

## Zod Tool Schemas (summary)
- Tools are Zod-validated (input & output) to protect against hallucinated side effects.

Defined tools (core): `fetchOrderDetails`, `verifyMomoReceipt`, `updateOrderStatus`.

See `backend/src/tools/schemas.ts` for concrete Zod types and example shapes.
