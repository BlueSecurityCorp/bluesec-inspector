# ASTx 환경용 개발자 대체 DevTools Extension 개발 명세

## 0. 목적

ASTx 등 외부 보안 프로그램이 Chrome DevTools 창을 닫는 개발 환경에서, Chrome DevTools 창을 열지 않고도 최소한의 Console / Elements 기능을 사용할 수 있는 개발자용 Chrome Extension을 만든다.

이 프로젝트는 보안 프로그램을 비활성화하거나 우회·무력화하는 도구가 아니다. 브라우저의 일반 Extension UI 안에서 Chrome이 공식 제공하는 Extension API와 Chrome DevTools Protocol 접근 수단만 사용한다.

## 1. 제품 이름

작업명: `Lite Inspector`

최종 이름은 변경 가능하다.

## 2. 핵심 판단

DevTools Extension의 `devtools_page` 방식은 사용하지 않는다. 이 방식은 Chrome DevTools 창이 열려야 동작하므로, DevTools 창이 닫히는 환경에서는 목적에 맞지 않는다.

대신 다음 구조를 사용한다.

```txt
Chrome Extension
├─ sidePanel UI
├─ background service worker
├─ chrome.debugger API
└─ Chrome DevTools Protocol
   ├─ Runtime
   ├─ Console
   ├─ Log
   ├─ DOM
   ├─ CSS
   └─ Overlay
```

## 3. 범위

### 3.1 MVP 범위

MVP는 Chrome DevTools의 완전 복제가 아니라, 개발자가 실제로 가장 먼저 필요한 기능을 제공하는 것을 목표로 한다.

#### Console 탭

- 현재 활성 탭에 debugger attach
- debugger detach
- `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug` 수집
- uncaught exception 수집
- 사용자가 입력한 JavaScript expression 실행
- 실행 결과 출력
- primitive 값 렌더링
- object / array preview 렌더링
- object expand 시 property 조회
- 로그 clear
- 로그 JSON export

#### Elements 탭

- 현재 문서 DOM tree 조회
- node lazy expand
- element / text / comment node 표시
- attribute 표시
- selected node highlight
- selected node attributes 편집
- selected node outerHTML 보기
- selected node matched CSS 조회
- selected node computed CSS 조회
- DOM 변경 이벤트 반영

#### 공통 UI

- Chrome side panel 기반 UI
- Console / Elements 탭 전환
- 현재 탭 URL 표시
- attach 상태 표시
- 오류 메시지 표시
- localhost / 개발 도메인 우선 사용
- 민감 사이트 차단 옵션

### 3.2 MVP에서 제외

다음은 MVP에서 제외한다.

- Chrome DevTools UI 1:1 복제
- Sources 디버거
- breakpoint UI
- Network 패널
- Performance 패널
- Application 패널
- Lighthouse
- full autocomplete
- `$0`, `$1`, `$_`, `$()`, `$$()`, `copy()`, `inspect()` 완전 구현
- iframe / worker / OOPIF 완전 지원
- shadow DOM 완전 지원
- CSS cascade 완전 재현
- pseudo-state 강제 설정 UI
- event listener pane
- accessibility pane
- DevTools 창 강제 유지
- ASTx 종료, 비활성화, 회피, 프로세스 조작

## 4. 안전 요구사항

### 4.1 금지 사항

Codex는 다음 기능을 구현하지 않는다.

- ASTx 프로세스 탐지, 종료, 우회, 패치
- 보안 프로그램 탐지 회피
- 보호 사이트에서 강제로 디버깅 세션 유지
- 금융, 인증, 결제, 개인정보 페이지 대상 자동 attach
- 사용자의 명시적 조작 없이 자동 `Runtime.evaluate` 실행
- 전체 사이트 `<all_urls>` 기본 허용
- 원격 코드 로드
- 원격 명령 실행
- 수집 로그 외부 전송

### 4.2 기본 허용 URL

초기 기본값은 다음만 허용한다.

```txt
http://localhost/*
http://127.0.0.1/*
http://[::1]/*
```

개발자가 설정 화면에서 개발 도메인을 추가할 수 있게 한다.

