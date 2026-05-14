import { DebuggerSessionManager } from './debugger-session';
import { isAllowedDebugUrl } from './url-policy';
import type { CookieDeleteInput, CookieInput, IndexedDbKeySpec, WebStorageSnapshot } from '../shared/cdp-types';
import type {
  ActiveTabInfo,
  CookiesResult,
  ExtensionRequest,
  ExtensionResponse,
  IndexedDbDatabasesResult,
  IndexedDbEntriesResult,
  WebStorageResult
} from '../shared/extension-messages';

const manager = new DebuggerSessionManager();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  // 컨텍스트 메뉴 생성
  chrome.contextMenus.create({
    id: 'bluesec-inspector',
    title: '이 창에서 BlueSec Inspector 열기',
    contexts: ['page', 'selection', 'link', 'image']
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'bluesec-inspector') {
    if (tab?.id) {
      await openDetachedWindow(tab.id);
    } else {
      // tab 정보가 없으면 현재 활성 탭 사용
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await openDetachedWindow(activeTab.id);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
  handleRequest(request).then(sendResponse);
  return true;
});

async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  try {
    switch (request.type) {
      case 'GET_ACTIVE_TAB':
        return ok(await getActiveTab());
      case 'GET_TAB':
        return ok(await getTab(request.tabId));
      case 'OPEN_DETACHED_WINDOW':
        return await openDetachedWindow(request.tabId);
      case 'ATTACH':
        return await attach(request.tabId);
      case 'DETACH':
        await manager.detach(request.tabId);
        return ok(null);
      case 'GET_SESSION_STATE':
        return ok(manager.getState(request.tabId));
      case 'EVALUATE':
        return ok(await manager.sendCommand(request.tabId, 'Runtime.evaluate', {
          expression: request.expression,
          awaitPromise: true,
          replMode: true,
          includeCommandLineAPI: true,
          generatePreview: true,
          objectGroup: 'bluesec-inspector-console',
          ...(request.contextId ? { contextId: request.contextId } : {})
        }));
      case 'GET_PROPERTIES':
        return ok(await manager.sendCommand(request.tabId, 'Runtime.getProperties', {
          objectId: request.objectId,
          ownProperties: false,
          accessorPropertiesOnly: false,
          generatePreview: true
        }));
      case 'RELEASE_CONSOLE_OBJECTS':
        await manager.releaseConsoleObjects(request.tabId);
        return ok(null);
      case 'GET_COOKIES':
        return ok(await getCookies(request.tabId));
      case 'SET_COOKIE':
        return ok(await setCookie(request.tabId, request.cookie));
      case 'DELETE_COOKIE':
        return ok(await deleteCookie(request.tabId, request.cookie));
      case 'GET_WEB_STORAGE':
        return ok(await getWebStorage(request.tabId));
      case 'SET_WEB_STORAGE_ITEM':
        return ok(await setWebStorageItem(request.tabId, request.area, request.key, request.value, request.previousKey));
      case 'DELETE_WEB_STORAGE_ITEM':
        return ok(await deleteWebStorageItem(request.tabId, request.area, request.key));
      case 'GET_INDEXED_DB_DATABASES':
        return ok(await getIndexedDbDatabases(request.tabId));
      case 'GET_INDEXED_DB_ENTRIES':
        return ok(await getIndexedDbEntries(request.tabId, request.databaseName, request.objectStoreName, request.skipCount, request.pageSize));
      case 'DELETE_INDEXED_DB_ENTRY':
        return ok(await deleteIndexedDbEntry(request.tabId, request.databaseName, request.objectStoreName, request.key));
      case 'CLEAR_INDEXED_DB_STORE':
        return ok(await clearIndexedDbStore(request.tabId, request.databaseName, request.objectStoreName));
      case 'DELETE_INDEXED_DB_DATABASE':
        return ok(await deleteIndexedDbDatabase(request.tabId, request.databaseName));
      case 'START_INSPECT_MODE':
        await manager.startInspectMode(request.tabId);
        return ok(manager.getState(request.tabId));
      case 'STOP_INSPECT_MODE':
        await manager.stopInspectMode(request.tabId);
        return ok(manager.getState(request.tabId));
      case 'GET_DOCUMENT':
        return ok(await manager.sendCommand(request.tabId, 'DOM.getDocument', { depth: request.depth ?? 1, pierce: true }));
      case 'REQUEST_CHILD_NODES':
        return ok(await manager.sendCommand(request.tabId, 'DOM.requestChildNodes', { nodeId: request.nodeId, depth: 1, pierce: true }));
      case 'HIGHLIGHT_NODE':
        return ok(await manager.sendCommand(request.tabId, 'Overlay.highlightNode', {
          nodeId: request.nodeId,
          highlightConfig: {
            showInfo: true,
            contentColor: { r: 111, g: 168, b: 220, a: 0.25 },
            borderColor: { r: 37, g: 99, b: 235, a: 1 },
            marginColor: { r: 251, g: 191, b: 36, a: 0.25 },
            paddingColor: { r: 16, g: 185, b: 129, a: 0.25 }
          }
        }));
      case 'HIDE_HIGHLIGHT':
        return ok(await manager.sendCommand(request.tabId, 'Overlay.hideHighlight'));
      case 'SET_ATTRIBUTE':
        return ok(await manager.sendCommand(request.tabId, 'DOM.setAttributeValue', {
          nodeId: request.nodeId,
          name: request.name,
          value: request.value
        }));
      case 'REMOVE_ATTRIBUTE':
        return ok(await manager.sendCommand(request.tabId, 'DOM.removeAttribute', {
          nodeId: request.nodeId,
          name: request.name
        }));
      case 'SET_OUTER_HTML':
        return ok(await manager.sendCommand(request.tabId, 'DOM.setOuterHTML', {
          nodeId: request.nodeId,
          outerHTML: request.outerHTML
        }));
      case 'GET_MATCHED_STYLES':
        return ok(await manager.sendCommand(request.tabId, 'CSS.getMatchedStylesForNode', { nodeId: request.nodeId }));
      case 'GET_COMPUTED_STYLE':
        return ok(await manager.sendCommand(request.tabId, 'CSS.getComputedStyleForNode', { nodeId: request.nodeId }));
    }
  } catch (error) {
    return fail(toFriendlyError(error), error);
  }
}

