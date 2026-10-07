import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AgentModule } from './agent/agent.module.js';
import { ReconcileController } from './reconcile/reconcile.controller.js';
import { AppService } from './app.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// Only enable ObserveModule when explicit credentials are provided via env.
// This prevents accidental 401 telemetry rejections in local/dev environments.
const observeImports = [] as any[];
if (process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET) {
  observeImports.push(
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY,
      appSecret: process.env.OBSERVE_APP_SECRET,
      serviceId: process.env.SERVICE_ID || 'backend',
    }),
  );
} else {
  // eslint-disable-next-line no-console
  console.log('ObserveModule disabled — set OBSERVE_APP_KEY and OBSERVE_APP_SECRET to enable telemetry');
}

@Module({
  imports: [
    // include ObserveModule conditionally
    ...observeImports,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    AgentModule,
  ],
  controllers: [AppController, ReconcileController],
  providers: [
    AppService,
    // Apply rate limiting globally (20 requests per 60 s per IP)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