예:

```txt
https://dev.example.com/*
https://staging.example.com/*
```

### 4.3 기본 차단 URL 키워드

다음 키워드를 포함하는 URL에서는 attach 버튼을 비활성화한다.

```txt
bank
card
pay
payment
cert
certificate
auth
login.gov
checkout
account
securities
insurance
```

이 목록은 완벽한 보안 기능이 아니라 실수 방지 장치다.

## 5. 기술 스택

권장 스택:

```txt
- Chrome Manifest V3
- TypeScript
- React
- Vite
- CSS Modules 또는 plain CSS
- chrome.debugger API
- chrome.sidePanel API
- chrome.storage.local
```

무거운 UI 프레임워크는 MVP에서 사용하지 않는다. 번들 크기와 복잡도를 낮춘다.

## 6. 권한 설계

`manifest.json` 기본 권한:

```json
{
  "manifest_version": 3,
  "name": "Lite Inspector",
  "version": "0.1.0",
  "description": "A lightweight developer inspector that works without opening Chrome DevTools.",
  "minimum_chrome_version": "116",
  "permissions": [
    "debugger",
    "sidePanel",
    "tabs",
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*",
    "http://[::1]/*"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Open Lite Inspector"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

주의:

- `debugger` 권한은 강력한 권한이므로 README에 명확히 설명한다.
- 기본 host permission은 개발 환경으로 제한한다.
- 필요 시 optional host permissions는 후속 단계에서 추가한다.

## 7. 프로젝트 구조

```txt
lite-inspector/
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ manifest.json
├─ src/
│  ├─ background/
│  │  ├─ service-worker.ts
│  │  ├─ debugger-session.ts
│  │  ├─ cdp-client.ts
│  │  └─ url-policy.ts
│  ├─ sidepanel/
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ styles.css
│  │  ├─ components/
│  │  │  ├─ Header.tsx
│  │  │  ├─ TabBar.tsx
│  │  │  ├─ ConsolePanel.tsx
│  │  │  ├─ ConsoleEntry.tsx
│  │  │  ├─ ConsoleInput.tsx
│  │  │  ├─ ObjectPreview.tsx
│  │  │  ├─ ElementsPanel.tsx
│  │  │  ├─ DomTree.tsx
│  │  │  ├─ DomNodeRow.tsx
│  │  │  ├─ AttributesPane.tsx
│  │  │  ├─ StylesPane.tsx
│  │  │  └─ ErrorBanner.tsx
│  │  ├─ hooks/
│  │  │  ├─ useActiveTab.ts
│  │  │  ├─ useDebuggerSession.ts
│  │  │  ├─ useConsole.ts
│  │  │  └─ useDomTree.ts
│  │  └─ protocol/
│  │     ├─ messages.ts
│  │     └─ types.ts
│  └─ shared/
│     ├─ cdp-types.ts
│     ├─ extension-messages.ts
│     └─ utils.ts
├─ public/
│  └─ icons/
└─ README.md
```

## 8. 메시지 아키텍처

Side panel은 직접 `chrome.debugger`를 호출하지 않는다. 모든 CDP 접근은 background service worker를 통해 수행한다.

```txt
SidePanel React UI
  └─ chrome.runtime.sendMessage
      └─ background service worker
          └─ chrome.debugger.attach / sendCommand / detach
              └─ target tab
