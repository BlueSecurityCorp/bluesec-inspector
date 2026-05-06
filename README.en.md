# BlueSec Inspector

[한국어 문서](README.md)

**BlueSec Inspector** is a Chrome MV3 extension for security researchers and web developers. It provides lightweight Console and Elements workflows for regular `http/https` web pages through the official Chrome `chrome.debugger` API and Chrome DevTools Protocol (CDP) when opening the native Chrome DevTools window is not practical in a restricted development environment.

This project is intended for users looking for a **Chrome DevTools alternative**, **Chrome extension inspector**, **CDP console tool**, **DOM inspector**, or **security research browser tool**.

BlueSec Inspector does not disable, bypass, detect, terminate, or interfere with ASTx or any other security software. It does not load remote code and only runs JavaScript expressions explicitly submitted by the user.

## Features

- Chrome Manifest V3 extension
- Chrome side panel and detached popup window UI
- Active tab attach / detach through `chrome.debugger`
- `http://*/*` and `https://*/*` host permissions for regular website attach support
- Chrome DevTools Protocol (CDP) Runtime, Console, Log, DOM, CSS, and Overlay domains
- Attach support for regular `http://` and `https://` web pages
- Chrome internal pages, extension pages, `file://`, and other non-web URLs are restricted
- Console tab:
  - `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug`
  - uncaught exceptions
  - browser log entries
  - explicit JavaScript expression evaluation
  - object preview and property expansion
  - command history navigation
  - basic autocomplete
  - clear and JSON export
- Elements tab:
  - DOM tree loading through `DOM.getDocument`
  - lazy child loading through `DOM.requestChildNodes`
  - node hover highlight through `Overlay.highlightNode`
  - selected element attributes
  - attribute edit and remove
  - read-only matched and computed CSS display

## Install

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose "Load unpacked", and select the `dist` folder.

## Usage

1. Open the `http://` or `https://` page you want to inspect.
2. Click the BlueSec Inspector extension icon.
3. The Chrome side panel opens.
4. Click `Attach`.
5. Use the Console or Elements tab.
6. Click `Open Window` if you want a detached inspector window.
7. Click `Detach` when finished.

JavaScript only runs when you explicitly submit an expression in the Console input. The extension does not evaluate JavaScript automatically after attach.

## Security Notes

The `debugger` permission is powerful because it can inspect and control the attached tab through the Chrome DevTools Protocol. BlueSec Inspector attaches a debugger session only after the user explicitly clicks `Attach`.

The extension requests host permissions for regular `http/https` websites so it can attach across normal web pages. The tool runs locally in the user's browser and does not send collected console logs or DOM data to an external server. It may not work on pages where Chrome restricts debugger attach, such as Chrome internal pages, Chrome Web Store pages, or extension pages.

## Limitations

- It is not a full Chrome DevTools replacement.
- Sources, breakpoints, Network, Performance, Application, and Lighthouse are out of scope.
- iframe, worker, OOPIF, and shadow DOM handling is limited.
- CSS cascade details may not match the native DevTools UI.
- If Chrome DevTools is already attached to the same tab, Chrome may detach this session.
- If Chrome or a local security product blocks `chrome.debugger` attach itself, the extension cannot work around that.

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

- `Only http and https pages can be inspected.`: run it on a regular web page instead of a Chrome internal or `file://` page.
- `Another debugger is already attached to this tab.`: close native DevTools or detach the other debugger.
- `The target tab is no longer available.`: refresh the active tab in BlueSec Inspector.
- DOM tree is empty: attach first, then click `Reload DOM`.

## Keywords

Chrome extension, Manifest V3, Chrome DevTools Protocol, CDP, chrome.debugger, DevTools alternative, Console inspector, DOM inspector, Elements panel, browser security, security research, BlueSecurity.
