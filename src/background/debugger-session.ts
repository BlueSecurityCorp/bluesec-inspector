import type { SessionState } from '../shared/cdp-types';
import type { ExtensionEvent } from '../shared/extension-messages';

const protocolVersion = '1.3';

export class DebuggerSessionManager {
  private sessions = new Map<number, SessionState>();
  private reattachAfterNavigation = new Set<number>();
  private manualDetachInFlight = new Set<number>();
  private inspectHighlightConfig = {
    showInfo: true,
    contentColor: { r: 111, g: 168, b: 220, a: 0.25 },
    borderColor: { r: 37, g: 99, b: 235, a: 1 },
    marginColor: { r: 251, g: 191, b: 36, a: 0.25 },
    paddingColor: { r: 16, g: 185, b: 129, a: 0.25 }
  } as const;

  constructor() {
    chrome.debugger.onEvent.addListener((source, method, payload) => {
      if (source.tabId === undefined) return;
      this.handleEvent(source.tabId, method, payload);
    });

    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined) return;
      if (!this.manualDetachInFlight.has(source.tabId)) {
        this.reattachAfterNavigation.add(source.tabId);
      } else {
        this.manualDetachInFlight.delete(source.tabId);
      }
      this.sessions.set(source.tabId, { tabId: source.tabId, attached: false, inspecting: false, error: reason });
      this.broadcast({ type: 'DETACHED', tabId: source.tabId, reason });
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const session = this.sessions.get(tabId);
      if (!session) return;

      this.sessions.set(tabId, {
        ...session,
        url: tab.url ?? session.url,
        title: tab.title ?? session.title
      });

      if (changeInfo.status !== 'complete') return;
      if (!this.reattachAfterNavigation.has(tabId)) return;
      if (this.isAttached(tabId)) {
        this.reattachAfterNavigation.delete(tabId);
        return;
      }

      this.reattachAfterNavigation.delete(tabId);
      this.attach(tabId).catch(() => undefined);
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.sessions.delete(tabId);
      this.reattachAfterNavigation.delete(tabId);
      this.manualDetachInFlight.delete(tabId);
    });

  }

  async attach(tabId: number): Promise<void> {
    if (this.isAttached(tabId)) return;
    const target = { tabId };

    await chrome.debugger.attach(target, protocolVersion);
    try {
      this.sessions.set(tabId, { tabId, attached: true, inspecting: false });
      await this.sendCommand(tabId, 'Runtime.enable');
      await this.sendCommand(tabId, 'Console.enable');
      await this.sendCommand(tabId, 'Log.enable');
      await this.sendCommand(tabId, 'DOM.enable');
      await this.sendCommand(tabId, 'CSS.enable');
      await this.sendCommand(tabId, 'Overlay.enable');
      const tab = await chrome.tabs.get(tabId);
      this.sessions.set(tabId, { tabId, attached: true, inspecting: false, url: tab.url, title: tab.title });
      this.broadcast({ type: 'ATTACHED', tabId });
    } catch (error) {
      await chrome.debugger.detach(target).catch(() => undefined);
      this.sessions.set(tabId, { tabId, attached: false, inspecting: false, error: error instanceof Error ? error.message : 'Attach failed.' });
      throw error;
    }
  }

  async detach(tabId: number, reason?: string): Promise<void> {
    this.manualDetachInFlight.add(tabId);
    if (this.isAttached(tabId)) {
      await this.stopInspectMode(tabId).catch(() => undefined);
      await this.releaseConsoleObjects(tabId).catch(() => undefined);
      await chrome.debugger.detach({ tabId }).catch(() => undefined);
    }
    const previous = this.sessions.get(tabId);
    this.sessions.set(tabId, { tabId, attached: false, inspecting: false, url: previous?.url, title: previous?.title, error: reason });
    this.broadcast({ type: 'DETACHED', tabId, reason });
  }

  isAttached(tabId: number): boolean {
    return this.sessions.get(tabId)?.attached === true;
  }

  isInspecting(tabId: number): boolean {
    return this.sessions.get(tabId)?.inspecting === true;
  }

  async startInspectMode(tabId: number): Promise<void> {
    if (!this.isAttached(tabId)) {
      throw new Error('No debugger session is attached to this tab.');
    }
    await this.sendCommand(tabId, 'Overlay.setInspectMode', {
      mode: 'searchForNode',
      highlightConfig: this.inspectHighlightConfig
    });
    const previous = this.sessions.get(tabId);
    this.sessions.set(tabId, { tabId, attached: true, inspecting: true, url: previous?.url, title: previous?.title });
    this.broadcast({ type: 'INSPECT_MODE_CHANGED', tabId, inspecting: true });
  }

  async stopInspectMode(tabId: number): Promise<void> {
    if (!this.isAttached(tabId)) return;
    await this.sendCommand(tabId, 'Overlay.setInspectMode', { mode: 'none' });
    this.markInspectModeStopped(tabId);
  }

  async sendCommand<T = unknown>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isAttached(tabId)) {
      throw new Error('No debugger session is attached to this tab.');
    }
    return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
  }

  async releaseConsoleObjects(tabId: number): Promise<void> {
    if (!this.isAttached(tabId)) return;
    await this.sendCommand(tabId, 'Runtime.releaseObjectGroup', { objectGroup: 'bluesec-inspector-console' });
  }

  getState(tabId: number): SessionState {
    return this.sessions.get(tabId) ?? { tabId, attached: false };
  }

  private handleEvent(tabId: number, method: string, payload: unknown): void {
    if (method === 'Runtime.consoleAPICalled') {
      this.broadcast({ type: 'CONSOLE_EVENT', tabId, payload });
      return;
    }
    if (method === 'Runtime.exceptionThrown') {
      this.broadcast({ type: 'EXCEPTION_EVENT', tabId, payload });
      return;
    }
    if (method === 'Log.entryAdded') {
      this.broadcast({ type: 'LOG_EVENT', tabId, payload });
      return;
    }
    if (method === 'Overlay.inspectModeCanceled') {
      this.markInspectModeStopped(tabId);
      return;
    }
    if (method === 'Overlay.inspectNodeRequested') {
      this.handleInspectNodeRequested(tabId, payload).catch(() => undefined);
      return;
    }
    if (method.startsWith('DOM.')) {
      this.broadcast({ type: 'DOM_EVENT', tabId, method, payload });
    }
  }

  private async handleInspectNodeRequested(tabId: number, payload: unknown): Promise<void> {
    const backendNodeId = (payload as { backendNodeId?: number } | undefined)?.backendNodeId;
    if (!backendNodeId) return;

    await this.stopInspectMode(tabId).catch(() => undefined);
    const result = await this.sendCommand<{ nodeIds?: number[] }>(tabId, 'DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [backendNodeId]
    }).catch(() => undefined);
    const nodeId = result?.nodeIds?.[0];
    if (!nodeId) return;
    this.broadcast({ type: 'ELEMENT_PICKED', tabId, nodeId, backendNodeId });
  }

  private markInspectModeStopped(tabId: number): void {
    const previous = this.sessions.get(tabId);
    if (!previous) return;
    this.sessions.set(tabId, {
      tabId,
      attached: previous.attached,
      inspecting: false,
      url: previous.url,
      title: previous.title,
      error: previous.error
    });
    this.broadcast({ type: 'INSPECT_MODE_CHANGED', tabId, inspecting: false });
  }

  private broadcast(event: ExtensionEvent): void {
    chrome.runtime.sendMessage(event).catch(() => undefined);
  }
}