```

이유:

- CDP 세션 상태를 한 곳에서 관리한다.
- attach / detach / tab navigation 처리가 단순해진다.
- UI가 reload되어도 service worker에서 상태 복구가 가능하다.

## 9. 메시지 타입

`src/shared/extension-messages.ts`에 정의한다.

```ts
export type ExtensionRequest =
  | { type: 'GET_ACTIVE_TAB' }
  | { type: 'ATTACH'; tabId: number }
  | { type: 'DETACH'; tabId: number }
  | { type: 'GET_SESSION_STATE'; tabId: number }
  | { type: 'EVALUATE'; tabId: number; expression: string; contextId?: number }
  | { type: 'GET_PROPERTIES'; tabId: number; objectId: string }
  | { type: 'GET_DOCUMENT'; tabId: number }
  | { type: 'REQUEST_CHILD_NODES'; tabId: number; nodeId: number }
  | { type: 'HIGHLIGHT_NODE'; tabId: number; nodeId: number }
  | { type: 'HIDE_HIGHLIGHT'; tabId: number }
  | { type: 'SET_ATTRIBUTE'; tabId: number; nodeId: number; name: string; value: string }
  | { type: 'REMOVE_ATTRIBUTE'; tabId: number; nodeId: number; name: string }
  | { type: 'SET_OUTER_HTML'; tabId: number; nodeId: number; outerHTML: string }
  | { type: 'GET_MATCHED_STYLES'; tabId: number; nodeId: number }
  | { type: 'GET_COMPUTED_STYLE'; tabId: number; nodeId: number }
  | { type: 'EXPORT_LOGS'; tabId: number };

export type ExtensionEvent =
  | { type: 'ATTACHED'; tabId: number }
  | { type: 'DETACHED'; tabId: number; reason?: string }
  | { type: 'CONSOLE_EVENT'; tabId: number; payload: unknown }
  | { type: 'EXCEPTION_EVENT'; tabId: number; payload: unknown }
  | { type: 'LOG_EVENT'; tabId: number; payload: unknown }
  | { type: 'DOM_EVENT'; tabId: number; method: string; payload: unknown }
  | { type: 'CDP_ERROR'; tabId?: number; message: string; detail?: unknown };
```

## 10. Background 구현 요구사항

### 10.1 DebuggerSessionManager

`src/background/debugger-session.ts`에 구현한다.

역할:

- tabId별 attach 상태 관리
- CDP command wrapper 제공
- enable domains 호출
- detach 이벤트 처리
- tab close / navigation 처리
- side panel로 CDP 이벤트 broadcast

필수 메서드:

```ts
class DebuggerSessionManager {
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  isAttached(tabId: number): boolean;
  sendCommand<T = unknown>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T>;
  getState(tabId: number): SessionState;
}
```

### 10.2 attach 시 enable할 CDP domains

attach 직후 다음 순서로 enable한다.

```ts
await sendCommand(tabId, 'Runtime.enable');
await sendCommand(tabId, 'Console.enable');
await sendCommand(tabId, 'Log.enable');
await sendCommand(tabId, 'DOM.enable');
await sendCommand(tabId, 'CSS.enable');
await sendCommand(tabId, 'Overlay.enable');
```

실패 시 부분 attach 상태를 정리하고 사용자에게 오류를 반환한다.

### 10.3 CDP 이벤트 라우팅

`chrome.debugger.onEvent`에서 다음 이벤트를 처리한다.

Console 관련:

```txt
Runtime.consoleAPICalled
Runtime.exceptionThrown
Log.entryAdded
```

DOM 관련:

```txt
DOM.documentUpdated
DOM.setChildNodes
DOM.childNodeInserted
DOM.childNodeRemoved
DOM.attributeModified
DOM.attributeRemoved
DOM.characterDataModified
```

detach 관련:

```txt
chrome.debugger.onDetach
```

### 10.4 Runtime.evaluate 기본 옵션

```ts
await sendCommand(tabId, 'Runtime.evaluate', {
  expression,
  awaitPromise: true,
  replMode: true,
  includeCommandLineAPI: true,
  generatePreview: true,
  objectGroup: 'lite-inspector-console'
});
```

주의:

- MVP에서는 사용자의 명시적 Enter 입력이 있을 때만 실행한다.
- attach 직후 자동 evaluate는 하지 않는다.
- 에러는 `exceptionDetails`를 UI에 표시한다.

### 10.5 object memory 관리

Console clear 또는 detach 시 다음 명령을 호출한다.

```ts
await sendCommand(tabId, 'Runtime.releaseObjectGroup', {
  objectGroup: 'lite-inspector-console'
});
```

실패해도 UI는 계속 동작해야 한다.

## 11. Side Panel UI 요구사항

### 11.1 레이아웃

```txt
┌────────────────────────────────────┐
│ Lite Inspector                      │
│ URL: http://localhost:3000          │
│ [Attach] [Detach] status: attached │
├────────────────────────────────────┤
│ [Console] [Elements]               │
├────────────────────────────────────┤
│ active panel content               │
└────────────────────────────────────┘
```

### 11.2 Header

표시 항목:

- 현재 탭 title
- 현재 탭 URL
- attach 상태
- attach / detach 버튼
- URL policy warning

### 11.3 ConsolePanel

구성:

```txt
ConsolePanel
├─ Toolbar
│  ├─ Clear
│  ├─ Export
│  └─ Preserve log toggle
├─ LogList
└─ ConsoleInput
```

로그 entry 타입:

```ts
type ConsoleEntry = {
  id: string;
  ts: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'exception' | 'result';
  source: 'console' | 'runtime' | 'log' | 'input' | 'result';
  text?: string;
  args?: RemoteObjectLite[];
  stackTrace?: unknown;
  raw?: unknown;
};
```

### 11.4 ObjectPreview

MVP 렌더링 규칙:

- `undefined`, `null`, boolean, number, bigint, string은 primitive로 표시
- object는 `description` 또는 `className` 표시
- array는 preview properties 일부 표시
- function은 `description` 표시
- `objectId`가 있으면 expand 버튼 표시
- expand 시 `Runtime.getProperties` 호출

### 11.5 ElementsPanel

구성:

```txt
ElementsPanel
├─ DOM tree
└─ Right pane
   ├─ Attributes
   ├─ Matched Styles
   └─ Computed Styles