async function attach(tabId: number): Promise<ExtensionResponse> {
  const tab = await chrome.tabs.get(tabId);
  const policy = isAllowedDebugUrl(tab.url);
  if (!policy.allowed) return fail(policy.reason ?? 'This URL is blocked by policy.');
  await manager.attach(tabId);
  return ok(manager.getState(tabId));
}

async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  return { id: tab.id, title: tab.title, url: tab.url };
}

async function getTab(tabId: number): Promise<ActiveTabInfo | null> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.id) return null;
  return { id: tab.id, title: tab.title, url: tab.url };
}

async function getCookies(tabId: number): Promise<CookiesResult> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? undefined;
  const response = await manager.sendCommand<{ cookies?: Array<Record<string, unknown>> }>(tabId, 'Network.getCookies', {
    ...(url ? { urls: [url] } : {})
  });
  return { cookies: (response.cookies ?? []) as CookiesResult['cookies'] };
}

async function setCookie(tabId: number, cookie: CookieInput): Promise<null> {
  const tab = await chrome.tabs.get(tabId);
  const request: Record<string, unknown> = {
    name: cookie.name,
    value: cookie.value,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
    ...(cookie.path ? { path: cookie.path } : {}),
    ...(cookie.secure !== undefined ? { secure: cookie.secure } : {}),
    ...(cookie.httpOnly !== undefined ? { httpOnly: cookie.httpOnly } : {}),
    ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    ...(cookie.expires !== undefined ? { expires: cookie.expires } : {}),
    ...(cookie.priority ? { priority: cookie.priority } : {}),
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
  };
  if (!cookie.domain && !cookie.path && tab.url) {
    request.url = tab.url;
  }
  await manager.sendCommand(tabId, 'Network.setCookie', request);
  return null;
}

async function deleteCookie(tabId: number, cookie: CookieDeleteInput): Promise<null> {
  const request: Record<string, unknown> = {
    name: cookie.name,
    ...(cookie.url ? { url: cookie.url } : {}),
    ...(cookie.domain ? { domain: cookie.domain } : {}),
    ...(cookie.path ? { path: cookie.path } : {}),
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
  };
  await manager.sendCommand(tabId, 'Network.deleteCookies', request);
  return null;
}

