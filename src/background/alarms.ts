import { flushActivePage } from './tracing';
import { cleanupExpired } from '../lib/tabTrash';
import { cleanupOldEvents } from '../lib/tracing';

export function scheduleAlarms(): void {
  // Schedule periodic trash cleanup (daily)
  chrome.alarms.create('cleanup-trash', {
    periodInMinutes: 24 * 60,
    when: Date.now() + 60000 // Start after 1 minute
  });

  // Tracing alarms
  chrome.alarms.create('flush-tracing', { periodInMinutes: 5 });
  chrome.alarms.create('cleanup-events', { periodInMinutes: 24 * 60, when: Date.now() + 120000 });
}

export function initAlarms(): void {
  // Handle alarms (periodic tasks)
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'cleanup-trash') {
      const removed = await cleanupExpired();
      console.log(`[Iris] Cleaned up ${removed} expired trash items`);
    } else if (alarm.name === 'flush-tracing') {
      await flushActivePage();
    } else if (alarm.name === 'cleanup-events') {
      const removed = await cleanupOldEvents(30);
      console.log(`[Iris] Cleaned up ${removed} old event days`);
    }
  });
}