```

DOM row 표시 규칙:

```txt
ELEMENT_NODE: <tag attr="value">
TEXT_NODE: "trimmed text"
COMMENT_NODE: <!-- comment -->
DOCUMENT_NODE: #document
DOCTYPE_NODE: <!doctype html>
```

### 11.6 DOM expand

- 최초 `DOM.getDocument({ depth: 1, pierce: true })` 호출
- node expand 시 `DOM.requestChildNodes({ nodeId, depth: 1, pierce: true })` 호출
- `DOM.setChildNodes` 이벤트로 children 저장

### 11.7 Node highlight

- DOM row hover 시 `DOM.highlightNode`
- mouse leave 시 `DOM.hideHighlight` 또는 `Overlay.hideHighlight`
- 선택한 노드는 persistent highlight하지 않는다. hover 중심으로 구현한다.

### 11.8 Attribute editing

MVP:

- selected element의 attribute name/value 표시
- value 수정 후 Enter 또는 Save 클릭 시 `DOM.setAttributeValue`
- 삭제 버튼 클릭 시 `DOM.removeAttribute`
- 변경 성공 후 local DOM state 갱신
- 실패 시 오류 표시

### 11.9 StylesPane

MVP:

- `CSS.getMatchedStylesForNode` 결과를 읽기 전용으로 표시
- `CSS.getComputedStyleForNode` 결과를 읽기 전용으로 표시
- style editing은 후속 단계로 분리

표시 우선순위:

```txt
1. inlineStyle
2. attributesStyle
3. matchedCSSRules
4. inherited
5. computedStyle
```

## 12. URL Policy

`src/background/url-policy.ts`에 구현한다.

```ts
export function isAllowedDebugUrl(url: string, settings: Settings): UrlPolicyResult {
  // localhost, 127.0.0.1, ::1은 기본 허용
  // settings.allowedPatterns와 매칭되면 허용
  // blocked keyword 포함 시 기본 차단
}
```

동작:

- 차단 URL에서는 Attach 버튼 disabled
- 사용자가 override하도록 만들지 않는다. MVP에서는 차단이면 차단
- 허용 도메인 추가 UI는 후속 기능으로 구현 가능

## 13. 오류 처리

사용자에게 다음 오류를 명확히 보여준다.

```txt
- 이 URL은 기본 정책상 attach할 수 없습니다.
- chrome.debugger.attach에 실패했습니다.
- 이미 다른 디버거가 이 탭에 붙어 있습니다.
- 대상 탭이 닫혔습니다.
- 페이지가 이동하여 권한이 만료되었습니다.
- CDP command가 실패했습니다.
- 이 노드는 더 이상 존재하지 않습니다.
```

background 로그에는 원본 error를 남기되, UI에는 민감 정보가 과도하게 노출되지 않도록 한다.

## 14. Build 설정

### 14.1 package.json script

```json
{
  "scripts": {
    "dev": "vite --mode development",
    "build": "tsc && vite build",
    "watch": "vite build --watch",
    "typecheck": "tsc --noEmit"
  }
}
```

### 14.2 Vite output

빌드 결과는 `dist/`에 생성한다.

필수 파일:

```txt
dist/
├─ manifest.json
├─ service-worker.js
├─ sidepanel.html
├─ assets/
└─ icons/
```

## 15. Codex 작업 순서

### Phase 1: Skeleton

1. Vite + React + TypeScript 프로젝트 생성
2. Manifest V3 설정
3. side panel 기본 화면 구현
4. toolbar icon 클릭 시 side panel 열기 설정
5. active tab URL 표시

완료 조건:

- `npm run build` 성공
- `chrome://extensions`에서 unpacked extension 로드 가능
- extension icon 클릭 시 side panel 열림
- 현재 탭 URL 표시됨

