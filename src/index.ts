import cron from "node-cron";
import { config } from "./config";
import { runOnce } from "./pipeline";
import { startServer } from "./server";

async function safeRun(label: string) {
  console.log(`[cron] ${label} firing at ${new Date().toISOString()}`);
  try {
    await runOnce();
    console.log(`[cron] ${label} done`);
  } catch (err) {
    console.error(`[cron] ${label} failed:`, err);
  }
}

function main() {
  // Start the small dashboard so we can monitor posts and OAuth TikTok.
  startServer();

  const opts = { timezone: config.scheduler.tz };
  cron.schedule(config.scheduler.morningCron, () => safeRun("morning"), opts);
  cron.schedule(config.scheduler.eveningCron, () => safeRun("evening"), opts);

  console.log(`[scheduler] Monty is running.`);
  console.log(`[scheduler]   morning: ${config.scheduler.morningCron} (${config.scheduler.tz})`);
  console.log(`[scheduler]   evening: ${config.scheduler.eveningCron} (${config.scheduler.tz})`);
  console.log(`[scheduler]   dashboard: http://localhost:${config.dashboard.port}`);
}

main();
