# Peerlab

> Serve your MVP straight from a browser tab over WebRTC and watch testers use it live — no deploy, no backend, no analytics SDK.

![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Runtime](https://img.shields.io/badge/runtime-browser%20only-blue)
![Build](https://img.shields.io/badge/build-none-brightgreen)

---

## Purpose

**Problem**: Testing a vibe-coded MVP with real people needs three tools today: a deploy/tunnel (Vercel preview, ngrok), a session-replay SDK (Hotjar, PostHog), and a call to watch them struggle. Each adds accounts, latency, and data leaving your machine.

**Solution**: Peerlab turns the host's browser tab into the server. Host picks a `dist/` folder, shares a link. Guests load the app through a service-worker-to-WebRTC tunnel. While they use it, rrweb events, console errors, and rage-clicks stream back to the host's live "mission control" panel.

**Scope**: Solo builders and small teams testing static-frontend MVPs (< 10 MB bundles) with 1–5 concurrent testers. Personal OSS project (`ejoliet/peerlab`), MIT.

---

## Architecture

```
 HOST TAB (host.html, any origin)          LOADER ORIGIN (GitHub Pages)
 ┌─────────────────────────────┐           ┌──────────────────────────────┐
 │ File System Access API      │  PeerJS   │ guest.html  ──┐              │
 │  └─ dist/ (re-read per req) │◄─────────►│   owns PeerJS │ postMessage  │
 │ Request handler + chunker   │  data     │   connection  │ + MessagePort│
 │ Mission control panel       │  channel  │ sw.js ◄───────┘              │
 │  └─ rrweb-player per guest  │           │  intercepts /app/<hostId>/*  │
 └─────────────────────────────┘           │ iframe: the MVP under test   │
                                           │  └─ rrweb record + console   │
                                           │     hook (injected)          │
                                           └──────────────────────────────┘
```

**Data flow**:

- Guest fetch → `sw.js` → `guest.html` (MessagePort) → data channel → host reads file → chunked reply → `Response`
- Guest iframe telemetry (rrweb events, console, errors, clicks) → `guest.html` → data channel → host panel

**Key components**:

| Component | Responsibility |
|-----------|---------------|
| `host.html` | Folder pick, PeerJS peer, request serving, chunking, mission control UI |
| `guest.html` | SW registration, PeerJS connection, SW↔channel relay, telemetry uplink |
| `sw.js` | Intercept `/app/<hostId>/*`, per-request MessagePort relay, timeout → 504 |
| `inject.js` | Injected into served HTML: rrweb record, console/error capture, click events |
| `protocol.js` | Shared message schemas + chunking constants (imported by host and guest) |

> 💡 The spike (PR #1, merged) proved the serving path end-to-end. Key finding preserved: the fetch event's client is the *iframe*, so `sw.js` must locate `guest.html` via `clients.matchAll({includeUncontrolled: true})`.

---

## Recommended Stack

| Layer | Chosen | Health | Why chosen | Rejected |
|-------|--------|--------|------------|----------|
| P2P transport | PeerJS 1.5.5 | latest npm publish 2025-06 | Spike-proven; battle-tested in Emmanuel's video/mesh tools | raw WebRTC (more code), smoke (own signaling stack, heavier dep) |
| Session replay | rrweb 2.x | 2.1.0 published 2026-06, active | De-facto standard; OpenReplay and Highlight both build on it — strongest adoption signal | OpenReplay tracker (backend-coupled), custom DOM diffing (rebuild rrweb badly) |
| File access | File System Access API | Chrome/Edge native | Live re-read per request; `..` traversal rejected by API | drag-drop FileList (no live re-read) |
| Signaling | Public PeerServer | best-effort | Zero setup for v1 | Self-hosted PeerServer (v2, fixes flakiness) |
| Build | None — vanilla JS, CDN scripts | — | Single-file discipline; no toolchain | Vite/bundler (violates project ethos) |

> ⚠️ Host requires Chromium (File System Access API). Guests: any modern browser with SW support.

---

## Repository Layout

```
peerlab/
├── host.html            # Host app (single file, self-contained UI)
├── guest.html           # Guest loader (deployed to GitHub Pages)
├── sw.js                # Service worker (same origin as guest.html)
├── inject.js            # Telemetry payload injected into served HTML
├── protocol.js          # Message schemas, chunk size, path helpers
├── testsite/            # Demo MVP for manual + e2e testing (from spike)
├── test/
│   └── e2e.mjs          # Headless Chrome e2e (puppeteer-core, OPFS-stubbed picker)
├── PLAN.md              # Spike plan + result (historical)
├── LICENSE              # MIT
└── README.md            # This file
```

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Chrome / Edge (host) | current | File System Access API |
| Any SW-capable browser (guest) | current | Chrome, Firefox, Safari 16.4+ |
| Node.js | 20+ | e2e tests only, not runtime |
| GitHub Pages | — | Hosts `guest.html`, `sw.js`, `inject.js`, `protocol.js` |

No env vars. No secrets. No accounts.

---

## Quick Start

```bash
# Development (two local origins to simulate host/loader split)
git clone https://github.com/ejoliet/peerlab.git && cd peerlab
python3 -m http.server 8001 &   # serves host.html
python3 -m http.server 8002 &   # simulates the loader origin
```

1. Open `http://localhost:8001/host.html`, pick your MVP's `dist/` folder.
2. Copy the guest URL, open it in another browser/profile.
3. Guest renders the app; host panel shows the live session.

**Production**: `guest.html` + `sw.js` + `inject.js` + `protocol.js` live on GitHub Pages; `host.html` can run from anywhere, including `file://` is NOT supported (PeerJS needs http/https) — use Pages too.

---

## Interface Contract

### URL scheme

| URL | Meaning |
|-----|---------|
| `<pages>/guest.html?host=<peerId>` | Guest entry point |
| `<pages>/app/<peerId>/<path>` | SW-served MVP resource, scoped per host |

### Data channel messages (host ⇄ guest)

```js
// guest -> host: request
{ kind: "req", id: string, path: string }

// host -> guest: small reply (body <= CHUNK_SIZE = 200 KiB)
{ kind: "res", id, status: number, mimeType: string, body: ArrayBuffer }

// host -> guest: chunked reply header, then ordered parts
{ kind: "res", id, chunked: true, total: number, status, mimeType }
{ kind: "part", id, seq: number, data: ArrayBuffer }

// guest -> host: telemetry (batched, <= 1 msg / 500 ms)
{ kind: "rrweb",   events: object[] }
{ kind: "console", entries: [{ level, args: string[], ts }] }
{ kind: "error",   message, source, line, col, stack, ts }
```

### SW ⇄ page relay

`sw.js` posts `{id, path}` + a dedicated `MessagePort` per request to the `guest.html` window client whose `?host=` matches the path's `<peerId>` segment. Reply arrives on the port as `{status, mimeType, body}` (body transferred).

### Serving rules (host side)

| Rule | Behavior |
|------|----------|
| `/` or trailing `/` | append `index.html` |
| Missing file | 404, `text/plain` body |
| MIME | extension table incl. `html css js mjs json png jpg jpeg webp svg ico gif woff woff2 ttf mp4 webm txt map wasm`; default `application/octet-stream` |
| HTML responses | inject `<script src=".../inject.js">` + `<base href="/app/<peerId>/">` before send |
| Re-read | from disk every request — host edits visible on guest reload |

---

## Design Decisions

### D1 — Multi-session routing (spike issue #1)

All paths scoped as `/app/<peerId>/…`. `sw.js` extracts `<peerId>` and routes to the `guest.html` client with the matching `?host=` param. Two guest tabs to different hosts on the same loader origin no longer collide.

### D2 — Origin isolation (spike issue #2)

All MVPs share the loader origin, so their `localStorage`/cookies collide across projects. **v1 accepts this and documents it**: injected banner in `inject.js` warns "storage is shared and ephemeral." Real isolation (per-host storage prefixing or sandboxed iframes) is v2.

### D3 — Absolute-path escapes (spike issue #3)

Injected `<base href="/app/<peerId>/">` fixes relative links. SPAs that hard-navigate to absolute `/routes` will 404 — the SW returns a friendly error page explaining the limitation. Full rewrite of absolute URLs is out of scope (fragile).

### D4 — Backpressure (spike issue #4)

Chunk sender awaits `bufferedamountlow` when `dataChannel.bufferedAmount > 1 MiB` before sending the next part.

### D5 — Reconnect

Reuse the auto-reconnect pattern from the P2P video tool: guest retries `peer.connect` with capped exponential backoff (1 s → 30 s); pending SW requests fail 504 and the app surface shows a reconnect overlay.

---

## Mission Control (host panel)

One card per connected guest:

| Element | Source |
|---------|--------|
| Live DOM replay | `rrweb-player` fed by `kind:"rrweb"` batches |
| Console tail | last 50 `kind:"console"` entries, errors pinned |
| Rage-click badge | ≥ 3 clicks < 700 ms apart within 30 px radius |
| Request log | served paths + status + bytes |

Sessions are in-memory only; optional "Export session" button downloads rrweb events + console log as one JSON file.

---

## Error Handling

| Condition | Where | Behavior |
|-----------|-------|----------|
| Host reply timeout (10 s) | sw.js | 504; guest page cleans its `pending` entry (spike issue #5) |
| No guest.html client found | sw.js | 502 with explanation page |
| Data channel closed mid-request | guest.html | fail all pending with 502, trigger reconnect (D5) |
| File read error / missing | host.html | 404 |
| PeerJS/signaling error | both | status banner; retry per D5 |

---

## Testing

```bash
npm i puppeteer-core   # test-only dep
node test/e2e.mjs      # requires the two http.server processes from Quick Start
```

| Suite | Covers |
|-------|--------|
| `test/e2e.mjs` (extend spike version) | 5 spike criteria + D1 (two hosts, two guest tabs) + telemetry round-trip (one rrweb batch reaches host) + backpressure (5 MB file) |

> ⚠️ e2e uses the public PeerServer — flaky failures are signaling, not code. Retry once before investigating.

---

## Non-Goals (v1)

- TURN relay / hard-NAT traversal — document "both peers behind symmetric NAT = won't connect"; v2
- VPS headless host (persistent links while laptop sleeps) — v2, monetization hook
- Multiple simultaneous hosts per host tab, mesh serving — out of scope
- Storage isolation between MVPs (see D2) — v2
- Auth/access control on the share link — link possession = access, like a preview URL
- Compression, caching, streaming responses — whole-file in memory is fine < 10 MB
- Backend of any kind

---

## Open Questions

- [ ] **Q1**: Inject rrweb via CDN `<script>` in `inject.js`, or vendor a pinned copy on the loader origin? Vendoring avoids CDN drift breaking replays. — owner: ejoliet
- [ ] **Q2**: Should `inject.js` capture `fetch`/XHR the MVP makes to *external* APIs (network tab equivalent)? Valuable, but privacy-sensitive. Default off? — owner: ejoliet
- [ ] **Q3**: rrweb-player on host: CDN or vendored, and does 2.x player pair with 2.x recorder without a build step? Verify before Phase 3. — owner: ejoliet

---

## Agent Build Instructions

> Implement end-to-end using only this README plus the merged spike code as reference. Resolve Open Questions first.

### Build Order

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| 0 | Refactor spike: extract `protocol.js`, path scheme `/app/<peerId>/`, MIME table, `<base>` + `inject.js` stub injection | Spike's 5 criteria still pass via updated `e2e.mjs` |
| 1 | D1 routing + D4 backpressure + D5 reconnect + 504 `pending` cleanup | e2e: two-host test + 5 MB file test pass |
| 2 | `inject.js` telemetry uplink (rrweb, console, errors, clicks) with 500 ms batching | Host receives all four kinds in e2e |
| 3 | Mission control panel (replay, console tail, rage-click, request log, export) | Manual demo with `testsite/`; export JSON validates |
| 4 | GitHub Pages deploy + README Quick Start verified on clean machine | Guest link works from a second physical machine |

### Constraints

- Vanilla JS only; no build step; CDN scripts pinned to exact versions
- Runtime files stay ≤ 5 (host.html, guest.html, sw.js, inject.js, protocol.js)
- `AIDEV-` comments on every non-obvious mechanism (SW relay, chunking, backpressure, client matching)
- No secrets, no analytics, no network calls except PeerJS signaling and pinned CDNs
- Never break the spike's 5 criteria — they are the regression floor

### Acceptance Criteria

- [ ] `node test/e2e.mjs` passes all suites twice consecutively
- [ ] Quick Start works on a clean machine with two browsers
- [ ] Rage-click badge fires when demoed manually
- [ ] Session export replays in a standalone rrweb-player page
- [ ] All Open Questions resolved or moved to v2
- [ ] No `TODO`/`FIXME` in runtime files

---

## Next Steps

1. [ ] Resolve Q1–Q3 (one evening of checks, no code)
2. [ ] Agent Phase 0 (refactor spike under new path scheme)
3. [ ] Agent Phase 1 (routing, backpressure, reconnect)
4. [ ] Agent Phase 2 (telemetry uplink)
5. [ ] Agent Phase 3 (mission control)
6. [ ] Agent Phase 4 (Pages deploy) + human smoke test with a real MVP
7. [ ] First real user test: share link in Slack, watch 3 people break something

---

## References

- Spike PR: https://github.com/ejoliet/peerlab/pull/1 (merged; PLAN.md has the SW client-matching finding)
- rrweb: https://github.com/rrweb-io/rrweb (2.1.0, 2026-06)
- PeerJS: https://github.com/peers/peerjs (1.5.5)
- Prior art map: tabserve.dev (different arch, name conflict resolved), sinclairzx81/smoke, servefolder.dev, planktos
