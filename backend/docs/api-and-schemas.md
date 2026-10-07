# API, events and agent graph

All request/response and event types live in [`src/contracts.ts`](../src/contracts.ts). The frontend imports that file directly, so both sides compile against the same shapes. Request bodies are validated with the Zod schemas in [`src/agent/schemas.ts`](../src/agent/schemas.ts), and compile-time checks there keep the Zod schemas and the contract in sync.

## REST

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/reconcile/ingest` | `{ rawSms }` | `{ runId }` and starts a graph run |
| `POST` | `/api/reconcile/:runId/decision` | `{ decision: 'ACCEPT' \| 'REQUEST_BALANCE' \| 'REJECT', note? }` | `202`, or `400` if the decision is not allowed or the run is not paused, `404` if the run is unknown |
| `GET` | `/api/reconcile/runs` | – | `RunSummary[]`: recent runs held in memory, with their events and any pending review |
| `GET` | `/api/orders` | – | `OrderDto[]` |
| `POST` | `/api/orders` | `{ customerName, customerPhone, expectedAmount }` | `OrderDto` |
| `GET` | `/api/transactions` | – | `TransactionDto[]` including the linked order |
| `GET` | `/api/audit?runId=` | – | `AuditLogDto[]` |

## Server-Sent Events

- `GET /api/reconcile/events`: live events from **all** runs. Connect first, then call `GET /runs` for history. Events are idempotent by `(runId, seq)`.
- `GET /api/reconcile/stream/:runId`: **replays** every event of one run and then streams live events until the run finishes. A late subscriber never misses anything.

Each message is `event: agent` with an `AgentEvent` payload:

```json
{ "runId": "…", "seq": 7, "at": "2026-10-07T13:04:45.085Z", "type": "tool_call", "node": "check_duplicate", "message": "Calling find_transaction", "data": { "tool": "find_transaction", "input": { "momoTxId": "51234567890" } } }
```

`type` is one of `run_started`, `node_started`, `thought`, `tool_call`, `tool_result`, `review_required`, `review_resolved`, `run_completed`, `run_failed`.

## Reconciliation graph (LangGraph `StateGraph`)

```
START → parse_sms ─(unparseable)→ END
          ↓
     check_duplicate ─(seen momoTxId)→ END   [DUPLICATE]
          ↓
      match_order ─(exact)→ settle_payment → END   [order VERIFIED]
          ↓ (under / over / unmatched)
    flag_discrepancy → human_review ⏸ interrupt() → apply_decision → END
```

- **parse_sms**: with `OPENAI_API_KEY`, gpt-4o-mini extracts the fields through Zod structured output. The result is accepted only if the transaction ID, phone and amount actually appear in the SMS. Otherwise, or without a key, a deterministic MTN/Telecel/AT parser runs.
- **match_order**: the payer is matched to a pending order by phone, then by name, then by amount (used only when exactly one pending order has that amount). Amounts are compared in integer pesewas.
- **human_review** pauses with `interrupt()`. `POST /decision` resumes it with `Command({ resume })`. Allowed decisions: underpayment → accept / request balance / reject; overpayment → accept / reject; unmatched → reject.
- All database writes go through Zod-typed LangChain tools (`src/agent/tools.ts`). Order updates are conditional on the current status, so concurrent runs cannot both claim an order.

## Decision effects

| Decision | Order | Transaction |
|---|---|---|
| Exact match (automatic) | `VERIFIED` | linked |
| `ACCEPT` | `VERIFIED` | linked |
| `REQUEST_BALANCE` | stays `DISCREPANCY_FLAGGED` | linked |
| `REJECT` | `REJECTED` | unlinked; kept so the `momoTxId` cannot be replayed |
| Duplicate | unchanged | not created |

## Limitations

- Paused runs are checkpointed in memory (`MemorySaver`). A backend restart loses pending reviews, although the flagged orders and transactions stay in Postgres. A persistent checkpointer (Postgres or Redis) is the next step.
- `Transaction.orderId` is unique (1:1, per the spec schema), so a follow-up balance payment cannot be linked to an order that already has a transaction.
