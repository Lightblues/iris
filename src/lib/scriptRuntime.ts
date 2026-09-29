import { connectAllows, parseScript, type ScriptMeta } from './scriptMeta'
import { listStoredScripts } from './scriptStore'

const GM_KEY = 'iris_gm_values'
const CAP = 500_000
const ERROR_KEY = 'iris_script_register_error'

let registerError: string | null = null
export function userScriptRuntimeError(): string | null {
  return registerError
}

async function persistRegisterError(): Promise<string | null> {
  if (registerError) await chrome.storage.local.set({ [ERROR_KEY]: registerError })
  else await chrome.storage.local.remove(ERROR_KEY)
  return registerError
}

export async function syncUserScripts(): Promise<string | null> {
  registerError = null
  const api = chrome.userScripts
  if (!api?.register) {
    registerError = 'chrome.userScripts is unavailable. Enable Allow user scripts on the extension card.'
    return persistRegisterError()
  }
  try {
    const existing = await api.getScripts()
    const ids = existing.map(s => s.id).filter(id => id.startsWith('iris-'))
    if (ids.length) await api.unregister({ ids })

    const rows = await listStoredScripts()
    const regs = []
    for (const row of rows) {
      if (!row.enabled) continue
      const meta = parseScript(row.source)
      if ('error' in meta || meta.matches.length === 0) continue
      const required = await loadRequires(meta.requires)
      regs.push({
        id: `iris-${row.id}`,
        matches: meta.matches,
        ...(meta.excludes.length ? { excludeMatches: meta.excludes } : {}),
        js: [{ code: wrapScript(row.id, meta, required, row.source) }],
        runAt: meta.runAt,
        world: meta.world,
      })
    }
    if (regs.length) await api.register(regs)
  } catch (err) {
    registerError = (err as Error).message || String(err)
    console.warn('[Iris] userScripts register failed:', registerError)
  }
  await persistRegisterError()
  return registerError
}

async function loadRequires(urls: string[]): Promise<string> {
  const parts: string[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const text = await res.text()
      parts.push(text.slice(0, CAP))
    } catch (err) {
      parts.push(`/* @require failed: ${url} (${(err as Error).message}) */`)
    }
  }
  return parts.join('\n')
}

export function wrapScript(id: string, meta: ScriptMeta, required: string, source: string): string {
  const grants = new Set(meta.grants)
  const want = (name: string) => grants.has(name)
  const lines: string[] = ['(function () {']
  if (meta.kind === 'agent') lines.push(POLYFILL)
  lines.push(`const __irisScriptId = ${JSON.stringify(id)};`)
  lines.push(`const __irisGrants = ${JSON.stringify(meta.webmcp)};`)
  lines.push(IRIS_CALL)
  lines.push(`const GM_info = ${JSON.stringify({ script: { name: meta.name, version: meta.version, description: meta.description }, scriptHandler: 'iris' })};`)
  lines.push('const GM = {};')
  lines.push(`function GM_log() { return __irisCall('log', { args: Array.from(arguments).map(String) }); }`)
  lines.push('GM.log = GM_log;')
  if (want('GM_getValue') || want('GM.getValue')) {
    lines.push(`function GM_getValue(key, def) { return __irisCall('getValue', { key: key, def: def }); }`)
    lines.push('GM.getValue = GM_getValue;')
  }
  if (want('GM_setValue') || want('GM.setValue')) {
    lines.push(`function GM_setValue(key, value) { return __irisCall('setValue', { key: key, value: value }); }`)
    lines.push('GM.setValue = GM_setValue;')
  }
  if (want('GM_deleteValue') || want('GM.deleteValue')) {
    lines.push(`function GM_deleteValue(key) { return __irisCall('deleteValue', { key: key }); }`)
    lines.push('GM.deleteValue = GM_deleteValue;')
  }
  if (want('GM_listValues') || want('GM.listValues')) {
    lines.push(`function GM_listValues() { return __irisCall('listValues', {}); }`)
    lines.push('GM.listValues = GM_listValues;')
  }
  if (want('GM_addStyle')) {
    lines.push(`function GM_addStyle(css) { const el = document.createElement('style'); el.textContent = css; (document.head || document.documentElement).appendChild(el); return el; }`)
    lines.push('GM.addStyle = GM_addStyle;')
  }
  if (want('GM_setClipboard')) {
    lines.push(`function GM_setClipboard(text) { return __irisCall('clipboard', { text: String(text) }); }`)
    lines.push('GM.setClipboard = GM_setClipboard;')
  }
  if (want('GM_openInTab')) {
    lines.push(`function GM_openInTab(url, options) { const active = typeof options === 'boolean' ? !options : !(options && options.active === false && options.loadInBackground !== true); return __irisCall('openTab', { url: url, active: active }); }`)
    lines.push('GM.openInTab = GM_openInTab;')
  }
  if (want('GM_xmlhttpRequest')) {
    lines.push(`function GM_xmlhttpRequest(details) { const p = __irisCall('xhr', { url: details.url, method: details.method || 'GET', headers: details.headers || null, data: details.data || null }); p.then(function (res) { details.onload && details.onload(res); }, function (err) { details.onerror && details.onerror(err); }); return { abort: function () {} }; }`)
    lines.push('GM.xmlhttpRequest = function (details) { return __irisCall("xhr", { url: details.url, method: details.method || "GET", headers: details.headers || null, data: details.data || null }); };')
  }
  if (want('unsafeWindow')) {
    lines.push('const unsafeWindow = window;')
  }
  if (required) lines.push(required)
  if (meta.kind === 'agent') {
    lines.push(AGENT_SCOPE_START)
    lines.push(source)
    lines.push(AGENT_SCOPE_END)
  } else {
    lines.push('try {')
    lines.push(source)
    lines.push(SCRIPT_CATCH)
  }
  lines.push('})();')
  return lines.join('\n')
}

