// Service worker: intercepts /app/* fetches and relays them to the host
// over the guest page's PeerJS data channel.

const TIMEOUT_MS = 10000;
let nextId = 0;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;
  event.respondWith(handle(url));
});

// AIDEV-NOTE: SW <-> page relay. The fetch event's clientId is the *iframe*
// showing the site, but the PeerJS connection lives in the guest.html window,
// so we look that client up explicitly. includeUncontrolled matters: on the
// very first load guest.html itself is not yet controlled by this SW.
async function findGuestClient() {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return all.find((c) => new URL(c.url).pathname.endsWith('/guest.html'));
}

async function handle(url) {
  const path = url.pathname.slice('/app'.length) || '/';
  const client = await findGuestClient();
  if (!client) {
    return new Response('guest.html page not found', { status: 502 });
  }

  const id = Date.now() + '-' + nextId++;
  // AIDEV-NOTE: a dedicated MessagePort per request means the reply routes
  // itself back here; the id is only needed for page <-> host correlation.
  const channel = new MessageChannel();
  const reply = new Promise((resolve) => {
    channel.port1.onmessage = (e) => resolve(e.data);
  });
  client.postMessage({ id, path }, [channel.port2]);

  const result = await Promise.race([
    reply,
    new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]);
  if (!result) {
    return new Response('Gateway timeout waiting for host', { status: 504 });
  }
  return new Response(result.body, {
    status: result.status,
    headers: { 'Content-Type': result.mimeType },
  });
}