async function getWebStorage(tabId: number): Promise<WebStorageResult> {
  const snapshot = await evaluateByValue<WebStorageSnapshot>(tabId, `(() => {
    const read = (storage) => {
      const entries = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) entries.push({ key: String(key), value: storage.getItem(key) ?? '' });
      }
      return entries;
    };
    return {
      origin: location.origin,
      localStorage: read(localStorage),
      sessionStorage: read(sessionStorage)
    };
  })()`);
  return snapshot;
}

async function setWebStorageItem(tabId: number, area: 'localStorage' | 'sessionStorage', key: string, value: string, previousKey?: string): Promise<null> {
  await evaluateByValue<boolean>(tabId, `(() => {
    const storage = ${area === 'localStorage' ? 'localStorage' : 'sessionStorage'};
    const nextKey = ${JSON.stringify(key)};
    const nextValue = ${JSON.stringify(value)};
    const previousKey = ${previousKey ? JSON.stringify(previousKey) : 'undefined'};
    if (previousKey && previousKey !== nextKey) storage.removeItem(previousKey);
    storage.setItem(nextKey, nextValue);
    return true;
  })()`);
  return null;
}

async function deleteWebStorageItem(tabId: number, area: 'localStorage' | 'sessionStorage', key: string): Promise<null> {
  await evaluateByValue<boolean>(tabId, `(() => {
    const storage = ${area === 'localStorage' ? 'localStorage' : 'sessionStorage'};
    storage.removeItem(${JSON.stringify(key)});
    return true;
  })()`);
  return null;
}

async function getIndexedDbDatabases(tabId: number): Promise<IndexedDbDatabasesResult> {
  const origin = await getOrigin(tabId);
  const snapshot = await evaluateByValue<IndexedDbDatabasesResult>(tabId, `(async () => {
    const serializeKeyPath = (keyPath) => {
      if (keyPath === null || keyPath === undefined) return null;
      if (Array.isArray(keyPath)) return keyPath.map((item) => String(item));
      return String(keyPath);
    };
    const openDatabase = (name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error ?? new Error('Failed to open database.'));
      request.onsuccess = () => resolve(request.result);
    });
    const databases = [];
    const entries = await indexedDB.databases();
    for (const item of entries) {
      if (!item.name) continue;
      const db = await openDatabase(item.name);
      const objectStores = [];
      for (const storeName of Array.from(db.objectStoreNames)) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const indexes = Array.from(store.indexNames).map((indexName) => {
          const index = store.index(indexName);
          return {
            name: index.name,
            keyPath: serializeKeyPath(index.keyPath),
            unique: index.unique,
            multiEntry: index.multiEntry
          };
        });
        objectStores.push({
          name: storeName,
          keyPath: serializeKeyPath(store.keyPath),
          autoIncrement: store.autoIncrement,
          indexes
        });
      }
      db.close();
      databases.push({ name: item.name, version: item.version ?? 0, objectStores });
    }
    return { origin: location.origin, databases };
  })()`);
  return { origin, databases: snapshot.databases };
}