const IRIS_CALL = `
function __irisCall(method, payload) {
  const id = Math.random().toString(36).slice(2);
  return new Promise(function (resolve, reject) {
    let wait = null;
    const timer = setTimeout(function () { cleanup(); reject(new Error('iris gm timeout')); }, 20000);
    function cleanup() { clearTimeout(timer); if (wait) clearInterval(wait); window.removeEventListener('message', onResponse); }
    function onResponse(ev) {
      const data = ev.data;
      if (!data || data.source !== 'iris-gm-response' || data.id !== id) return;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    }
    window.addEventListener('message', onResponse);
    function send() {
      window.postMessage({ source: 'iris-gm-request', id: id, scriptId: __irisScriptId, method: method, payload: payload }, '*');
    }
    if (document.documentElement && document.documentElement.getAttribute('data-iris-gm') === '1') send();
    else {
      wait = setInterval(function () {
        if (!(document.documentElement && document.documentElement.getAttribute('data-iris-gm') === '1')) return;
        clearInterval(wait);
        wait = null;
        send();
      }, 10);
    }
  });
}
`

const SCRIPT_CATCH = `
} catch (__irisErr) {
  var __irisMsg = (__irisErr && (__irisErr.stack || __irisErr.message)) || String(__irisErr);
  try { GM_log(__irisMsg); } catch (e) { console.error('[Iris]', __irisMsg); }
}
`

const POLYFILL = `
(function () {
  function nativeCtx() {
    try { if (document.modelContext && document.modelContext.registerTool) return document.modelContext; } catch (e) {}
    try { if (navigator.modelContext && navigator.modelContext.registerTool) return navigator.modelContext; } catch (e) {}
    return null;
  }
  var existing = nativeCtx();
  if (existing) {
    try { if (!navigator.modelContext) navigator.modelContext = existing; } catch (e) {}
    try { if (!document.modelContext) document.modelContext = existing; } catch (e) {}
    return;
  }
  var tools = new Map();
  var ctx = {
    registerTool: function (tool) {
      tools.set(tool.name, tool);
      return Promise.resolve();
    },
    getTools: function () {
      return Promise.resolve(Array.from(tools.values()).map(function (tool) {
        return { name: tool.name, description: tool.description || '', inputSchema: tool.inputSchema || { type: 'object', properties: {} }, readOnlyHint: !!(tool.annotations && tool.annotations.readOnlyHint), permission: tool.__irisPerm || 'allow' };
      }));
    },
    executeTool: function (name, args) {
      var tool = tools.get(name);
      if (!tool) return Promise.reject(new Error('unknown tool: ' + name));
      return Promise.resolve(tool.execute(args || {}));
    },
  };
  try { document.modelContext = ctx; } catch (e) {}
  try { navigator.modelContext = ctx; } catch (e) {
    try { Object.defineProperty(Navigator.prototype, 'modelContext', { configurable: true, get: function () { return ctx; } }); } catch (e2) {}
  }
})();
`

