import type { ComputedStyle, DomNode, MatchedStyles, RemoteObjectLite, SessionState } from './cdp-types';

export type ActiveTabInfo = {
  id: number;
  title?: string;
  url?: string;
};

export type Settings = {
  allowedPatterns?: string[];
};

export type UrlPolicyResult = {
  allowed: boolean;
  reason?: string;
};

export type ExtensionRequest =
  | { type: 'GET_ACTIVE_TAB' }
  | { type: 'GET_TAB'; tabId: number }
  | { type: 'GET_SETTINGS' }
  | { type: 'ADD_ALLOWED_ORIGIN'; url: string }
  | { type: 'OPEN_DETACHED_WINDOW'; tabId: number }
  | { type: 'ATTACH'; tabId: number }
  | { type: 'DETACH'; tabId: number }
  | { type: 'GET_SESSION_STATE'; tabId: number }
  | { type: 'EVALUATE'; tabId: number; expression: string; contextId?: number }
  | { type: 'GET_PROPERTIES'; tabId: number; objectId: string }
  | { type: 'RELEASE_CONSOLE_OBJECTS'; tabId: number }
  | { type: 'GET_DOCUMENT'; tabId: number }
  | { type: 'REQUEST_CHILD_NODES'; tabId: number; nodeId: number }
  | { type: 'HIGHLIGHT_NODE'; tabId: number; nodeId: number }
  | { type: 'HIDE_HIGHLIGHT'; tabId: number }
  | { type: 'SET_ATTRIBUTE'; tabId: number; nodeId: number; name: string; value: string }
  | { type: 'REMOVE_ATTRIBUTE'; tabId: number; nodeId: number; name: string }
  | { type: 'SET_OUTER_HTML'; tabId: number; nodeId: number; outerHTML: string }
  | { type: 'GET_MATCHED_STYLES'; tabId: number; nodeId: number }
  | { type: 'GET_COMPUTED_STYLE'; tabId: number; nodeId: number };

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
  | { type: 'CDP_ERROR'; tabId?: number; message: string; detail?: unknown };

export type EvaluateResult = {
  result?: RemoteObjectLite;
  exceptionDetails?: unknown;
};

export type GetPropertiesResult = {
  result: Array<{ name: string; value?: RemoteObjectLite; enumerable?: boolean; isOwn?: boolean }>;
};

export type DocumentResult = { root: DomNode };
export type MatchedStylesResult = MatchedStyles;
export type ComputedStyleResult = { computedStyle: ComputedStyle };
export type SessionStateResult = SessionState;
