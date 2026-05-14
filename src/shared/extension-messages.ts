import type {
  ComputedStyle,
  Cookie,
  CookieDeleteInput,
  CookieInput,
  DomNode,
  IndexedDbDatabase,
  IndexedDbEntry,
  MatchedStyles,
  RemoteObjectLite,
  SessionState,
  WebStorageSnapshot,
} from './cdp-types';

export type ActiveTabInfo = {
  id: number;
  title?: string;
  url?: string;
};

export type UrlPolicyResult = {
  allowed: boolean;
  reason?: string;
};

export type ExtensionRequest =
  | { type: 'GET_ACTIVE_TAB' }
  | { type: 'GET_TAB'; tabId: number }
  | { type: 'OPEN_DETACHED_WINDOW'; tabId: number }
  | { type: 'ATTACH'; tabId: number }
  | { type: 'DETACH'; tabId: number }
  | { type: 'GET_SESSION_STATE'; tabId: number }
  | { type: 'EVALUATE'; tabId: number; expression: string; contextId?: number }
  | { type: 'GET_PROPERTIES'; tabId: number; objectId: string }
  | { type: 'RELEASE_CONSOLE_OBJECTS'; tabId: number }
  | { type: 'GET_DOCUMENT'; tabId: number; depth?: number }
  | { type: 'GET_COOKIES'; tabId: number }
  | { type: 'SET_COOKIE'; tabId: number; cookie: CookieInput }
  | { type: 'DELETE_COOKIE'; tabId: number; cookie: CookieDeleteInput }
  | { type: 'GET_WEB_STORAGE'; tabId: number }
  | { type: 'SET_WEB_STORAGE_ITEM'; tabId: number; area: 'localStorage' | 'sessionStorage'; key: string; value: string; previousKey?: string }
  | { type: 'DELETE_WEB_STORAGE_ITEM'; tabId: number; area: 'localStorage' | 'sessionStorage'; key: string }
  | { type: 'GET_INDEXED_DB_DATABASES'; tabId: number }
  | { type: 'GET_INDEXED_DB_ENTRIES'; tabId: number; databaseName: string; objectStoreName: string; skipCount?: number; pageSize?: number }
  | { type: 'DELETE_INDEXED_DB_ENTRY'; tabId: number; databaseName: string; objectStoreName: string; key: unknown }
  | { type: 'CLEAR_INDEXED_DB_STORE'; tabId: number; databaseName: string; objectStoreName: string }
  | { type: 'DELETE_INDEXED_DB_DATABASE'; tabId: number; databaseName: string }
  | { type: 'START_INSPECT_MODE'; tabId: number }
  | { type: 'STOP_INSPECT_MODE'; tabId: number }
  | { type: 'REQUEST_CHILD_NODES'; tabId: number; nodeId: number }
  | { type: 'HIGHLIGHT_NODE'; tabId: number; nodeId: number }
  | { type: 'HIDE_HIGHLIGHT'; tabId: number }
  | { type: 'SET_ATTRIBUTE'; tabId: number; nodeId: number; name: string; value: string }
  | { type: 'REMOVE_ATTRIBUTE'; tabId: number; nodeId: number; name: string }
  | { type: 'SET_OUTER_HTML'; tabId: number; nodeId: number; outerHTML: string }
  | { type: 'GET_MATCHED_STYLES'; tabId: number; nodeId: number }
  | { type: 'GET_COMPUTED_STYLE'; tabId: number; nodeId: number };

export type PickElementByPointRequest = {
  type: 'PICK_ELEMENT_BY_POINT';
  tabId: number;
  x: number;
  y: number;
};

export type ExtensionResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: unknown };

export type ExtensionEvent =
  | { type: 'ATTACHED'; tabId: number }
  | { type: 'DETACHED'; tabId: number; reason?: string }
  | { type: 'CONSOLE_EVENT'; tabId: number; payload: unknown }
  | { type: 'EXCEPTION_EVENT'; tabId: number; payload: unknown }
  | { type: 'LOG_EVENT'; tabId: number; payload: unknown }
  | { type: 'DOM_EVENT'; tabId: number; method: string; payload: unknown }
  | { type: 'ELEMENT_PICKED'; tabId: number; nodeId: number; backendNodeId?: number }
  | { type: 'INSPECT_MODE_CHANGED'; tabId: number; inspecting: boolean }
  | { type: 'CDP_ERROR'; tabId?: number; message: string; detail?: unknown };

export type EvaluateResult = {
  result?: RemoteObjectLite;
  exceptionDetails?: unknown;
};

export type GetPropertiesResult = {
  result: Array<{ name: string; value?: RemoteObjectLite; enumerable?: boolean; isOwn?: boolean }>;
};

export type DocumentResult = { root: DomNode };
export type CookiesResult = { cookies: Cookie[] };
export type WebStorageResult = WebStorageSnapshot;
export type IndexedDbDatabasesResult = { origin: string; databases: IndexedDbDatabase[] };
export type IndexedDbEntriesResult = { databaseName: string; objectStoreName: string; entries: IndexedDbEntry[]; hasMore: boolean };
export type MatchedStylesResult = MatchedStyles;
export type ComputedStyleResult = { computedStyle: ComputedStyle };
export type SessionStateResult = SessionState;
