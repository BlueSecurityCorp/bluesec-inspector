# BlueSec Inspector

BlueSec Inspector is a developer-only Chrome Manifest V3 extension by blue / BlueSecurity for basic Console and Elements workflows when the native Chrome DevTools window cannot be used.

It is not a full DevTools replacement. It does not disable, bypass, detect, terminate, or interfere with ASTx or any other security software. It uses only official Chrome Extension APIs and Chrome DevTools Protocol commands through `chrome.debugger`.

## Features

- Chrome side panel UI
- Attach and detach to the active tab through `chrome.debugger`
- Default URL allowlist limited to:
  - `http://localhost/*`
  - `http://127.0.0.1/*`
  - `http://[::1]/*`
- Additional development origins can be allowed from the side panel after an explicit Chrome permission prompt
- Sensitive-looking URLs are blocked by keyword before attach
- Console tab:
  - `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug`
  - uncaught exceptions
  - browser log entries
  - explicit JavaScript expression evaluation
  - object preview and property expansion
  - clear and JSON export
- Elements tab:
  - DOM tree loading through `DOM.getDocument`
  - lazy child loading through `DOM.requestChildNodes`
  - node hover highlight through `Overlay.highlightNode`
  - selected element attributes
  - attribute edit and remove
  - matched and computed CSS read-only display

## Install

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose "Load unpacked", and select the `dist` folder.

## Usage

1. Open a local development page such as `http://localhost:3000`, or open a development/staging origin you want to inspect.
2. Click the BlueSec Inspector extension icon.
3. The Chrome side panel opens.
4. If the origin is not allowed yet, click `Allow current origin` and approve Chrome's permission prompt.
5. Click `Attach`.
6. Use the Console or Elements tab.
7. Click `Detach` when finished.

JavaScript only runs when you explicitly submit an expression in the Console input. The extension does not evaluate JavaScript automatically after attach.

## Security Notes

The `debugger` permission is powerful because it can inspect and control the attached tab through the Chrome DevTools Protocol. BlueSec Inspector limits default host permissions to local development URLs. Other origins require an explicit `Allow current origin` action and Chrome permission approval. Attach is still blocked on URLs containing these keywords:

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

This keyword block is a guardrail, not a security product.

## Limitations

- Console rendering is intentionally simpler than Chrome DevTools.
- Sources, breakpoints, Network, Performance, Application, and Lighthouse are out of scope.
- iframe, worker, OOPIF, and shadow DOM handling is limited.
- CSS cascade details may not match the native DevTools UI.
- If Chrome DevTools is already attached to the same tab, Chrome may detach this session.
- If a local security product blocks `chrome.debugger` attach itself, the extension cannot work around that.

## Manual Test

On a localhost page, attach and run:

```js
console.log('hello');
console.info({ user: 'dev', count: 3 });
console.warn('warning');
console.error(new Error('boom'));
setTimeout(() => { throw new Error('async error'); }, 1000);
```

In the BlueSec Inspector Console input:

```js
1 + 1
```

```js
({ a: 1, b: { c: 2 } })
```

For Elements, use a page with:

```html
<div id="app">
  <button class="primary" data-test="btn">Click</button>
  <p>Hello <strong>world</strong></p>
</div>
```

Verify that the DOM tree appears, hover highlights page elements, and editing `data-test` updates the actual page.

## Troubleshooting

- `This origin is not allowed yet.`: click `Allow current origin`, approve Chrome's prompt, then click `Attach`.
- `Another debugger is already attached to this tab.`: close native DevTools or detach the other debugger.
- `The target tab is no longer available.`: refresh the active tab in BlueSec Inspector.
- DOM tree is empty: attach first, then click `Reload DOM`.
