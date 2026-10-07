import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { AuditLogDto, CreateOrderRequest, OrderDto, TransactionDto } from '../contracts.js'
import { CreateOrderBodySchema } from '../agent/schemas.js'
import { normalizeGhanaPhone } from '../agent/sms-parser.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import prisma from '../prisma/client.js'

// Prisma returns Date objects; they serialise to ISO strings, which is what the DTOs declare.
type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }
const serialize = <T>(value: T) => value as unknown as Serialized<T>

@Controller('api')
export class LedgerController {
  @SkipThrottle()
  @Get('orders')
  async orders(): Promise<OrderDto[]> {
    const rows = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return rows.map(serialize)
  }

  @Post('orders')
  async createOrder(@Body(new ZodValidationPipe(CreateOrderBodySchema)) body: CreateOrderRequest): Promise<OrderDto> {
    const row = await prisma.order.create({
      data: { ...body, customerPhone: normalizeGhanaPhone(body.customerPhone) ?? body.customerPhone },
    })
    return serialize(row)
  }

  @SkipThrottle()
  @Get('transactions')
  async transactions(): Promise<TransactionDto[]> {
    const rows = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { order: { select: { id: true, customerName: true, expectedAmount: true, status: true } } },
    })
    return rows.map((r) => ({ ...serialize(r), order: r.order }))
  }

  @SkipThrottle()
  @Get('audit')
  async audit(@Query('runId') runId?: string): Promise<AuditLogDto[]> {
    const rows = await prisma.auditLog.findMany({
      where: runId ? { runId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map(serialize)
  }
}
