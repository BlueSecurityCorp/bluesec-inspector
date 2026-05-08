import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComputedStyleResult,
  CookiesResult,
  IndexedDbDatabasesResult,
  IndexedDbEntriesResult,
  DocumentResult,
  EvaluateResult,
  ExtensionEvent,
  ExtensionRequest,
  ExtensionResponse,
  GetPropertiesResult,
  MatchedStylesResult,
  SessionStateResult,
  WebStorageResult,
} from '../shared/extension-messages';
import type {
  Cookie,
  CookieDeleteInput,
  CookieInput,
  CookiePriority,
  CookieSameSite,
  DomNode,
  IndexedDbDatabase,
  IndexedDbEntry,
  IndexedDbKeySpec,
  RemoteObjectLite,
  StorageEntry,
  WebStorageSnapshot,
} from '../shared/cdp-types';
import { makeId } from '../shared/utils';

type Panel = 'console' | 'elements' | 'cookies' | 'storage';
type ConsoleEntry = {
  id: string;
  ts: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'exception' | 'result' | 'input';
  source: 'console' | 'runtime' | 'log' | 'input' | 'result';
  text?: string;
  args?: RemoteObjectLite[];
  raw?: unknown;
};

type ActiveTab = { id: number; title?: string; url?: string };
type CookieDraft = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  session: boolean;
  sameSite: CookieSameSite | '';
  priority: CookiePriority | '';
  expiresText: string;
};
type WebStorageArea = 'localStorage' | 'sessionStorage';
type StorageMode = 'web' | 'indexeddb';
type StorageDraft = {
  area: WebStorageArea;
  key: string;
  value: string;
  previousKey: string;
};
type IndexedDbSelection = {
  databaseName: string;
  objectStoreName: string;
  selectedEntryIndex: number;
};

