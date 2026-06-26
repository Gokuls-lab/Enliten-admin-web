/**
 * scheduler/news-scheduler.ts
 *
 * Standalone news-fetching cron microservice. Run this as a long-lived Node
 * process on your server, VPS, Docker container, PM2, systemd, Render worker,
 * Railway worker, etc. It does not depend on Vercel Cron.
 *
 * Usage:
 *   npm run cron:news
 *   npm run scheduler
 *
 * Environment:
 *   NEWS_FETCH_INTERVAL_HOURS=4       Interval between successful ticks
 *   NEWS_FETCH_RUN_ON_STARTUP=true    Run immediately when service starts
 *   NEWS_FETCH_HEALTH_PORT=3001       Optional /health HTTP endpoint
 */

import { createServer, type Server } from 'node:http';
import * as dotenv from 'dotenv';
import { fetchAndStoreNews } from '../api/fetch-news.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

type LastRun = {
  runId: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  id?: string;
  totalItems?: number;
  error?: string;
};

function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[SCHEDULER] Invalid ${name}="${raw}". Using ${fallback}.`);
    return fallback;
  }

  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const INTERVAL_HOURS = readPositiveNumber('NEWS_FETCH_INTERVAL_HOURS', 4);
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1_000;
const RUN_ON_STARTUP = readBoolean('NEWS_FETCH_RUN_ON_STARTUP', true);
const HEALTH_PORT = process.env.NEWS_FETCH_HEALTH_PORT
  ? readPositiveNumber('NEWS_FETCH_HEALTH_PORT', 3001)
  : null;

let runCount = 0;
let isRunning = false;
let stopped = false;
let nextTimer: ReturnType<typeof setTimeout> | null = null;
let nextRunAt: string | null = null;
let lastRun: LastRun | null = null;
let healthServer: Server | null = null;

function scheduleNext(delayMs = INTERVAL_MS): void {
  if (stopped) return;

  if (nextTimer) {
    clearTimeout(nextTimer);
  }

  nextRunAt = new Date(Date.now() + delayMs).toISOString();
  nextTimer = setTimeout(() => {
    void runNewsJob();
  }, delayMs);

  console.log(`[SCHEDULER] Next run scheduled at ${nextRunAt}.`);
}

async function runNewsJob(): Promise<void> {
  if (isRunning) {
    console.warn(`[SCHEDULER] Previous job still running. Skipping this tick.`);
    scheduleNext();
    return;
  }

  isRunning = true;
  runCount += 1;
  const runId = runCount;
  const startedAt = new Date().toISOString();

  console.log(`
[SCHEDULER] Run #${runId} started at ${startedAt}.`);

  try {
    const result = await fetchAndStoreNews();
    const finishedAt = new Date().toISOString();

    lastRun = {
      runId,
      startedAt,
      finishedAt,
      success: result.success,
      id: result.id,
      totalItems: result.total_items,
      error: result.error,
    };

    if (result.success) {
      console.log(`[SCHEDULER] Run #${runId} complete. DB id=${result.id}, total_items=${result.total_items}.`);
    } else {
      console.error(`[SCHEDULER] Run #${runId} failed: ${result.error}`);
    }
  } catch (err: unknown) {
    const finishedAt = new Date().toISOString();
    const error = getErrorMessage(err);

    lastRun = {
      runId,
      startedAt,
      finishedAt,
      success: false,
      error,
    };

    console.error(`[SCHEDULER] Run #${runId} threw an unexpected error: ${error}`);
  } finally {
    isRunning = false;
    if (!stopped) scheduleNext();
  }
}

function startHealthServer(): void {
  if (!HEALTH_PORT) return;

  healthServer = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'news-scheduler',
      isRunning,
      intervalHours: INTERVAL_HOURS,
      nextRunAt,
      lastRun,
      uptimeSeconds: Math.round(process.uptime()),
    }));
  });

  healthServer.listen(HEALTH_PORT, () => {
    console.log(`[SCHEDULER] Health endpoint listening on http://localhost:${HEALTH_PORT}/health.`);
  });
}

function shutdown(signal: string): void {
  console.log(`
[SCHEDULER] Received ${signal}. Shutting down...`);
  stopped = true;

  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }

  if (healthServer) {
    healthServer.close(() => process.exit(0));
    return;
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('=======================================================');
console.log('  Enliten News Scheduler microservice starting');
console.log(`  Interval       : every ${INTERVAL_HOURS} hour(s)`);
console.log(`  Run on startup : ${RUN_ON_STARTUP}`);
console.log(`  Health port    : ${HEALTH_PORT ?? 'disabled'}`);
console.log(`  Started        : ${new Date().toISOString()}`);
console.log('=======================================================');

startHealthServer();

if (RUN_ON_STARTUP) {
  void runNewsJob();
} else {
  scheduleNext();
}
