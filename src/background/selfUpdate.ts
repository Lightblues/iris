// An unpacked install serves its files from disk, so after `scripts/install.sh` replaces them
// the manifest on disk is newer than the running one; reload to pick the new build up.
const ALARM = 'iris-self-update';

export async function checkForUpdate(): Promise<boolean> {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const { version } = await res.json() as { version?: string };
    if (!version || version === chrome.runtime.getManifest().version) return false;
    console.log('[Iris] new build on disk:', version, '→ reloading');
    chrome.runtime.reload();
    return true;
  } catch {
    return false;
  }
}

export function initSelfUpdate() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void checkForUpdate(); });
  void checkForUpdate();
}
