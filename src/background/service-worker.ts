import { DebuggerSessionManager } from './debugger-session';
import { isAllowedDebugUrl } from './url-policy';
import type {
  ActiveTabInfo,
  ExtensionRequest,
  ExtensionResponse,
  Settings
} from '../shared/extension-messages';

const manager = new DebuggerSessionManager();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
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
      case 'GET_SETTINGS':
        return ok(await getSettings());
      case 'ADD_ALLOWED_ORIGIN':
        return await addAllowedOrigin(request.url);
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
      case 'GET_DOCUMENT':
        return ok(await manager.sendCommand(request.tabId, 'DOM.getDocument', { depth: 1, pierce: true }));
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
  const settings = await getSettings();
  const policy = isAllowedDebugUrl(tab.url, settings);
  if (!policy.allowed) return fail(policy.reason ?? 'This URL is blocked by policy.');
  await manager.attach(tabId);
  return ok(manager.getState(tabId));
}

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return normalizeSettings(stored.settings);
}

async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

async function addAllowedOrigin(url: string): Promise<ExtensionResponse<Settings>> {
  const pattern = originPatternFromUrl(url);
  if (!pattern) return fail('This tab URL cannot be added to the allowlist.');

  const policy = isAllowedDebugUrl(url, { allowedPatterns: [pattern] });
  if (!policy.allowed) return fail(policy.reason ?? 'This URL is blocked by policy.');

  const granted = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
  if (!granted) return fail('Chrome permission was not granted for this origin.');

  const settings = await getSettings();
  const allowedPatterns = Array.from(new Set([...(settings.allowedPatterns ?? []), pattern])).sort();
  const next = { ...settings, allowedPatterns };
  await setSettings(next);
  return ok(next);
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

function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return {};
  const allowedPatterns = Array.isArray((value as Settings).allowedPatterns)
    ? (value as Settings).allowedPatterns?.filter((item): item is string => typeof item === 'string')
    : undefined;
  return { allowedPatterns };
}

function originPatternFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}
