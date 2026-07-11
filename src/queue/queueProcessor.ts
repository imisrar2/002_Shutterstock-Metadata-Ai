/**
 * Queue Processor — Public API
 *
 * Thin facade over the automation engine. All processing logic now lives
 * in automationEngine.ts; this module just re-exports the public control
 * functions to keep imports backward-compatible.
 */
export {
  startProcessing,
  pauseProcessing,
  resumeProcessing,
  stopProcessing,
  clearQueue,
  skipCurrent,
  retryFailed,
  restartQueue,
  estimatedRemainingMs,
} from "@/background/automationEngine";