/**
 * Shadows `document` / `navigator` with proxies that gate `modelContext.registerTool` on the
 * `@webmcp` grants. The shadows are function parameters, not `const`: declaring them in the same
 * scope that reads the real globals puts those reads in the temporal dead zone, which threw before
 * the script body ran a single line. Traps read through the real target so DOM getters and methods
 * keep their brand checks.
 */
const AGENT_SCOPE_START = `
const __irisScope = (function (__pageDocument, __pageNavigator) {
  function __irisGuard(mc) {
    if (!mc) return mc;
    return new Proxy(mc, {
      get: function (t, p) {
        if (p !== 'registerTool') {
          const v = t[p];
          return typeof v === 'function' ? v.bind(t) : v;
        }
        return function (tool) {
          const perm = __irisGrants[tool.name];
          if (!perm || perm === 'deny') throw new Error('webmcp not granted: ' + tool.name);
          tool.__irisPerm = perm;
          const bag = window.__irisWebmcpPerms || (window.__irisWebmcpPerms = {});
          bag[tool.name] = perm;
          return t.registerTool(tool);
        };
      }
    });
  }
  function __irisShadow(target, modelContext) {
    return new Proxy(target, {
      get: function (t, p) {
        if (p === 'modelContext') return __irisGuard(modelContext());
        const v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set: function (t, p, v) { t[p] = v; return true; },
    });
  }
  return [
    __irisShadow(__pageDocument, function () { return __pageDocument.modelContext; }),
    __irisShadow(__pageNavigator, function () { return __pageNavigator.modelContext || __pageDocument.modelContext; }),
  ];
})(document, navigator);
(async function (document, navigator) {
  try {
`

const AGENT_SCOPE_END = `
  } catch (__irisErr) {
    var __irisMsg = (__irisErr && (__irisErr.stack || __irisErr.message)) || String(__irisErr);
    try { GM_log(__irisMsg); } catch (e) { console.error('[Iris]', __irisMsg); }
  }
})(__irisScope[0], __irisScope[1]);
`

async function gmBag(): Promise<Record<string, Record<string, unknown>>> {
  const bag = await chrome.storage.local.get(GM_KEY)
  return (bag[GM_KEY] as Record<string, Record<string, unknown>>) ?? {}
}

export async function handleGmRequest(scriptId: string, method: string, payload: any): Promise<unknown> {
  if (method === 'getValue' || method === 'setValue' || method === 'deleteValue' || method === 'listValues') {
    const all = await gmBag()
    const values = all[scriptId] ?? {}
    if (method === 'getValue') return payload.key in values ? values[payload.key] : payload.def
    if (method === 'listValues') return Object.keys(values)
    if (method === 'deleteValue') delete values[payload.key]
    else values[payload.key] = payload.value
    all[scriptId] = values
    await chrome.storage.local.set({ [GM_KEY]: all })
    return true
  }
  if (method === 'openTab') {
    const tab = await chrome.tabs.create({ url: payload.url, active: payload.active !== false })
    return { tabId: tab.id }
  }
  if (method === 'xhr') {
    const rows = await listStoredScripts()
    const row = rows.find(r => r.id === scriptId)
    const meta = row ? parseScript(row.source) : null
    if (!meta || 'error' in meta) throw new Error('unknown script')
    if (!connectAllows(meta.connect, payload.url)) throw new Error(`@connect does not allow ${payload.url}`)
    const res = await fetch(payload.url, {
      method: payload.method || 'GET',
      headers: payload.headers || undefined,
      body: payload.data ?? undefined,
    })
    const responseText = await res.text()
    return {
      status: res.status,
      statusText: res.statusText,
      responseText,
      response: responseText,
      responseHeaders: Array.from(res.headers.entries()).map(([k, v]) => `${k}: ${v}`).join('\n'),
      finalUrl: res.url,
    }
  }
  throw new Error(`Unknown GM method: ${method}`)
}
