import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import type { Observable } from 'rxjs'
import type { AgentEvent, DecisionRequest, IngestRequest, IngestResponse, RunSummary } from '../contracts.js'
import { AgentService, InvalidDecisionError, RunNotFoundError } from '../agent/agent.service.js'
import { DecisionBodySchema, IngestBodySchema } from '../agent/schemas.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'

const HEARTBEAT_MS = 15_000

/** Writes an Observable of agent events to the response as Server-Sent Events. */
function pipeSse(events: Observable<AgentEvent>, req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  // Some proxies (including Vite's dev proxy) hold the headers until the first body bytes arrive.
  res.write(': connected\n\n')

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  const sub = events.subscribe({
    next: (evt) => res.write(`id: ${evt.runId}:${evt.seq}\nevent: agent\ndata: ${JSON.stringify(evt)}\n\n`),
    complete: () => {
      res.write('event: end\ndata: {}\n\n')
      res.end()
    },
  })
  req.on('close', () => {
    clearInterval(heartbeat)
    sub.unsubscribe()
  })
}

@Controller('api/reconcile')
export class ReconcileController {
  constructor(private readonly agent: AgentService) {}

  @Post('ingest')
  ingest(@Body(new ZodValidationPipe(IngestBodySchema)) body: IngestRequest): IngestResponse {
    return { runId: this.agent.startRun(body.rawSms) }
  }

  @Post(':runId/decision')
  @HttpCode(202)
  decide(@Param('runId', ParseUUIDPipe) runId: string, @Body(new ZodValidationPipe(DecisionBodySchema)) body: DecisionRequest) {
    try {
      this.agent.decide(runId, body.decision, body.note)
      return { accepted: true }
    } catch (err) {
      if (err instanceof RunNotFoundError) throw new NotFoundException(err.message)
      if (err instanceof InvalidDecisionError) throw new BadRequestException(err.message)
      throw err
    }
  }

  @SkipThrottle()
  @Get('runs')
  runs(): RunSummary[] {
    return this.agent.listRuns()
  }

  /** Live events for all runs. Connect before calling GET /runs to avoid missing events. */
  @SkipThrottle()
  @Get('events')
  allEvents(@Req() req: Request, @Res() res: Response) {
    pipeSse(this.agent.streamAll(), req, res)
  }

  /** Full replay + live events for one run; the stream ends when the run finishes. */
  @SkipThrottle()
  @Get('stream/:runId')
  stream(@Param('runId', ParseUUIDPipe) runId: string, @Req() req: Request, @Res() res: Response) {
    const events = this.agent.streamRun(runId)
    if (!events) throw new NotFoundException('Run not found')
    pipeSse(events, req, res)
  }
}