async function getIndexedDbEntries(tabId: number, databaseName: string, objectStoreName: string, skipCount = 0, pageSize = 100): Promise<IndexedDbEntriesResult> {
  const result = await evaluateByValue<IndexedDbEntriesResult>(tabId, `(() => {
    const serializeKey = (key) => {
      if (key instanceof Date) return { type: 'date', value: key.toISOString() };
      if (Array.isArray(key)) return { type: 'array', value: key.map(serializeKey) };
      if (typeof key === 'number') return { type: 'number', value: key };
      return { type: 'string', value: String(key) };
    };
    const keyText = (key) => {
      if (key instanceof Date) return key.toISOString();
      if (Array.isArray(key)) return '[' + key.map(keyText).join(', ') + ']';
      if (typeof key === 'object' && key !== null) return JSON.stringify(key);
      return String(key);
    };
    const valueText = (value) => {
      try {
        return { text: JSON.stringify(value, null, 2), serializable: true };
      } catch {
        return { text: String(value), serializable: false };
      }
    };
    const openDatabase = (name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error ?? new Error('Failed to open database.'));
      request.onsuccess = () => resolve(request.result);
    });
    return (async () => {
      const db = await openDatabase(${JSON.stringify(databaseName)});
      const tx = db.transaction(${JSON.stringify(objectStoreName)}, 'readonly');
      const store = tx.objectStore(${JSON.stringify(objectStoreName)});
      const keys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys(undefined, ${pageSize});
        request.onerror = () => reject(request.error ?? new Error('Failed to read keys.'));
        request.onsuccess = () => resolve(request.result ?? []);
      });
      const values = await new Promise((resolve, reject) => {
        const request = store.getAll(undefined, ${pageSize});
        request.onerror = () => reject(request.error ?? new Error('Failed to read values.'));
        request.onsuccess = () => resolve(request.result ?? []);
      });
      const entries = [];
      for (let index = ${skipCount}; index < Math.min(keys.length, values.length, ${skipCount} + ${pageSize}); index += 1) {
        const key = keys[index];
        const value = values[index];
        const text = valueText(value);
        entries.push({
          keySpec: serializeKey(key),
          keyText: keyText(key),
          valueText: text.text,
          valueSerializable: text.serializable
        });
      }
      db.close();
      return { databaseName: ${JSON.stringify(databaseName)}, objectStoreName: ${JSON.stringify(objectStoreName)}, entries, hasMore: keys.length > ${skipCount} + ${pageSize} };
    })();
  })()`);
  return result;
}

async function deleteIndexedDbEntry(tabId: number, databaseName: string, objectStoreName: string, key: unknown): Promise<null> {
  const origin = await getOrigin(tabId);
  await manager.sendCommand(tabId, 'IndexedDB.deleteObjectStoreEntries', {
    securityOrigin: origin,
    databaseName,
    objectStoreName,
    keyRange: exactKeyRange(key)
  });
  return null;
}

async function clearIndexedDbStore(tabId: number, databaseName: string, objectStoreName: string): Promise<null> {
  const origin = await getOrigin(tabId);
  await manager.sendCommand(tabId, 'IndexedDB.clearObjectStore', {
    securityOrigin: origin,
    databaseName,
    objectStoreName
  });
  return null;
}

async function deleteIndexedDbDatabase(tabId: number, databaseName: string): Promise<null> {
  const origin = await getOrigin(tabId);
  await manager.sendCommand(tabId, 'IndexedDB.deleteDatabase', {
    securityOrigin: origin,
    databaseName
  });
  return null;
}

async function evaluateByValue<T>(tabId: number, expression: string): Promise<T> {
  const response = await manager.sendCommand<{ result?: { value?: T } }>(tabId, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    includeCommandLineAPI: true
  });
  return response.result?.value as T;
}

async function getOrigin(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) throw new Error('The target tab URL is unavailable.');
  return new URL(tab.url).origin;
}

function exactKeyRange(key: unknown): Record<string, unknown> | string | number | unknown[] {
  const normalized = toIndexedDbKey(key);
  return { lower: normalized, upper: normalized };
}

function toIndexedDbKey(key: unknown): Record<string, unknown> | string | number | unknown[] {
  if (typeof key === 'number' || typeof key === 'string') return key;
  if (Array.isArray(key)) return key.map((item) => toIndexedDbKey(item));
  if (key && typeof key === 'object' && 'type' in key && 'value' in key) {
    const typed = key as IndexedDbKeySpec;
    if (typed.type === 'number') return typed.value;
    if (typed.type === 'string') return typed.value;
    if (typed.type === 'date') return { type: 'date', value: Date.parse(typed.value) };
    if (typed.type === 'array') return typed.value.map((item) => toIndexedDbKey(item));
  }
  return String(key);
}

async function openDetachedWindow(tabId: number): Promise<ExtensionResponse<null>> {
  const url = chrome.runtime.getURL(`sidepanel.html?tabId=${encodeURIComponent(String(tabId))}`);
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 1100,
    height: 760,
    focused: true
  });
  return ok(null);
}

function ok<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data };
}

function fail(error: string, detail?: unknown): ExtensionResponse<never> {
  return { ok: false, error, detail };
}

function toFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Another debugger is already attached')) {
    return 'Another debugger is already attached to this tab.';
  }
  if (message.includes('No tab with given id')) {
    return 'The target tab is no longer available.';
  }
  if (message.includes('Cannot access')) {
    return 'Chrome blocked access to this tab.';
  }
  return message || 'CDP command failed.';
}

