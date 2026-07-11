import { createLogger } from "@/utils/logger";

const log = createLogger("alarmManager");

const KEEP_ALIVE_ALARM = "ssai-keep-alive";

/**
 * MV3 service workers are terminated after ~30s of inactivity, which would
 * otherwise interrupt a long-running queue. A periodic alarm is the
 * supported way to keep the worker alive across a multi-item processing run
 * without relying on any workaround APIs.
 */
export function registerAlarms(): void {
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.4 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM) {
      log.debug("Keep-alive tick.");
    }
  });
}
