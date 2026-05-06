import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComputedStyleResult,
  DocumentResult,
  EvaluateResult,
  ExtensionEvent,
  ExtensionRequest,
  ExtensionResponse,
  GetPropertiesResult,
  MatchedStylesResult,
  SessionStateResult,
} from '../shared/extension-messages';
import type { DomNode, RemoteObjectLite } from '../shared/cdp-types';
import { makeId } from '../shared/utils';

type Panel = 'console' | 'elements';
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
  const [selectedNode, setSelectedNode] = useState<DomNode | null>(null);
  const [matchedStyles, setMatchedStyles] = useState<MatchedStylesResult | null>(null);
  const [computedStyle, setComputedStyle] = useState<ComputedStyleResult | null>(null);
  const send = useCallback(<T,>(request: ExtensionRequest) => sendMessage<T>(request), []);

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

  useEffect(() => {
    refreshActiveTab();
  }, [refreshActiveTab]);

  useEffect(() => {
    const listener = (event: ExtensionEvent) => {
      if (!activeTab || event.tabId !== activeTab.id) return;
      if (event.type === 'ATTACHED') {
        setState((previous) => ({ tabId: activeTab.id, attached: true, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title }));
        return;
      }
      if (event.type === 'DETACHED') {
        setState((previous) => ({ tabId: activeTab.id, attached: false, url: previous?.url ?? activeTab.url, title: previous?.title ?? activeTab.title, error: event.reason }));
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
  }, [activeTab, panel, refreshDocument]);

  const attached = state?.attached === true;
  const policy = useMemo(() => getPolicyStatus(activeTab?.url), [activeTab?.url]);

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
      setState({ tabId: activeTab.id, attached: false, url: activeTab.url, title: activeTab.title });
    } else {
      setError(response.error);
    }
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
      </nav>
      <main className="panel">
        {panel === 'console' ? (
          <ConsolePanel
            attached={attached}
            entries={entries}
            preserveLog={preserveLog}
            setPreserveLog={setPreserveLog}
            evaluate={evaluate}
            clear={clearConsole}
            exportLogs={exportLogs}
            tabId={activeTab?.id}
          />
        ) : (
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
}) {
  return (
    <section className="elements">
      <div className="toolbar">
        <button onClick={props.refreshDocument} disabled={!props.attached}>Reload DOM</button>
      </div>
      <div className="elements-layout">
        <div className="dom-tree">
          {!props.attached && <div className="empty">Attach to load the DOM tree.</div>}
          {props.attached && !props.rootNode && <div className="empty">Click Reload DOM.</div>}
          {props.rootNode && <DomNodeRow node={props.rootNode} depth={0} selectedId={props.selectedNode?.nodeId} {...props} />}
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
  requestChildren: (node: DomNode) => void;
  selectNode: (node: DomNode) => void;
  highlightNode: (node: DomNode) => void;
  hideHighlight: () => void;
}) {
  const [expanded, setExpanded] = useState(props.depth < 2);
  const hasChildren = Boolean(props.node.children?.length) || Boolean(props.node.childNodeCount);
  async function toggle() {
    if (!expanded && !props.node.children?.length && props.node.childNodeCount) props.requestChildren(props.node);
    setExpanded(!expanded);
  }
  return (
    <div>
      <div
        className={`dom-row ${props.selectedId === props.node.nodeId ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + props.depth * 14 }}
        onClick={() => props.selectNode(props.node)}
        onMouseEnter={() => props.highlightNode(props.node)}
        onMouseLeave={props.hideHighlight}
      >
        <button className="twisty" onClick={(event) => { event.stopPropagation(); toggle(); }} disabled={!hasChildren}>{hasChildren ? (expanded ? 'v' : '>') : ''}</button>
        <span>{nodeLabel(props.node)}</span>
      </div>
      {expanded && props.node.children?.map((child) => (
        <DomNodeRow key={child.nodeId} {...props} node={child} depth={props.depth + 1} />
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