### Phase 2: Debugger attach PoC

1. background service worker에서 `chrome.debugger.attach` 구현
2. Attach / Detach 버튼 구현
3. attach 성공 시 Runtime / Console / Log enable
4. 상태 UI 표시
5. detach 처리

완료 조건:

- localhost 탭에서 attach 성공
- detach 성공
- attach 실패 메시지 표시
- DevTools 창 없이 side panel이 유지됨

### Phase 3: Console MVP

1. `Runtime.consoleAPICalled` 수집
2. `Runtime.exceptionThrown` 수집
3. `Log.entryAdded` 수집
4. `Runtime.evaluate` 구현
5. `Runtime.getProperties` 구현
6. ObjectPreview 구현
7. Clear / Export 구현

완료 조건:

- 페이지에서 `console.log('hello')` 실행 시 side panel에 표시
- Console 입력창에서 `1 + 1` 실행 시 `2` 표시
- 객체 결과를 펼쳐 property 확인 가능
- exception이 error entry로 표시

### Phase 4: Elements MVP

1. `DOM.getDocument` 구현
2. DOM tree 렌더링
3. node expand 시 `DOM.requestChildNodes`
4. DOM mutation event 반영
5. hover highlight 구현
6. selected node attributes 표시
7. attribute edit / remove 구현
8. matched styles / computed styles 읽기 전용 표시

완료 조건:

- DOM tree가 표시됨
- node expand 가능
- hover 시 페이지에서 node highlight됨
- attribute 수정이 실제 페이지에 반영됨
- selected node의 CSS 정보가 표시됨

### Phase 5: Hardening

1. URL policy 적용
2. blocked URL attach 비활성화
3. tab close / navigation 처리
4. service worker 재시작 시 상태 복구
5. Runtime object release 처리
6. README 작성
7. 수동 테스트 체크리스트 작성

완료 조건:

- 민감 URL에서 attach 불가
- 탭 이동 시 detach 또는 상태 재확인
- 오류 메시지가 사용자에게 명확히 보임
- README만 보고 설치/테스트 가능

## 16. Manual Test Plan

### 16.1 기본 설치

```txt
1. npm install
2. npm run build
3. chrome://extensions 접속
4. Developer mode 활성화
5. Load unpacked 클릭
6. dist 폴더 선택
```

### 16.2 Console 테스트 페이지

`http://localhost:3000`에서 다음 코드를 테스트한다.

```js
console.log('hello');
console.info({ user: 'dev', count: 3 });
console.warn('warning');
console.error(new Error('boom'));
setTimeout(() => { throw new Error('async error'); }, 1000);
```

검증:

```txt
- 로그 레벨별 표시
- object preview 표시
- exception 표시
- stack trace 일부 표시
```

### 16.3 Evaluate 테스트

Console input에서 실행한다.

```js
1 + 1
```

```js
({ a: 1, b: { c: 2 } })
```

