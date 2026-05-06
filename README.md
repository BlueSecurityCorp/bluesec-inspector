# BlueSec Inspector

[English README](README.en.md)

**BlueSec Inspector**는 보안 연구원과 웹 개발자를 위한 Chrome MV3 확장 도구입니다. Chrome DevTools 창을 직접 열기 어려운 제한된 개발 환경에서, Chrome 공식 `chrome.debugger` API와 Chrome DevTools Protocol(CDP)을 사용해 Console과 Elements 중심의 경량 인스펙터를 제공합니다.

이 프로젝트는 **Chrome DevTools 대체 도구**, **Chrome extension inspector**, **CDP console tool**, **DOM inspector**, **security research browser tool**을 찾는 사용자를 위한 개발/연구용 도구입니다.

BlueSec Inspector는 ASTx 또는 기타 보안 프로그램을 비활성화, 우회, 탐지, 종료하거나 간섭하지 않습니다. 원격 코드를 로드하지 않으며, 사용자가 명시적으로 입력한 JavaScript expression만 실행합니다.

## 주요 기능

- Chrome Manifest V3 기반 확장 도구
- Chrome side panel 및 별도 popup window UI
- `chrome.debugger` 기반 active tab attach / detach
- Chrome DevTools Protocol(CDP) Runtime, Console, Log, DOM, CSS, Overlay 도메인 사용
- 기본 URL 허용 목록:
  - `http://localhost/*`
  - `http://127.0.0.1/*`
  - `http://[::1]/*`
- `Allow current origin`을 통한 개발/staging origin 명시 허용
- 민감해 보이는 URL은 attach 전에 키워드 기반으로 차단
- Console tab:
  - `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug`
  - uncaught exception 수집
  - browser log entry 수집
  - 명시적 JavaScript expression 실행
  - object preview 및 property expansion
  - 명령어 history navigation
  - 기본 자동완성
  - clear 및 JSON export
- Elements tab:
  - `DOM.getDocument` 기반 DOM tree 로드
  - `DOM.requestChildNodes` 기반 lazy child loading
  - `Overlay.highlightNode` 기반 node hover highlight
  - selected element attribute 표시
  - attribute 수정 및 제거
  - matched / computed CSS 읽기 전용 표시

## 설치

```bash
npm install
npm run build
```

Chrome에서 `chrome://extensions`를 열고 Developer mode를 켠 뒤, "Load unpacked"를 선택하고 `dist` 폴더를 지정합니다.

## 사용법

1. `http://localhost:3000` 같은 로컬 개발 페이지를 열거나, 검사하려는 개발/staging origin을 엽니다.
2. BlueSec Inspector 확장 아이콘을 클릭합니다.
3. Chrome side panel이 열립니다.
4. origin이 아직 허용되지 않았다면 `Allow current origin`을 클릭하고 Chrome 권한 프롬프트를 승인합니다.
5. `Attach`를 클릭합니다.
6. Console 또는 Elements 탭을 사용합니다.
7. 별도 창이 필요하면 `Open Window`를 클릭합니다.
8. 작업이 끝나면 `Detach`를 클릭합니다.

JavaScript는 Console 입력창에서 사용자가 명시적으로 expression을 제출할 때만 실행됩니다. Attach 직후 자동으로 JavaScript를 평가하지 않습니다.

## 보안 메모

`debugger` 권한은 attach된 탭을 Chrome DevTools Protocol로 검사하고 제어할 수 있는 강력한 권한입니다. BlueSec Inspector는 기본 host permission을 로컬 개발 URL로 제한합니다. 다른 origin은 사용자가 `Allow current origin`을 명시적으로 누르고 Chrome 권한을 승인해야 합니다.

아래 키워드가 포함된 URL에서는 attach가 차단됩니다.

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

이 키워드 차단은 보조 안전장치이며 보안 제품이 아닙니다.

## 제한 사항

- Chrome DevTools의 완전한 대체품이 아닙니다.
- Sources, breakpoint, Network, Performance, Application, Lighthouse는 범위 밖입니다.
- iframe, worker, OOPIF, shadow DOM 처리는 제한적입니다.
- CSS cascade 세부 정보는 Chrome DevTools UI와 다를 수 있습니다.
- 같은 탭에 Chrome DevTools가 이미 attach되어 있으면 Chrome이 이 세션을 detach할 수 있습니다.
- 로컬 보안 제품이 `chrome.debugger` attach 자체를 차단하는 경우 이 확장은 우회하지 못합니다.

## 수동 테스트

localhost 페이지에서 attach 후 아래 코드를 실행합니다.

```js
console.log('hello');
console.info({ user: 'dev', count: 3 });
console.warn('warning');
console.error(new Error('boom'));
setTimeout(() => { throw new Error('async error'); }, 1000);
```

BlueSec Inspector Console 입력창에서:

```js
1 + 1
```

```js
({ a: 1, b: { c: 2 } })
```

Elements 테스트에는 아래 HTML이 있는 페이지를 사용합니다.

```html
<div id="app">
  <button class="primary" data-test="btn">Click</button>
  <p>Hello <strong>world</strong></p>
</div>
```

DOM tree가 표시되는지, hover 시 페이지 element가 highlight되는지, `data-test` attribute 수정이 실제 페이지에 반영되는지 확인합니다.

## 문제 해결

- `This origin is not allowed yet.`: `Allow current origin`을 클릭하고 Chrome 프롬프트를 승인한 뒤 `Attach`를 클릭합니다.
- `Another debugger is already attached to this tab.`: 기본 DevTools를 닫거나 다른 debugger를 detach합니다.
- `The target tab is no longer available.`: BlueSec Inspector에서 활성 탭을 새로고침합니다.
- DOM tree가 비어 있음: 먼저 attach한 뒤 `Reload DOM`을 클릭합니다.

## 검색 키워드

Chrome extension, Manifest V3, Chrome DevTools Protocol, CDP, chrome.debugger, DevTools alternative, Console inspector, DOM inspector, Elements panel, browser security, security research, BlueSecurity.
