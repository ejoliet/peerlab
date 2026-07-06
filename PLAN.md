# Plan: WebRTC folder-serving spike

1. `host.html`: "Pick folder" button (`showDirectoryPicker`), create a PeerJS peer, show the peer ID and a copyable `guest.html?host=<peerId>` URL.
2. Host answers `{id, path}` data-channel messages: walk directory handles, re-read the file on every request (no caching), reply `{id, status, mimeType, body}` with an ArrayBuffer body.
3. Map `/` to `/index.html`; derive mimeType from an extension table (html/css/js/json/png/jpg/svg/ico/wasm, default `application/octet-stream`); any lookup failure replies 404 with a text body.
4. Bodies > 200KB are chunked: a `{id, chunked, total, status, mimeType}` header message followed by `{id, seq, data}` parts (PeerJS message size limits).
5. `guest.html`: read `?host=`, register `sw.js`, await `serviceWorker.ready`, open the PeerJS connection, then point an iframe at `/app/index.html`; show connection state while waiting.
6. `guest.html` owns the PeerJS connection (a SW cannot); it relays SW requests to the host, reassembles chunks, and replies to the SW over a per-request MessagePort.
7. `sw.js`: intercept only same-origin `/app/*` fetches, strip the `/app` prefix, find the `guest.html` window client via `clients.matchAll({includeUncontrolled: true})`, and `postMessage({id, path})` with a transferred MessagePort.
8. `sw.js`: race the port reply against a 10s timeout; reply becomes `Response(body, {status, headers: {Content-Type: mimeType}})`, timeout becomes a 504.
9. `testsite/`: `index.html` + `style.css` + `app.js` + `logo.png` (png intentionally > 200KB so success criterion 1 also exercises chunking).
10. Verify all 5 success criteria with guest files on one port and host.html on another (`python3 -m http.server`); `test/e2e.mjs` automates this headlessly by stubbing `showDirectoryPicker` with an OPFS-backed directory handle.

## Result

All 5 success criteria verified headlessly (Chrome, host on :8001, guest on :8002, real public PeerServer signaling): styled+interactive render including a 480KB chunked png, all `/app/*` responses served by the SW, host-side `style.css` edit visible after guest reload without re-picking, real 404 for a missing file, cross-origin host/guest. The SW↔page relay needed no workarounds; the one subtlety is that the SW must use `clients.matchAll({includeUncontrolled: true})` to find guest.html, because on first load that page is not yet controlled by the SW. Rerun with `node test/e2e.mjs` (needs `puppeteer-core` and Chrome; the two static servers are started by hand as above).
