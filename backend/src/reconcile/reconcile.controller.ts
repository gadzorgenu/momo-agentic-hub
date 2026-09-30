import { Controller, Get, Post, Body, Param, Req, Res, NotFoundException } from '@nestjs/common'
import { AgentService } from '../agent/agent.service.js'
import type { Request, Response } from 'express'
import prisma from '../prisma/client.js'

@Controller('api/reconcile')
export class ReconcileController {
  constructor(private readonly agentService: AgentService) {}

  @Post('ingest')
  ingest(@Body() body: { rawText: string; source?: string }) {
    const { rawText, source } = body
    const runId = this.agentService.startRun(rawText, source)
    return { runId }
  }

  @Get('stream/:runId')
  stream(@Param('runId') runId: string, @Req() req: Request, @Res() res: Response) {
    const subject = this.agentService.getRunStream(runId)
    if (!subject) throw new NotFoundException('Run not found or already completed')

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sub = subject.subscribe({
      next: (evt) => {
        res.write(`event: message\n`)
        res.write(`data: ${JSON.stringify(evt)}\n\n`)
      },
      error: (err) => {
        res.write(`event: error\n`)
        res.write(`data: ${JSON.stringify({ message: String(err) })}\n\n`)
        res.end()
      },
      complete: () => {
        res.write(`event: end\n`)
        res.write(`data: ${JSON.stringify({ runId })}\n\n`)
        res.end()
      },
    })

    req.on('close', () => {
      sub.unsubscribe()
    })
  }

  @Post(':runId/approve')
  approve(@Param('runId') runId: string, @Body() body: { action: 'approve' | 'reject' | 'escalate'; actorId?: string; note?: string }) {
    const ok = this.agentService.approve(runId, body.action, body.actorId, body.note)
    if (!ok) throw new NotFoundException('Run not found or already completed')
    return { success: true }
  }

  @Get('attempts')
  async attempts(@Req() req: Request) {
    // Return recent reconciliation attempts for audit trail; allow optional ?runId= filter
    const runId = (req.query as any)?.runId
    const where: any = {}
    if (runId) where.runId = String(runId)
    const recent = await prisma.reconciliationAttempt.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 })
    return recent
  }
}
