Agent core

This folder contains a minimal agent service that demonstrates starting a reconciliation run and streaming agent events via SSE.

Endpoints:

- POST /api/reconcile/ingest
  - Body: { rawText: string, source?: string }
  - Response: { runId }

- GET /api/reconcile/stream/:runId
  - SSE stream of agent events. Each event has shape: { id, kind, payload, timestamp }

- POST /api/reconcile/:runId/approve
  - Body: { action: 'approve'|'reject'|'escalate', actorId?: string, note?: string }
  - Response: { success: true }

Notes:
- This implementation is a scaffold and emits simulated events. Replace with actual LLM/Tool orchestration using @langchain/langgraph and your tool adapters.
