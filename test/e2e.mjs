// Headless E2E for the WebRTC folder-serving spike.
// Serves /workspace on two ports (host origin 8001, guest origin 8002),
// stubs showDirectoryPicker on the host page with an OPFS directory handle
// (identical interface to a real picked directory), and checks all success
// criteria that can be automated.
import puppeteer from 'puppeteer-core';

const HOST_ORIGIN = 'http://localhost:8001';
const GUEST_ORIGIN = 'http://localhost:8002';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  // ---- Host page ----
  const host = await browser.newPage();
  host.on('console', (m) => console.log('[host]', m.text()));
  await host.evaluateOnNewDocument(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      for (const name of ['index.html', 'style.css', 'app.js', 'logo.png']) {
        const res = await fetch('/testsite/' + name);
        const buf = await res.arrayBuffer();
        const fh = await root.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(buf);
        await w.close();
      }
      return root;
    };
  });
  await host.goto(HOST_ORIGIN + '/host.html');
  await host.click('#pick');
  await host.waitForFunction(
    () => document.getElementById('guestUrl').value.includes('host='),
    { timeout: 30000 }
  );
  const peerId = await host.$eval('#peerId', (el) => el.textContent);
  console.log('host peer id:', peerId);

  // ---- Guest page (different origin) ----
  const guest = await browser.newPage();
  guest.on('console', (m) => console.log('[guest]', m.text()));
  const swResponses = [];
  guest.on('response', (r) => {
    if (r.fromServiceWorker()) swResponses.push(`${r.status()} ${r.url()}`);
  });
  await guest.goto(GUEST_ORIGIN + '/guest.html?host=' + encodeURIComponent(peerId));

  await guest.waitForFunction(() => {
    const f = document.getElementById('site');
    return f.contentDocument &&
      f.contentDocument.location.pathname === '/app/index.html' &&
      f.contentDocument.readyState === 'complete';
  }, { timeout: 60000 });
  // Give async subresources (img, script) a moment to settle.
  await guest.waitForFunction(() => {
    const d = document.getElementById('site').contentDocument;
    const img = d.querySelector('img');
    return img && img.complete;
  }, { timeout: 30000 });

  const frame = guest.frames().find((f) => f.url().includes('/app/index.html'));

  // Criterion 1: fully styled and interactive
  const h1 = await frame.$eval('h1', (el) => el.textContent);
  check('index.html rendered', h1 === 'Served over WebRTC', h1);

  const bg = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('style.css applied', bg === 'rgb(30, 42, 56)', bg);

  const msg = await frame.$eval('#message', (el) => el.textContent);
  check('app.js executed', msg === 'JavaScript is running.', msg);

  await frame.click('#counter');
  await frame.click('#counter');
  const btn = await frame.$eval('#counter', (el) => el.textContent);
  check('site is interactive (button clicks)', btn === 'Clicked 2 times', btn);

  const img = await frame.$eval('img', (el) => ({ ok: el.complete && el.naturalWidth > 0, w: el.naturalWidth }));
  check('logo.png (480KB, chunked) decoded', img.ok && img.w === 400, `naturalWidth=${img.w}`);

  // Criterion 2: responses actually came from the service worker
  const appFromSW = swResponses.filter((u) => u.includes('/app/'));
  check('requests answered by SW', appFromSW.length >= 4, appFromSW.join(', '));

  // Criterion 4: missing file -> real 404
  const missing = await frame.evaluate(async () => {
    const r = await fetch('/app/nope.txt');
    return { status: r.status, text: await r.text() };
  });
  check('missing file returns 404', missing.status === 404, JSON.stringify(missing));

  // Criterion 3: edit style.css on the host side, guest reload sees it
  await host.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('style.css');
    const w = await fh.createWritable();
    await w.write('body { background: rgb(200, 10, 10); }');
    await w.close();
  });
  await frame.evaluate(() => location.reload());
  await guest.waitForFunction(() => {
    const d = document.getElementById('site').contentDocument;
    return d && d.readyState === 'complete' &&
      getComputedStyle(d.body).backgroundColor === 'rgb(200, 10, 10)';
  }, { timeout: 30000 });
  check('host-side edit visible after guest reload (no re-pick)', true);

  // Criterion 5 is structural: guest served from :8002, host from :8001.
  check('cross-origin serving', GUEST_ORIGIN !== HOST_ORIGIN,
    `guest=${GUEST_ORIGIN} host=${HOST_ORIGIN}`);

  await guest.screenshot({ path: '/tmp/e2e/guest.png' });
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
