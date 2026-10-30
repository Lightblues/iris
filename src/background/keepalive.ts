// MV3 service workers are torn down when idle, which drops File System Access
// permission grants mid-export. Tag each instance so the content script can
// detect a restart, and accept a keepalive port to prevent one.
export const SW_INSTANCE = 'sw-' + Date.now().toString(36);
console.log('[Iris] SW instance:', SW_INSTANCE);

export function initKeepalive(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'iris-keepalive') return;
    console.log('[Iris] keepalive port opened on', SW_INSTANCE);
    port.onDisconnect.addListener(() => {
      console.log('[Iris] keepalive port closed');
    });
  });
}
