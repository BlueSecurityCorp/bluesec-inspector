import { DebuggerSessionManager } from './debugger-session';
import { isAllowedDebugUrl } from './url-policy';
import type {
  ActiveTabInfo,
  ExtensionRequest,
  ExtensionResponse
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

