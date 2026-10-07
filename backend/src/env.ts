/**
 * Validates required environment variables at startup.
 * Call this from main.ts before bootstrapping the NestJS app.
 */
const REQUIRED: string[] = ['DATABASE_URL']

const RECOMMENDED: string[] = ['OPENAI_API_KEY']

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[startup] Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  const absent = RECOMMENDED.filter((k) => !process.env[k])
  if (absent.length > 0) {
    console.warn(`[startup] Recommended env vars not set (features degraded): ${absent.join(', ')}`)
  }
}