```js
await Promise.resolve('ok')
```

검증:

```txt
- primitive 결과 표시
- object expand 가능
- promise 결과 표시
```

### 16.4 Elements 테스트

테스트 HTML:

```html
<div id="app">
  <button class="primary" data-test="btn">Click</button>
  <p>Hello <strong>world</strong></p>
</div>
```

검증:

```txt
- #document 표시
- html/body/div/button tree 표시
- node hover highlight
- data-test attribute 수정 가능
- matched styles 표시
- computed styles 표시
```

## 17. README 필수 내용

README에는 다음을 포함한다.

```txt
- 이 도구의 목적
- DevTools 완전 대체가 아님
- ASTx를 종료하거나 우회하지 않음
- Chrome 공식 Extension API만 사용
- debugger 권한 설명
- 기본 허용 URL 설명
- 설치 방법
- 사용 방법
- 제한사항
- 문제 해결
```

## 18. 알려진 제한사항

- Chrome DevTools와 동일한 Console 렌더링을 제공하지 않는다.
- iframe / worker context는 MVP에서 제한적으로만 동작한다.
- CSS cascade 계산은 Chrome DevTools와 다를 수 있다.
- DOM이 매우 큰 페이지에서는 성능 문제가 있을 수 있다.
- ASTx가 `chrome.debugger` attach 자체를 차단하는 환경에서는 동작하지 않을 수 있다.
- 실제 Chrome DevTools가 같은 탭에 붙으면 debugger 세션이 detach될 수 있다.

## 19. 후속 기능 후보

우선순위 순서:

```txt
1. Console autocomplete
2. iframe execution context selector
3. Element picker
4. Styles edit
5. Pseudo-class toggle
6. Box model view
7. Network read-only log
8. Search DOM
9. Copy selector / XPath
10. Persist settings UI
```

## 20. Codex에게 줄 최종 지시문

다음 지시문을 Codex에 그대로 전달한다.

```txt
Build a Chrome Manifest V3 extension named Lite Inspector.

Goal:
Create a developer-only replacement for the core Console and Elements workflows when the native Chrome DevTools window cannot be used. Do not implement anything that disables, bypasses, detects, or interferes with security software. Use only official Chrome Extension APIs and Chrome DevTools Protocol access through chrome.debugger.

Architecture:
- Use a Chrome side panel, not devtools_page.
- Use a MV3 background service worker as the single owner of chrome.debugger sessions.
- The React side panel must communicate with the background worker through chrome.runtime messages.
- Default allowed URLs are localhost, 127.0.0.1, and ::1 only.
- Block attach on sensitive-looking URLs by default.

MVP features:
1. Side panel UI with Attach/Detach and active tab URL.
2. Console tab:
   - collect Runtime.consoleAPICalled
   - collect Runtime.exceptionThrown
   - collect Log.entryAdded
   - evaluate user-entered JS through Runtime.evaluate
   - display primitive results and object previews
   - expand objects through Runtime.getProperties
   - clear and export logs
3. Elements tab:
   - load DOM tree through DOM.getDocument
   - lazy-load children with DOM.requestChildNodes
   - update tree from DOM mutation events
   - highlight node on hover
   - show and edit attributes
   - show matched and computed CSS read-only

Implementation requirements:
- TypeScript strict mode.
- React UI.
- No remotely hosted code.
- No automatic evaluation of JavaScript without explicit user action.
- Robust attach/detach cleanup.
- Friendly error messages.
- README with install, usage, limitations, and security notes.

Deliver in phases:
Phase 1: skeleton side panel.
Phase 2: debugger attach PoC.
Phase 3: Console MVP.
Phase 4: Elements MVP.
Phase 5: hardening and README.

Acceptance:
- npm run build succeeds.
- Extension loads unpacked from dist.
- On http://localhost, attach succeeds without opening Chrome DevTools.
- console.log events appear in the side panel.
- Runtime.evaluate('1 + 1') returns 2.
- DOM tree appears in Elements.
- Hovering a DOM row highlights the page element.
- Editing an attribute updates the actual page.
```