export default function App() {
  const fixedTabId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('tabId');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, []);
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [state, setState] = useState<SessionStateResult | null>(null);
  const [panel, setPanel] = useState<Panel>('console');
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [preserveLog, setPreserveLog] = useState(false);
  const [rootNode, setRootNode] = useState<DomNode | null>(null);
  const rootNodeRef = useRef<DomNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomNode | null>(null);
  const [pendingPickedNodeId, setPendingPickedNodeId] = useState<number | null>(null);
  const [matchedStyles, setMatchedStyles] = useState<MatchedStylesResult | null>(null);
  const [computedStyle, setComputedStyle] = useState<ComputedStyleResult | null>(null);
  const [cookies, setCookies] = useState<Cookie[]>([]);
  const cookiesRef = useRef<Cookie[]>([]);
  const [cookiesLoading, setCookiesLoading] = useState(false);
  const [cookiesSearch, setCookiesSearch] = useState('');
  const [selectedCookieKey, setSelectedCookieKey] = useState<string | null>(null);
  const selectedCookieKeyRef = useRef<string | null>(null);
  const [cookieDraft, setCookieDraft] = useState<CookieDraft | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>('web');
  const [webStorage, setWebStorage] = useState<WebStorageSnapshot | null>(null);
  const [webStorageLoading, setWebStorageLoading] = useState(false);
  const [webStorageArea, setWebStorageArea] = useState<WebStorageArea>('localStorage');
  const [webStorageSearch, setWebStorageSearch] = useState('');
  const [webStorageDraft, setWebStorageDraft] = useState<StorageDraft | null>(null);
  const [indexedDbOverview, setIndexedDbOverview] = useState<IndexedDbDatabasesResult | null>(null);
  const [indexedDbLoading, setIndexedDbLoading] = useState(false);
  const [indexedDbSelection, setIndexedDbSelection] = useState<IndexedDbSelection | null>(null);
  const [indexedDbEntries, setIndexedDbEntries] = useState<IndexedDbEntriesResult | null>(null);
  const [indexedDbSearch, setIndexedDbSearch] = useState('');
  const send = useCallback(<T,>(request: ExtensionRequest) => sendMessage<T>(request), []);

  useEffect(() => {
    chrome.storage.local.get('preserveLog').then((result) => {
      setPreserveLog(Boolean(result.preserveLog));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    rootNodeRef.current = rootNode;
  }, [rootNode]);

  useEffect(() => {
    cookiesRef.current = cookies;
  }, [cookies]);

  useEffect(() => {
    setCookies([]);
    setSelectedCookieKey(null);
    setCookieDraft(null);
    setWebStorage(null);
    setWebStorageDraft(null);
    setIndexedDbOverview(null);
    setIndexedDbSelection(null);
    setIndexedDbEntries(null);
  }, [activeTab?.id]);

  useEffect(() => {
    selectedCookieKeyRef.current = selectedCookieKey;
  }, [selectedCookieKey]);

  const refreshActiveTab = useCallback(async () => {
    const response = await (fixedTabId ? send<ActiveTab | null>({ type: 'GET_TAB', tabId: fixedTabId }) : send<ActiveTab | null>({ type: 'GET_ACTIVE_TAB' }));
    if (response.ok) {
      setActiveTab(response.data);
      if (response.data) {
        const session = await send<SessionStateResult>({ type: 'GET_SESSION_STATE', tabId: response.data.id });
        if (session.ok) setState(session.data);
      }
    } else {
      setError(response.error);
    }
  }, [fixedTabId, send]);

  const refreshDocument = useCallback(async () => {
    if (!activeTab) return;
    const response = await send<DocumentResult>({ type: 'GET_DOCUMENT', tabId: activeTab.id });
    if (response.ok) {
      setRootNode(response.data.root);
      setSelectedNode(null);
      setMatchedStyles(null);
      setComputedStyle(null);
    } else {
      setError(response.error);
    }
  }, [activeTab, send]);

  const refreshCookies = useCallback(async () => {
    if (!activeTab) return;
    setCookiesLoading(true);
    const response = await send<CookiesResult>({ type: 'GET_COOKIES', tabId: activeTab.id });
    setCookiesLoading(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setCookies(response.data.cookies);
    const current = response.data.cookies.find((cookie) => cookieKey(cookie) === selectedCookieKeyRef.current) ?? response.data.cookies[0] ?? null;
    if (current) {
      setSelectedCookieKey(cookieKey(current));
      setCookieDraft(toCookieDraft(current));
    } else {
      setSelectedCookieKey(null);
      setCookieDraft(null);
    }
  }, [activeTab, send]);

  const refreshWebStorage = useCallback(async (areaOverride?: WebStorageArea) => {
    if (!activeTab) return;
    const area = areaOverride ?? webStorageArea;
    setWebStorageLoading(true);
    const response = await send<WebStorageResult>({ type: 'GET_WEB_STORAGE', tabId: activeTab.id });
    setWebStorageLoading(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setWebStorage(response.data);
    const items = response.data[area];
    const selected = items.find((item) => item.key === webStorageDraft?.key && item.value === webStorageDraft?.value) ?? items[0] ?? null;
    if (selected) {
      setWebStorageDraft({ area, key: selected.key, value: selected.value, previousKey: selected.key });
    } else {
      setWebStorageDraft({ area, key: '', value: '', previousKey: '' });
    }
  }, [activeTab, send, webStorageArea, webStorageDraft?.key, webStorageDraft?.value]);

  const refreshIndexedDbOverview = useCallback(async () => {
    if (!activeTab) return;
    setIndexedDbLoading(true);
    const response = await send<IndexedDbDatabasesResult>({ type: 'GET_INDEXED_DB_DATABASES', tabId: activeTab.id });
    setIndexedDbLoading(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setIndexedDbOverview(response.data);
    const currentDb = indexedDbSelection?.databaseName;
    const currentStore = indexedDbSelection?.objectStoreName;
    const nextDb = response.data.databases.find((db) => db.name === currentDb) ?? response.data.databases[0] ?? null;
    const nextStore = nextDb?.objectStores.find((store) => store.name === currentStore) ?? nextDb?.objectStores[0] ?? null;
    if (nextDb && nextStore) {
      const nextSelection = { databaseName: nextDb.name, objectStoreName: nextStore.name, selectedEntryIndex: indexedDbSelection?.selectedEntryIndex ?? 0 };
      setIndexedDbSelection(nextSelection);
      await refreshIndexedDbEntries(nextSelection);
    } else {
      setIndexedDbSelection(null);
      setIndexedDbEntries(null);
    }
  }, [activeTab, indexedDbSelection?.databaseName, indexedDbSelection?.objectStoreName, indexedDbSelection?.selectedEntryIndex, send]);

  const refreshIndexedDbEntries = useCallback(async (selection?: IndexedDbSelection) => {
    if (!activeTab) return;
    const chosen = selection ?? indexedDbSelection;
    if (!chosen) {
      setIndexedDbEntries(null);
      return;
    }
    const response = await send<IndexedDbEntriesResult>({
      type: 'GET_INDEXED_DB_ENTRIES',
      tabId: activeTab.id,
      databaseName: chosen.databaseName,
      objectStoreName: chosen.objectStoreName,
      skipCount: 0,
      pageSize: 100
    });
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setIndexedDbEntries(response.data);
    const nextIndex = Math.min(chosen.selectedEntryIndex, Math.max(0, response.data.entries.length - 1));
    setIndexedDbSelection({ ...chosen, selectedEntryIndex: nextIndex });
  }, [activeTab, indexedDbSelection, send]);

  useEffect(() => {
    refreshActiveTab();
  }, [refreshActiveTab]);

  useEffect(() => {
    const listener = (event: ExtensionEvent) => {
      if (!activeTab || event.tabId !== activeTab.id) return;
      if (event.type === 'ATTACHED') {
        setState((previous) => ({ tabId: activeTab.id, attached: true, inspecting: false, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title }));
        setRootNode(null);
        setSelectedNode(null);
        setPendingPickedNodeId(null);
        setMatchedStyles(null);
        setComputedStyle(null);
        setCookies([]);
        setCookieDraft(null);
        setSelectedCookieKey(null);
        setWebStorage(null);
        setWebStorageDraft(null);
        setIndexedDbOverview(null);
        setIndexedDbEntries(null);
        setIndexedDbSelection(null);
        if (!preserveLog) {
          setEntries([]);
        }
        if (panel === 'elements') {
          refreshDocument();
        }
        return;
      }
      if (event.type === 'DETACHED') {
        setState((previous) => ({ tabId: activeTab.id, attached: false, inspecting: false, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title, error: event.reason }));
        setCookies([]);
        setCookieDraft(null);
        setSelectedCookieKey(null);
        setWebStorage(null);
        setWebStorageDraft(null);
        setIndexedDbOverview(null);
        setIndexedDbEntries(null);
        setIndexedDbSelection(null);
        return;
      }
      if (event.type === 'INSPECT_MODE_CHANGED') {
        setState((previous) => ({ tabId: activeTab.id, attached: true, inspecting: event.inspecting, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title }));
        return;
      }
      if (event.type === 'ELEMENT_PICKED') {
        setPanel('elements');
        setState((previous) => ({ tabId: activeTab.id, attached: true, inspecting: false, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title }));
        setPendingPickedNodeId(event.nodeId);
        if (!rootNodeRef.current) {
          refreshDocument();
        }
        return;
      }
      if (event.type === 'CONSOLE_EVENT') {
        setEntries((items) => [...items, consoleApiEntry(event.payload)].slice(-500));
        return;
      }
      if (event.type === 'EXCEPTION_EVENT') {
        setEntries((items) => [...items, exceptionEntry(event.payload)].slice(-500));
        return;
      }
      if (event.type === 'LOG_EVENT') {
        setEntries((items) => [...items, logEntry(event.payload)].slice(-500));
        return;
      }
      if (event.type === 'DOM_EVENT' && panel === 'elements') {
        if (event.method === 'DOM.setChildNodes') {
          const payload = event.payload as { parentId?: number; nodes?: DomNode[] };
          if (payload.parentId && payload.nodes) {
            setRootNode((root) => root ? mergeChildren(root, payload.parentId as number, payload.nodes as DomNode[]) : root);
          }
        } else if (event.method === 'DOM.documentUpdated') {
          refreshDocument();
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [activeTab, panel, preserveLog, refreshDocument]);

  const attached = state?.attached === true;
  const policy = useMemo(() => getPolicyStatus(activeTab?.url), [activeTab?.url]);

  useEffect(() => {
    if (panel === 'cookies' && attached) {
      refreshCookies();
    }
  }, [attached, panel, refreshCookies]);

  useEffect(() => {
    if (panel !== 'storage' || !attached) return;
    if (storageMode === 'web') {
      refreshWebStorage();
    } else {
      refreshIndexedDbOverview();
    }
  }, [attached, panel, refreshIndexedDbOverview, refreshWebStorage, storageMode]);

  async function attach() {
    if (!activeTab) return;
    setError(null);
    const response = await send<SessionStateResult>({ type: 'ATTACH', tabId: activeTab.id });
    if (response.ok) {
      setState(response.data);
      await refreshDocument();
    } else {
      setError(response.error);
    }
  }

  async function openDetachedWindow() {
    if (!activeTab) return;
    const response = await send<null>({ type: 'OPEN_DETACHED_WINDOW', tabId: activeTab.id });
    if (response.ok) {
      window.close();
    } else {
      setError(response.error);
    }
  }

  async function detach() {
    if (!activeTab) return;
    const response = await send<null>({ type: 'DETACH', tabId: activeTab.id });
    if (response.ok) {
      setState({ tabId: activeTab.id, attached: false, inspecting: false, url: activeTab.url, title: activeTab.title });
    } else {
      setError(response.error);
    }
  }

  async function toggleInspectMode() {
    if (!activeTab || !attached) return;
    setError(null);
    const response = state?.inspecting
      ? await send<SessionStateResult>({ type: 'STOP_INSPECT_MODE', tabId: activeTab.id })
      : await send<SessionStateResult>({ type: 'START_INSPECT_MODE', tabId: activeTab.id });
    if (response.ok) {
      setState(response.data);
    } else {
      setError(response.error);
    }
  }

  async function setPreserveLogPersisted(value: boolean) {
    setPreserveLog(value);
    await chrome.storage.local.set({ preserveLog: value }).catch(() => undefined);
  }

  async function evaluate(expression: string) {
    if (!activeTab || !expression.trim()) return;
    setEntries((items) => [...items, { id: makeId('input'), ts: Date.now(), level: 'input', source: 'input', text: expression }]);
    const response = await send<EvaluateResult>({ type: 'EVALUATE', tabId: activeTab.id, expression });
    if (response.ok) {
      const resultEntry: ConsoleEntry = {
        id: makeId('result'),
        ts: Date.now(),
        level: response.data.exceptionDetails ? 'exception' : 'result',
        source: 'result',
        args: response.data.result ? [response.data.result] : undefined,
        text: response.data.exceptionDetails ? stringifyUnknown(response.data.exceptionDetails) : undefined,
        raw: response.data
      };
      setEntries((items) => [...items, resultEntry].slice(-500));
    } else {
      setError(response.error);
    }
  }

  async function clearConsole() {
    if (activeTab && attached) await send<null>({ type: 'RELEASE_CONSOLE_OBJECTS', tabId: activeTab.id });
    setEntries([]);
  }

  function exportLogs() {
    const payload = JSON.stringify(entries, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bluesec-inspector-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function selectNode(node: DomNode) {
    setSelectedNode(node);
    setMatchedStyles(null);
    setComputedStyle(null);
    if (!activeTab || node.nodeType !== 1) return;
    const [matched, computed] = await Promise.all([
      send<MatchedStylesResult>({ type: 'GET_MATCHED_STYLES', tabId: activeTab.id, nodeId: node.nodeId }),
      send<ComputedStyleResult>({ type: 'GET_COMPUTED_STYLE', tabId: activeTab.id, nodeId: node.nodeId })
    ]);
    if (matched.ok) setMatchedStyles(matched.data);
    if (computed.ok) setComputedStyle(computed.data);
  }

  useEffect(() => {
    if (!pendingPickedNodeId || !rootNode) return;
    const picked = findNodeById(rootNode, pendingPickedNodeId);
    if (!picked) return;
    setPendingPickedNodeId(null);
    setPanel('elements');
    selectNode(picked);
  }, [pendingPickedNodeId, rootNode]);

  async function requestChildren(node: DomNode) {
    if (!activeTab) return;
    const response = await send<unknown>({ type: 'REQUEST_CHILD_NODES', tabId: activeTab.id, nodeId: node.nodeId });
    if (!response.ok) setError(response.error);
  }

  async function highlightNode(node: DomNode) {
    if (activeTab && node.nodeType === 1) await send<unknown>({ type: 'HIGHLIGHT_NODE', tabId: activeTab.id, nodeId: node.nodeId });
  }

  async function hideHighlight() {
    if (activeTab) await send<unknown>({ type: 'HIDE_HIGHLIGHT', tabId: activeTab.id });
  }

  async function updateAttribute(name: string, value: string) {
    if (!activeTab || !selectedNode) return;
    const response = await send<unknown>({ type: 'SET_ATTRIBUTE', tabId: activeTab.id, nodeId: selectedNode.nodeId, name, value });
    if (response.ok) await refreshDocument();
    else setError(response.error);
  }

  async function removeAttribute(name: string) {
    if (!activeTab || !selectedNode) return;
    const response = await send<unknown>({ type: 'REMOVE_ATTRIBUTE', tabId: activeTab.id, nodeId: selectedNode.nodeId, name });
    if (response.ok) await refreshDocument();
    else setError(response.error);
  }

  function selectCookie(cookie: Cookie) {
    setSelectedCookieKey(cookieKey(cookie));
    setCookieDraft(toCookieDraft(cookie));
  }

  async function updateCookie() {
    if (!activeTab || !cookieDraft) return;
    if (!cookieDraft.session && !cookieDraft.expiresText) {
      setError('Expiration date is required when Session is off.');
      return;
    }
    setError(null);
    const response = await send<null>({ type: 'SET_COOKIE', tabId: activeTab.id, cookie: toCookieInput(cookieDraft) });
    if (response.ok) {
      await refreshCookies();
    } else {
      setError(response.error);
    }
  }

  async function deleteCookie() {
    if (!activeTab || !cookieDraft) return;
    setError(null);
    const response = await send<null>({ type: 'DELETE_COOKIE', tabId: activeTab.id, cookie: toCookieDeleteInput(cookieDraft) });
    if (response.ok) {
      await refreshCookies();
    } else {
      setError(response.error);
    }
  }

  async function updateWebStorageItem() {
    if (!activeTab || !webStorageDraft) return;
    if (!webStorageDraft.key.trim()) {
      setError('Storage key is required.');
      return;
    }
    setError(null);
    const response = await send<null>({
      type: 'SET_WEB_STORAGE_ITEM',
      tabId: activeTab.id,
      area: webStorageDraft.area,
      key: webStorageDraft.key,
      value: webStorageDraft.value,
      previousKey: webStorageDraft.previousKey.trim() ? webStorageDraft.previousKey : undefined
    });
    if (response.ok) {
      await refreshWebStorage();
    } else {
      setError(response.error);
    }
  }

  async function deleteWebStorageItemAction(area: WebStorageArea, key: string) {
    if (!activeTab) return;
    const response = await send<null>({ type: 'DELETE_WEB_STORAGE_ITEM', tabId: activeTab.id, area, key });
    if (response.ok) {
      await refreshWebStorage();
    } else {
      setError(response.error);
    }
  }

  async function deleteIndexedDbEntryAction(key: IndexedDbKeySpec) {
    if (!activeTab || !indexedDbSelection) return;
    const response = await send<null>({
      type: 'DELETE_INDEXED_DB_ENTRY',
      tabId: activeTab.id,
      databaseName: indexedDbSelection.databaseName,
      objectStoreName: indexedDbSelection.objectStoreName,
      key
    });
    if (response.ok) {
      await refreshIndexedDbEntries(indexedDbSelection);
    } else {
      setError(response.error);
    }
  }

  async function clearIndexedDbStoreAction() {
    if (!activeTab || !indexedDbSelection) return;
    const response = await send<null>({
      type: 'CLEAR_INDEXED_DB_STORE',
      tabId: activeTab.id,
      databaseName: indexedDbSelection.databaseName,
      objectStoreName: indexedDbSelection.objectStoreName
    });
    if (response.ok) {
      await refreshIndexedDbEntries(indexedDbSelection);
    } else {
      setError(response.error);
    }
  }

  async function deleteIndexedDbDatabaseAction(databaseName: string) {
    if (!activeTab) return;
    const response = await send<null>({
      type: 'DELETE_INDEXED_DB_DATABASE',
      tabId: activeTab.id,
      databaseName
    });
    if (response.ok) {
      await refreshIndexedDbOverview();
    } else {
      setError(response.error);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <strong>BlueSec Inspector</strong>
          <span className={attached ? 'status attached' : 'status'}>{attached ? 'attached' : 'detached'}</span>
        </div>
        <div className="target">
          <span className="title">{activeTab?.title ?? 'No active tab'}</span>
          <span className="url">{activeTab?.url ?? 'Open a localhost page to start.'}</span>
        </div>
        <div className="actions">
          <button onClick={refreshActiveTab}>Refresh</button>
          <button onClick={openDetachedWindow} disabled={!activeTab}>Open Window</button>
          <button onClick={attach} disabled={!activeTab || attached || !policy.allowed}>Attach</button>
          <button onClick={detach} disabled={!activeTab || !attached}>Detach</button>
        </div>
      </header>
      {!policy.allowed && policy.reason && (
        <div className="banner warning">
          <span>{policy.reason}</span>
        </div>
      )}
      {error && <div className="banner error"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}
      <nav className="tabs">
        <button className={panel === 'console' ? 'active' : ''} onClick={() => setPanel('console')}>Console</button>
        <button className={panel === 'elements' ? 'active' : ''} onClick={() => { setPanel('elements'); if (attached && !rootNode) refreshDocument(); }}>Elements</button>
        <button className={panel === 'storage' ? 'active' : ''} onClick={() => { setPanel('storage'); if (attached) { if (storageMode === 'web') refreshWebStorage(); else refreshIndexedDbOverview(); } }}>Storage</button>
        <button className={panel === 'cookies' ? 'active' : ''} onClick={() => { setPanel('cookies'); if (attached && cookiesRef.current.length === 0) refreshCookies(); }}>Cookies</button>
      </nav>
      <main className="panel">
        {panel === 'console' ? (
          <ConsolePanel
            attached={attached}
            entries={entries}
            preserveLog={preserveLog}
            setPreserveLog={setPreserveLogPersisted}
            evaluate={evaluate}
            clear={clearConsole}
            exportLogs={exportLogs}
            tabId={activeTab?.id}
          />
        ) : panel === 'elements' ? (
          <ElementsPanel
            attached={attached}
            rootNode={rootNode}
            selectedNode={selectedNode}
            matchedStyles={matchedStyles}
            computedStyle={computedStyle}
            refreshDocument={refreshDocument}
            requestChildren={requestChildren}
            selectNode={selectNode}
            highlightNode={highlightNode}
            hideHighlight={hideHighlight}
            updateAttribute={updateAttribute}
            removeAttribute={removeAttribute}
            inspecting={state?.inspecting === true}
            onToggleInspectMode={toggleInspectMode}
          />
        ) : panel === 'storage' ? (
          <StoragePanel
            attached={attached}
            mode={storageMode}
            setMode={setStorageMode}
            webStorage={webStorage}
            webStorageLoading={webStorageLoading}
            webStorageArea={webStorageArea}
            setWebStorageArea={setWebStorageArea}
            webStorageSearch={webStorageSearch}
            setWebStorageSearch={setWebStorageSearch}
            webStorageDraft={webStorageDraft}
            onChangeWebStorageDraft={setWebStorageDraft}
            indexedDbOverview={indexedDbOverview}
            indexedDbLoading={indexedDbLoading}
            indexedDbSelection={indexedDbSelection}
            indexedDbEntries={indexedDbEntries}
            indexedDbSearch={indexedDbSearch}
            setIndexedDbSearch={setIndexedDbSearch}
            onRefreshWebStorage={refreshWebStorage}
            onRefreshIndexedDbOverview={refreshIndexedDbOverview}
            onRefreshIndexedDbEntries={refreshIndexedDbEntries}
            onSetWebStorageItem={updateWebStorageItem}
            onDeleteWebStorageItem={deleteWebStorageItemAction}
            onSelectIndexedDb={setIndexedDbSelection}
            onDeleteIndexedDbEntry={deleteIndexedDbEntryAction}
            onClearIndexedDbStore={clearIndexedDbStoreAction}
            onDeleteIndexedDbDatabase={deleteIndexedDbDatabaseAction}
          />
        ) : (
          <CookiesPanel
            attached={attached}
            url={activeTab?.url}
            cookies={cookies}
            loading={cookiesLoading}
            search={cookiesSearch}
            setSearch={setCookiesSearch}
            selectedKey={selectedCookieKey}
            draft={cookieDraft}
            onSelect={selectCookie}
            onRefresh={refreshCookies}
            onChangeDraft={(draft) => setCookieDraft(draft)}
            onSave={updateCookie}
            onDelete={deleteCookie}
          />
        )}
      </main>
    </div>
  );
}

  function ConsolePanel(props: {
  attached: boolean;
  entries: ConsoleEntry[];
  preserveLog: boolean;
  setPreserveLog: (value: boolean) => void;
  evaluate: (expression: string) => void;
  clear: () => void;
  exportLogs: () => void;
  tabId?: number;
}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(() => suggestionsOpen ? getConsoleSuggestions(input, history) : [], [history, input, suggestionsOpen]);

  useEffect(() => {
    const element = logListRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [props.entries]);

  function submit(value: string) {
    const expression = value.trim();
    if (!expression) return;
    setHistory((items) => [expression, ...items.filter((item) => item !== expression)].slice(0, 50));
    setHistoryIndex(null);
    setHistoryDraft('');
    setSuggestionIndex(0);
    setSuggestionsOpen(false);
    props.evaluate(expression);
    setInput('');
  }

  function applySuggestion(value: string) {
    setInput(value);
    setHistoryIndex(null);
    setHistoryDraft('');
    setSuggestionIndex(0);
    setSuggestionsOpen(false);
  }

  function moveHistory(direction: 'previous' | 'next') {
    if (history.length === 0) return;

    if (direction === 'previous') {
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      if (historyIndex === null) setHistoryDraft(input);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
      setSuggestionsOpen(false);
      return;
    }

    if (historyIndex === null) return;
    const nextIndex = historyIndex - 1;
    if (nextIndex < 0) {
      setHistoryIndex(null);
      setInput(historyDraft);
      setHistoryDraft('');
    } else {
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    }
    setSuggestionsOpen(false);
  }

  return (
    <section className="console">
      <div className="toolbar">
        <button onClick={props.clear}>Clear</button>
        <button onClick={props.exportLogs} disabled={props.entries.length === 0}>Export</button>
        <label className="toggle"><input type="checkbox" checked={props.preserveLog} onChange={(event) => props.setPreserveLog(event.target.checked)} /> Preserve log</label>
        <span>{props.entries.length} entries</span>
      </div>
      <div className="log-list" ref={logListRef}>
        {props.entries.length === 0 ? <div className="empty">Console output will appear here after attach.</div> : props.entries.map((entry) => (
          <ConsoleEntryView key={entry.id} entry={entry} tabId={props.tabId} />
        ))}
      </div>
      <form className="console-input" onSubmit={(event) => {
        event.preventDefault();
        submit(input);
      }}>
        <span>{'>'}</span>
        <div className="console-input-wrap">
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setHistoryIndex(null);
              setHistoryDraft('');
              setSuggestionIndex(0);
              setSuggestionsOpen(true);
            }}
            onFocus={() => {
              if (input.trim()) setSuggestionsOpen(true);
            }}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setSuggestionsOpen(false);
                return;
              }
              if (event.key === 'ArrowUp' && suggestions.length === 0) {
                event.preventDefault();
                moveHistory('previous');
                return;
              }
              if (event.key === 'ArrowDown' && suggestions.length === 0) {
                event.preventDefault();
                moveHistory('next');
                return;
              }
              if (suggestions.length === 0) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSuggestionIndex((index) => (index + 1) % suggestions.length);
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                applySuggestion(suggestions[suggestionIndex] ?? suggestions[0]);
              }
            }}
            disabled={!props.attached}
            placeholder={props.attached ? 'Run JavaScript expression' : 'Attach to enable evaluation'}
          />
          {props.attached && suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  key={suggestion}
                  className={index === suggestionIndex ? 'active' : ''}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

function ConsoleEntryView({ entry, tabId }: { entry: ConsoleEntry; tabId?: number }) {
  return (
    <div className={`log-entry ${entry.level}`}>
      <span className="time">{new Date(entry.ts).toLocaleTimeString()}</span>
      <span className="level">{entry.level}</span>
      <div className="log-content">
        {entry.text && <span className="text">{entry.text}</span>}
        {entry.args?.map((arg, index) => <ObjectPreview key={index} value={arg} tabId={tabId} />)}
      </div>
    </div>
  );
}

function ObjectPreview({ value, tabId }: { value: RemoteObjectLite; tabId?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [properties, setProperties] = useState<GetPropertiesResult['result'] | null>(null);

  async function toggle() {
    if (!value.objectId || !tabId) return;
    if (!expanded && properties === null) {
      const response = await sendMessage<GetPropertiesResult>({ type: 'GET_PROPERTIES', tabId, objectId: value.objectId });
      if (response.ok) setProperties(response.data.result);
    }
    setExpanded(!expanded);
  }

  const text = remoteObjectText(value);
  return (
    <span className="object-preview">
      {value.objectId && <button className="twisty" onClick={toggle}>{expanded ? 'v' : '>'}</button>}
      <span className={`remote ${value.type}`}>{text}</span>
      {expanded && properties && (
        <div className="properties">
          {properties.slice(0, 100).map((property) => (
            <div key={property.name} className="property-row">
              <span className="property-name">{property.name}</span>
              <span className="property-separator">:</span>
              <span className="property-value">
                {property.value ? <ObjectPreview value={property.value} tabId={tabId} /> : <span>undefined</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function ElementsPanel(props: {
  attached: boolean;
  rootNode: DomNode | null;
  selectedNode: DomNode | null;
  matchedStyles: MatchedStylesResult | null;
  computedStyle: ComputedStyleResult | null;
  refreshDocument: () => void;
  requestChildren: (node: DomNode) => void;
  selectNode: (node: DomNode) => void;
  highlightNode: (node: DomNode) => void;
  hideHighlight: () => void;
  updateAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  inspecting: boolean;
  onToggleInspectMode: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const treeRef = useRef<HTMLDivElement | null>(null);
  const visibleNodes = useMemo(
    () => buildVisibleNodes(props.rootNode, expandedIds),
    [expandedIds, props.rootNode]
  );

  useEffect(() => {
    if (!props.rootNode) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(buildInitialExpandedIds(props.rootNode));
  }, [props.rootNode]);

  useEffect(() => {
    const selectedId = props.selectedNode?.nodeId;
    if (!selectedId) return;
    const selectedElement = treeRef.current?.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [props.selectedNode?.nodeId, visibleNodes]);

  function focusTree() {
    treeRef.current?.focus();
  }

  function isExpanded(nodeId: number) {
    return expandedIds.has(nodeId);
  }

  function setExpanded(nodeId: number, next: boolean) {
    setExpandedIds((current) => {
      const nextSet = new Set(current);
      if (next) nextSet.add(nodeId);
      else nextSet.delete(nodeId);
      return nextSet;
    });
  }

  function toggleExpanded(nodeId: number) {
    setExpanded(nodeId, !isExpanded(nodeId));
  }

  function selectByIndex(index: number) {
    const item = visibleNodes[index];
    if (!item) return;
    props.selectNode(item.node);
    focusTree();
  }

  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!visibleNodes.length) return;
    const selectedId = props.selectedNode?.nodeId ?? visibleNodes[0].node.nodeId;
    const currentIndex = Math.max(0, visibleNodes.findIndex((item) => item.node.nodeId === selectedId));
    const current = visibleNodes[currentIndex];

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectByIndex(Math.min(currentIndex + 1, visibleNodes.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectByIndex(Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!current) return;
      if (current.hasChildren && !isExpanded(current.node.nodeId)) {
        setExpanded(current.node.nodeId, true);
        return;
      }
      if (current.node.children?.[0]) {
        props.selectNode(current.node.children[0]);
        focusTree();
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!current) return;
      if (isExpanded(current.node.nodeId)) {
        setExpanded(current.node.nodeId, false);
        return;
      }
      const parentId = current.parentId;
      if (parentId) {
        const parentIndex = visibleNodes.findIndex((item) => item.node.nodeId === parentId);
        if (parentIndex >= 0) selectByIndex(parentIndex);
      }
    }
  }

  return (
    <section className="elements">
      <div className="toolbar">
        <button onClick={props.refreshDocument} disabled={!props.attached}>Reload DOM</button>
        <button className={props.inspecting ? 'active' : ''} onClick={props.onToggleInspectMode} disabled={!props.attached}>
          {props.inspecting ? 'Cancel pick' : 'Pick element'}
        </button>
      </div>
      <div className="elements-layout">
        <div
          className="dom-tree"
          ref={treeRef}
          tabIndex={0}
          onKeyDown={handleTreeKeyDown}
        >
          {!props.attached && <div className="empty">Attach to load the DOM tree.</div>}
          {props.attached && !props.rootNode && <div className="empty">Click Reload DOM.</div>}
          {props.rootNode && (
            <DomNodeRow
              node={props.rootNode}
              depth={0}
              selectedId={props.selectedNode?.nodeId}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              requestChildren={props.requestChildren}
              highlightNode={props.highlightNode}
              hideHighlight={props.hideHighlight}
              focusTree={focusTree}
              onRowClick={(node) => {
                props.selectNode(node);
                focusTree();
              }}
            />
          )}
        </div>
        <aside className="details">
          <AttributesPane node={props.selectedNode} updateAttribute={props.updateAttribute} removeAttribute={props.removeAttribute} />
          <StylesPane matchedStyles={props.matchedStyles} computedStyle={props.computedStyle} />
        </aside>
      </div>
    </section>
  );
}

function DomNodeRow(props: {
  node: DomNode;
  depth: number;
  selectedId?: number;
  isExpanded: (nodeId: number) => boolean;
  toggleExpanded: (nodeId: number) => void;
  requestChildren: (node: DomNode) => void;
  highlightNode: (node: DomNode) => void;
  hideHighlight: () => void;
  focusTree: () => void;
  onRowClick: (node: DomNode) => void;
}) {
  const hasChildren = Boolean(props.node.children?.length) || Boolean(props.node.childNodeCount);
  const expanded = props.isExpanded(props.node.nodeId);
  async function toggle() {
    if (!expanded && !props.node.children?.length && props.node.childNodeCount) props.requestChildren(props.node);
    props.toggleExpanded(props.node.nodeId);
  }
  return (
    <div>
      <div
        data-node-id={props.node.nodeId}
        className={`dom-row ${props.selectedId === props.node.nodeId ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + props.depth * 14 }}
        onClick={() => props.onRowClick(props.node)}
        onMouseEnter={() => props.highlightNode(props.node)}
        onMouseLeave={props.hideHighlight}
      >
        <button
          className="twisty"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
            props.focusTree();
          }}
          disabled={!hasChildren}
        >
          {hasChildren ? (expanded ? 'v' : '>') : ''}
        </button>
        <span>{nodeLabel(props.node)}</span>
      </div>
      {expanded && props.node.children?.map((child) => (
        <DomNodeRow
          key={child.nodeId}
          {...props}
          node={child}
          depth={props.depth + 1}
        />
      ))}
    </div>
  );
}

function AttributesPane({ node, updateAttribute, removeAttribute }: {
  node: DomNode | null;
  updateAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}) {
  const pairs = attributesToPairs(node?.attributes);
  if (!node) return <section className="pane"><h2>Attributes</h2><div className="empty">Select an element.</div></section>;
  return (
    <section className="pane">
      <h2>Attributes</h2>
      {node.nodeType !== 1 ? <div className="empty">Attributes are available for element nodes.</div> : pairs.map(([name, value]) => (
        <AttributeEditor key={name} name={name} value={value} updateAttribute={updateAttribute} removeAttribute={removeAttribute} />
      ))}
    </section>
  );
}

function AttributeEditor({ name, value, updateAttribute, removeAttribute }: {
  name: string;
  value: string;
  updateAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="attribute-row">
      <span className="attr-name">{name}</span>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') updateAttribute(name, draft); }} />
      <button onClick={() => updateAttribute(name, draft)}>Save</button>
      <button onClick={() => removeAttribute(name)}>Remove</button>
    </div>
  );
}

function StylesPane({ matchedStyles, computedStyle }: { matchedStyles: MatchedStylesResult | null; computedStyle: ComputedStyleResult | null }) {
  return (
    <section className="pane styles-pane">
      <h2>Styles</h2>
      {!matchedStyles && !computedStyle && <div className="empty">Select an element to load CSS.</div>}
      {matchedStyles?.inlineStyle?.cssProperties?.length ? <StyleBlock title="inline" properties={matchedStyles.inlineStyle.cssProperties} /> : null}
      {matchedStyles?.attributesStyle?.cssProperties?.length ? <StyleBlock title="attributes" properties={matchedStyles.attributesStyle.cssProperties} /> : null}
      {matchedStyles?.matchedCSSRules?.slice(0, 20).map((item, index) => (
        <StyleBlock key={index} title={item.rule?.selectorList?.text ?? 'matched rule'} properties={item.rule?.style?.cssProperties ?? []} />
      ))}
      {computedStyle?.computedStyle && <StyleBlock title="computed" properties={computedStyle.computedStyle.slice(0, 80)} />}
    </section>
  );
}

function CookiesPanel(props: {
  attached: boolean;
  url?: string;
  cookies: Cookie[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  selectedKey: string | null;
  draft: CookieDraft | null;
  onSelect: (cookie: Cookie) => void;
  onRefresh: () => void;
  onChangeDraft: (draft: CookieDraft) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const filteredCookies = useMemo(() => {
    const query = props.search.trim().toLowerCase();
    if (!query) return props.cookies;
    return props.cookies.filter((cookie) => {
      const haystack = [cookie.name, cookie.value, cookie.domain, cookie.path, cookie.sameSite ?? '', cookie.priority ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [props.cookies, props.search]);

  const selectedCookie = filteredCookies.find((cookie) => cookieKey(cookie) === props.selectedKey) ?? props.cookies.find((cookie) => cookieKey(cookie) === props.selectedKey) ?? null;

  return (
    <section className="cookies">
      <div className="toolbar">
        <button onClick={props.onRefresh} disabled={!props.attached || props.loading}>Refresh</button>
        <span>{props.cookies.length} cookies</span>
        <span className="muted">{props.url ?? 'No active tab'}</span>
        {props.loading && <span>Loading...</span>}
      </div>
      <div className="cookies-layout">
        <div className="cookie-list">
          <div className="cookie-search">
            <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search cookies" disabled={!props.attached} />
          </div>
          {props.attached && !props.loading && filteredCookies.length === 0 && <div className="empty">No cookies found for this page.</div>}
          {filteredCookies.map((cookie) => {
            const selected = props.selectedKey === cookieKey(cookie);
            return (
              <button
                key={cookieKey(cookie)}
                className={`cookie-row ${selected ? 'selected' : ''}`}
                onClick={() => props.onSelect(cookie)}
                type="button"
              >
                <div className="cookie-main">
                  <strong>{cookie.name}</strong>
                  <span>{cookie.value}</span>
                </div>
                <div className="cookie-meta">
                  <span>{cookie.domain}</span>
                  <span>{cookie.path}</span>
                  <span className="flag-chip">{cookie.secure ? 'Secure' : 'Not secure'}</span>
                  <span className="flag-chip">{cookie.httpOnly ? 'HttpOnly' : 'Script accessible'}</span>
                  {cookie.sameSite && <span className="flag-chip">{cookie.sameSite}</span>}
                </div>
              </button>
            );
          })}
        </div>
        <aside className="cookie-details">
          {!selectedCookie || !props.draft ? (
            <div className="empty">Select a cookie to inspect and edit its flags.</div>
          ) : (
            <div className="cookie-editor">
              <h2>{selectedCookie.name}</h2>
              <label>
                <span>Value</span>
                <input value={props.draft.value} onChange={(event) => props.onChangeDraft({ ...props.draft!, value: event.target.value })} />
              </label>
              <div className="cookie-grid">
                <label>
                  <span>Domain</span>
                  <input value={props.draft.domain} readOnly />
                </label>
                <label>
                  <span>Path</span>
                  <input value={props.draft.path} readOnly />
                </label>
              </div>
              <div className="cookie-grid flags">
                <label><input type="checkbox" checked={props.draft.secure} onChange={(event) => props.onChangeDraft({ ...props.draft!, secure: event.target.checked })} /> Secure</label>
                <label><input type="checkbox" checked={props.draft.httpOnly} onChange={(event) => props.onChangeDraft({ ...props.draft!, httpOnly: event.target.checked })} /> HttpOnly</label>
                <label><input type="checkbox" checked={props.draft.session} onChange={(event) => props.onChangeDraft({ ...props.draft!, session: event.target.checked })} /> Session</label>
              </div>
              <div className="cookie-grid">
                <label>
                  <span>SameSite</span>
                  <select value={props.draft.sameSite} onChange={(event) => props.onChangeDraft({ ...props.draft!, sameSite: event.target.value as CookieSameSite | '' })}>
                    <option value="">Unset</option>
                    <option value="Lax">Lax</option>
                    <option value="Strict">Strict</option>
                    <option value="None">None</option>
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select value={props.draft.priority} onChange={(event) => props.onChangeDraft({ ...props.draft!, priority: event.target.value as CookiePriority | '' })}>
                    <option value="">Unset</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Expires</span>
                <input
                  type="datetime-local"
                  value={props.draft.expiresText}
                  disabled={props.draft.session}
                  onChange={(event) => props.onChangeDraft({ ...props.draft!, expiresText: event.target.value })}
                />
              </label>
              <div className="cookie-readonly">
                <span>Partition key: {selectedCookie.partitionKey ? stringifyUnknown(selectedCookie.partitionKey) : 'none'}</span>
                <span>Source: {selectedCookie.sourceScheme ?? 'unknown'} / {selectedCookie.sourcePort ?? 'unknown'}</span>
                <span>Size: {selectedCookie.size ?? 'unknown'}</span>
              </div>
              <div className="cookie-actions">
                <button onClick={props.onSave}>Save</button>
                <button onClick={props.onDelete}>Delete</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function StoragePanel(props: {
  attached: boolean;
  mode: StorageMode;
  setMode: (mode: StorageMode) => void;
  webStorage: WebStorageSnapshot | null;
  webStorageLoading: boolean;
  webStorageArea: WebStorageArea;
  setWebStorageArea: (area: WebStorageArea) => void;
  webStorageSearch: string;
  setWebStorageSearch: (value: string) => void;
  webStorageDraft: StorageDraft | null;
  onChangeWebStorageDraft: (draft: StorageDraft | null) => void;
  indexedDbOverview: IndexedDbDatabasesResult | null;
  indexedDbLoading: boolean;
  indexedDbSelection: IndexedDbSelection | null;
  indexedDbEntries: IndexedDbEntriesResult | null;
  indexedDbSearch: string;
  setIndexedDbSearch: (value: string) => void;
  onRefreshWebStorage: (area?: WebStorageArea) => void;
  onRefreshIndexedDbOverview: () => void;
  onRefreshIndexedDbEntries: (selection?: IndexedDbSelection) => void;
  onSetWebStorageItem: () => void;
  onDeleteWebStorageItem: (area: WebStorageArea, key: string) => void;
  onSelectIndexedDb: (selection: IndexedDbSelection | null) => void;
  onDeleteIndexedDbEntry: (key: IndexedDbKeySpec) => void;
  onClearIndexedDbStore: () => void;
  onDeleteIndexedDbDatabase: (databaseName: string) => void;
}) {
  const webItems = props.webStorage ? props.webStorage[props.webStorageArea] : [];
  const filteredWebItems = useMemo(() => {
    const query = props.webStorageSearch.trim().toLowerCase();
    if (!query) return webItems;
    return webItems.filter((item) => `${item.key} ${item.value}`.toLowerCase().includes(query));
  }, [props.webStorageSearch, props.webStorageArea, props.webStorage]);

  const selectedWebItem = filteredWebItems.find((item) => item.key === props.webStorageDraft?.key) ?? filteredWebItems[0] ?? null;

  const selectedDb = props.indexedDbOverview?.databases.find((db) => db.name === props.indexedDbSelection?.databaseName) ?? null;
  const selectedStore = selectedDb?.objectStores.find((store) => store.name === props.indexedDbSelection?.objectStoreName) ?? null;
  const filteredIndexedEntries = useMemo(() => {
    const query = props.indexedDbSearch.trim().toLowerCase();
    const entries = props.indexedDbEntries?.entries ?? [];
    if (!query) return entries;
    return entries.filter((entry) => `${entry.keyText} ${entry.valueText}`.toLowerCase().includes(query));
  }, [props.indexedDbEntries, props.indexedDbSearch]);
  const selectedIndexedEntry = filteredIndexedEntries[props.indexedDbSelection?.selectedEntryIndex ?? 0] ?? null;

  return (
    <section className="storage">
      <div className="toolbar">
        <button className={props.mode === 'web' ? 'active' : ''} onClick={() => props.setMode('web')} disabled={!props.attached}>Web Storage</button>
        <button className={props.mode === 'indexeddb' ? 'active' : ''} onClick={() => props.setMode('indexeddb')} disabled={!props.attached}>IndexedDB</button>
        <span>{props.mode === 'web' ? (props.webStorageLoading ? 'Loading...' : `${webItems.length} items`) : (props.indexedDbLoading ? 'Loading...' : `${props.indexedDbOverview?.databases.length ?? 0} databases`)}</span>
      </div>
      {props.mode === 'web' ? (
        <div className="storage-layout">
          <div className="storage-list">
            <div className="subtabs">
              <button className={props.webStorageArea === 'localStorage' ? 'active' : ''} onClick={() => { props.setWebStorageArea('localStorage'); props.onRefreshWebStorage('localStorage'); }}>localStorage</button>
              <button className={props.webStorageArea === 'sessionStorage' ? 'active' : ''} onClick={() => { props.setWebStorageArea('sessionStorage'); props.onRefreshWebStorage('sessionStorage'); }}>sessionStorage</button>
              <button onClick={() => props.onChangeWebStorageDraft({ area: props.webStorageArea, key: '', value: '', previousKey: '' })}>New</button>
            </div>
            <div className="cookie-search">
              <input value={props.webStorageSearch} onChange={(event) => props.setWebStorageSearch(event.target.value)} placeholder="Search storage" disabled={!props.attached} />
            </div>
            {filteredWebItems.length === 0 ? <div className="empty">No storage items found.</div> : filteredWebItems.map((item) => (
              <button
                key={`${item.key}`}
                type="button"
                className={`cookie-row ${selectedWebItem?.key === item.key ? 'selected' : ''}`}
                onClick={() => props.onChangeWebStorageDraft({ area: props.webStorageArea, key: item.key, value: item.value, previousKey: item.key })}
              >
                <div className="cookie-main">
                  <strong>{item.key}</strong>
                  <span>{item.value}</span>
                </div>
              </button>
            ))}
          </div>
          <aside className="storage-editor">
            {!props.webStorageDraft ? (
              <div className="empty">Select a storage key to edit it.</div>
            ) : (
              <div className="cookie-editor">
                <label>
                  <span>Key</span>
                  <input value={props.webStorageDraft.key} onChange={(event) => props.onChangeWebStorageDraft({ ...props.webStorageDraft!, key: event.target.value })} />
                </label>
                <label>
                  <span>Value</span>
                  <textarea value={props.webStorageDraft.value} onChange={(event) => props.onChangeWebStorageDraft({ ...props.webStorageDraft!, value: event.target.value })} rows={10} />
                </label>
                <div className="cookie-actions">
                  <button onClick={props.onSetWebStorageItem}>Save</button>
                  <button onClick={() => props.onDeleteWebStorageItem(props.webStorageArea, props.webStorageDraft!.key)}>Delete</button>
                </div>
                {selectedWebItem && <div className="cookie-readonly"><span>Current value: {selectedWebItem.value}</span></div>}
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="storage-layout indexeddb">
          <div className="storage-list">
            <div className="subtabs">
              <button onClick={props.onRefreshIndexedDbOverview} disabled={!props.attached}>Refresh</button>
              <span>{props.indexedDbOverview?.origin ?? 'No active origin'}</span>
            </div>
            {props.indexedDbOverview?.databases.length ? props.indexedDbOverview.databases.map((db) => (
              <div key={db.name} className="storage-db">
                <button
                  type="button"
                  className={`cookie-row ${selectedDb?.name === db.name ? 'selected' : ''}`}
                  onClick={() => {
                    const firstStore = db.objectStores[0];
                    const selection = firstStore ? { databaseName: db.name, objectStoreName: firstStore.name, selectedEntryIndex: 0 } : null;
                    props.onSelectIndexedDb(selection);
                    if (selection) props.onRefreshIndexedDbEntries(selection);
                  }}
                >
                  <div className="cookie-main">
                    <strong>{db.name}</strong>
                    <span>version {db.version}</span>
                  </div>
                </button>
                {selectedDb?.name === db.name && (
                  <div className="db-stores">
                    {db.objectStores.map((store) => (
                      <button
                        type="button"
                        key={store.name}
                        className={`store-row ${selectedStore?.name === store.name ? 'active' : ''}`}
                        onClick={() => {
                          const selection = { databaseName: db.name, objectStoreName: store.name, selectedEntryIndex: 0 };
                          props.onSelectIndexedDb(selection);
                          props.onRefreshIndexedDbEntries(selection);
                        }}
                      >
                        {store.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )) : <div className="empty">No IndexedDB databases found.</div>}
          </div>
          <aside className="storage-editor">
            {!selectedDb || !selectedStore || !props.indexedDbEntries ? (
              <div className="empty">Select a database and object store.</div>
            ) : (
              <div className="cookie-editor">
                <h2>{selectedDb.name} / {selectedStore.name}</h2>
                <div className="cookie-readonly">
                  <span>Key path: {stringifyUnknown(selectedStore.keyPath ?? 'none')}</span>
                  <span>Auto increment: {String(Boolean(selectedStore.autoIncrement))}</span>
                  <span>Entries: {props.indexedDbEntries.entries.length}</span>
                </div>
                <div className="cookie-search">
                  <input value={props.indexedDbSearch} onChange={(event) => props.setIndexedDbSearch(event.target.value)} placeholder="Search entries" />
                </div>
                <div className="indexeddb-entry-list">
                  {filteredIndexedEntries.length === 0 ? <div className="empty">No entries found.</div> : filteredIndexedEntries.map((entry, index) => (
                    <button
                      key={`${entry.keyText}-${index}`}
                      type="button"
                      className={`cookie-row ${props.indexedDbSelection?.selectedEntryIndex === index ? 'selected' : ''}`}
                      onClick={() => props.onSelectIndexedDb({ databaseName: selectedDb.name, objectStoreName: selectedStore.name, selectedEntryIndex: index })}
                    >
                      <div className="cookie-main">
                        <strong>{entry.keyText}</strong>
                        <span>{entry.valueText}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {selectedIndexedEntry && (
                  <div className="cookie-readonly">
                    <span>Selected key: {selectedIndexedEntry.keyText}</span>
                    <span>Value serializable: {String(selectedIndexedEntry.valueSerializable)}</span>
                    <span>Value preview: {selectedIndexedEntry.valueText}</span>
                  </div>
                )}
                <div className="cookie-actions">
                  <button onClick={() => selectedIndexedEntry && props.onDeleteIndexedDbEntry(selectedIndexedEntry.keySpec)} disabled={!selectedIndexedEntry}>Delete entry</button>
                  <button onClick={props.onClearIndexedDbStore}>Clear store</button>
                  <button onClick={() => props.onDeleteIndexedDbDatabase(selectedDb.name)}>Delete database</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function StyleBlock({ title, properties }: { title: string; properties: Array<{ name: string; value: string; disabled?: boolean }> }) {
  const visible = properties.filter((property) => !property.disabled && property.name && property.value);
  return (
    <div className="style-block">
      <h3>{title}</h3>
      {visible.slice(0, 80).map((property, index) => (
        <div key={`${property.name}-${index}`} className="css-row"><span>{property.name}</span><b>{property.value}</b></div>
      ))}
    </div>
  );
}

function cookieKey(cookie: Cookie): string {
  return `${cookie.name}|${cookie.domain}|${cookie.path}|${cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : ''}`;
}

function toCookieDraft(cookie: Cookie): CookieDraft {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    session: cookie.session !== false,
    sameSite: cookie.sameSite ?? '',
    priority: cookie.priority ?? '',
    expiresText: cookie.expires && cookie.expires > 0 ? toDatetimeLocal(cookie.expires) : ''
  };
}

function toCookieInput(draft: CookieDraft): CookieInput {
  return {
    name: draft.name,
    value: draft.value,
    domain: draft.domain,
    path: draft.path,
    secure: draft.secure,
    httpOnly: draft.httpOnly,
    ...(draft.sameSite ? { sameSite: draft.sameSite } : {}),
    ...(draft.priority ? { priority: draft.priority } : {}),
    ...(!draft.session && draft.expiresText ? { expires: fromDatetimeLocal(draft.expiresText) } : {})
  };
}

function toCookieDeleteInput(draft: CookieDraft): CookieDeleteInput {
  return { name: draft.name, domain: draft.domain, path: draft.path };
}

function toDatetimeLocal(expires: number): string {
  const date = new Date(expires * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): number {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : Math.floor(parsed.getTime() / 1000);
}

async function sendMessage<T>(request: ExtensionRequest): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse<T>>;
}

function consoleApiEntry(payload: unknown): ConsoleEntry {
  const event = payload as { type?: ConsoleEntry['level']; args?: RemoteObjectLite[] };
  return { id: makeId('console'), ts: Date.now(), level: event.type ?? 'log', source: 'console', args: event.args, raw: payload };
}

function exceptionEntry(payload: unknown): ConsoleEntry {
  const event = payload as { exceptionDetails?: { exception?: RemoteObjectLite; text?: string } };
  return {
    id: makeId('exception'),
    ts: Date.now(),
    level: 'exception',
    source: 'runtime',
    args: event.exceptionDetails?.exception ? [event.exceptionDetails.exception] : undefined,
    text: event.exceptionDetails?.text,
    raw: payload
  };
}

function logEntry(payload: unknown): ConsoleEntry {
  const event = payload as { entry?: { level?: string; text?: string } };
  return {
    id: makeId('log'),
    ts: Date.now(),
    level: event.entry?.level === 'error' ? 'error' : 'log',
    source: 'log',
    text: event.entry?.text ?? stringifyUnknown(payload),
    raw: payload
  };
}

function remoteObjectText(value: RemoteObjectLite): string {
  if (value.type === 'undefined') return 'undefined';
  if (value.subtype === 'null') return 'null';
  if (value.type === 'string') return JSON.stringify(value.value);
  if (value.value !== undefined) return String(value.value);
  if (value.unserializableValue) return value.unserializableValue;
  if (value.preview?.properties?.length) {
    const inner = value.preview.properties.slice(0, 5).map((property) => `${property.name}: ${property.value ?? property.type}`).join(', ');
    return `${value.description ?? value.className ?? value.type} { ${inner}${value.preview.overflow ? ', ...' : ''} }`;
  }
  return value.description ?? value.className ?? value.type;
}

function nodeLabel(node: DomNode): string {
  if (node.nodeType === 9) return '#document';
  if (node.nodeType === 10) return '<!doctype html>';
  if (node.nodeType === 8) return `<!-- ${node.nodeValue.trim()} -->`;
  if (node.nodeType === 3) return `"${node.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 80)}"`;
  if (node.nodeType === 1) {
    const attrs = attributesToPairs(node.attributes).slice(0, 4).map(([name, value]) => `${name}="${value}"`).join(' ');
    return `<${node.nodeName.toLowerCase()}${attrs ? ` ${attrs}` : ''}>`;
  }
  return node.nodeName;
}

function attributesToPairs(attributes?: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let index = 0; attributes && index < attributes.length; index += 2) {
    pairs.push([attributes[index], attributes[index + 1] ?? '']);
  }
  return pairs;
}

function mergeChildren(node: DomNode, parentId: number, children: DomNode[]): DomNode {
  if (node.nodeId === parentId) return { ...node, children };
  if (!node.children) return node;
  return { ...node, children: node.children.map((child) => mergeChildren(child, parentId, children)) };
}

type VisibleNode = {
  node: DomNode;
  depth: number;
  parentId?: number;
  hasChildren: boolean;
};

function buildInitialExpandedIds(root: DomNode): Set<number> {
  const expanded = new Set<number>();
  if (Boolean(root.children?.length) || Boolean(root.childNodeCount)) {
    expanded.add(root.nodeId);
  }
  return expanded;
}

function buildVisibleNodes(root: DomNode | null, expandedIds: Set<number>): VisibleNode[] {
  const result: VisibleNode[] = [];

  function walk(node: DomNode, depth: number, parentId?: number) {
    const hasChildren = Boolean(node.children?.length) || Boolean(node.childNodeCount);
    result.push({ node, depth, parentId, hasChildren });
    if (!hasChildren || !expandedIds.has(node.nodeId)) return;
    node.children?.forEach((child) => walk(child, depth + 1, node.nodeId));
  }

  if (root) walk(root, 0);
  return result;
}

function findNodeById(node: DomNode | null, nodeId: number): DomNode | null {
  if (!node) return null;
  if (node.nodeId === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
}

function getPolicyStatus(url: string | undefined): { allowed: boolean; reason?: string } {
  if (!url) return { allowed: false, reason: 'No active tab URL is available.' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: 'Only http and https pages can be inspected.' };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'This tab URL cannot be inspected.' };
  }
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const baseConsoleSuggestions = [
  'console.log()',
  'console.info()',
  'console.warn()',
  'console.error()',
  'document',
  'document.querySelector()',
  'document.querySelectorAll()',
  'window',
  'location',
  'localStorage',
  'sessionStorage',
  'JSON.stringify()',
  'JSON.parse()',
  'Array.from()',
  'Object.keys()',
  'Object.values()',
  'Object.entries()',
  'Promise.resolve()',
  'fetch()',
  'setTimeout()',
  'clearTimeout()'
];

function getConsoleSuggestions(input: string, history: string[]): string[] {
  const query = input.trim();
  if (!query) return history.slice(0, 5);
  return [...history, ...baseConsoleSuggestions]
    .filter((item, index, items) => items.indexOf(item) === index)
    .filter((item) => item.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 8);
}
