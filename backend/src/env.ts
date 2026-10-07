/**
 * Loads backend/.env and validates required environment variables.
 * Import this first in main.ts so values are set before other modules read them.
 */
try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on the real environment (CI, containers).
}

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
