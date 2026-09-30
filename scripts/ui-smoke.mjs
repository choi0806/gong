import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), base = 'http://127.0.0.1:3138';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, socket; const pending = new Map(); let seq = 0; const errors = [];
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3138'], { cwd: root, windowsHide: true, stdio: 'pipe' });
let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
async function poll(check, timeout = 60000) { const start = Date.now(); while (Date.now() - start < timeout) { try { if (await check()) return; } catch {} await delay(250); } throw new Error('Timed out: ' + log.slice(-1000)); }
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 60000); pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; }
async function screenshot(name) {
  await evaluate('document.fonts.ready.then(() => true)');
  const dimensions = await evaluate('({ width: innerWidth, scroll: document.documentElement.scrollWidth })');
  assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(`artifacts/${name}.png`, Buffer.from(shot.data, 'base64'));
}
try {
  await mkdir('artifacts', { recursive: true });
  await poll(async () => (await fetch(base)).ok);
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9338', `--user-data-dir=${path.join(root, 'artifacts', 'chrome-smoke-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let target;
  await poll(async () => { const tabs = await (await fetch('http://127.0.0.1:9338/json')).json(); target = tabs.find(tab => tab.type === 'page'); return !!target; });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); } if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base });
  await poll(() => evaluate('!!document.querySelector("#resume-files")'));
  await screenshot('gemini-home-desktop');
  // Capture POST bodies while retaining the real backend/network path.
  await evaluate('window.searchRequests = []; window.searchResponses = []; const originalFetch = window.fetch; window.fetch = async function(input, init) { const matches = String(input).includes("/api/matches"); if (matches) window.searchRequests.push(JSON.parse(init.body)); const response = await originalFetch.apply(this, arguments); if (matches) { const data = await response.clone().json(); window.searchResponses.push({ status: response.status, count: data.jobs?.length, sources: data.sources, cached: data.cached }); } return response; }');
  const doc = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#resume-files' });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path.join(root, 'artifacts', 'resume-korean.txt')] });
  await poll(() => evaluate('!!document.querySelector(".file-row")'));
  await evaluate('document.querySelector(".find-button").click()');
  await poll(() => evaluate('!!document.querySelector(".job-card")'), 60000);
  assert.ok(await evaluate('document.querySelector(".job-dates").textContent.includes("등록")'));
  assert.ok(await evaluate('!!document.querySelector(".fit-badge strong") && !!document.querySelector(".fit-summary")'), 'fit score and summary render');
  await screenshot('fit-results-desktop');
  await evaluate('document.querySelector("button.fit-badge").click()');
  await poll(() => evaluate('!!document.querySelector(".fit-explain .score-parts li")'));
  assert.equal(await evaluate('document.querySelectorAll(".fit-explain .score-parts li").length'), 6, 'six score parts');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('artifacts/fit-explain.png', Buffer.from(shot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate('document.querySelector(".modal-close, [aria-label=닫기]")?.click() || document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
  await poll(() => evaluate('!document.querySelector(".fit-explain")'));
  // Filters are drafts: changing several must not search until the apply button is pressed.
  await evaluate('Array.from(document.querySelectorAll(".filter-chips button")).find(button => button.textContent === "인턴").click()');
  await evaluate(`const period = document.querySelector('select[aria-label="등록 기간"]'); period.value = "7"; period.dispatchEvent(new Event("change", { bubbles: true }));`);
  await delay(500);
  assert.equal(await evaluate('window.searchRequests.length'), 1, 'filter changes alone must not search');
  await evaluate('document.querySelector(".filter-apply .primary-button").click()');
  await poll(() => evaluate('window.searchRequests.length === 2 && !document.querySelector(".search-progress")'), 60000);
  assert.equal(await evaluate('document.querySelector(".filter-chips [aria-pressed=true]").textContent'), '인턴');
  assert.ok(await evaluate('document.querySelector(".filter-apply .primary-button").disabled'), 'apply disabled once filters are applied');
  const requests = await evaluate('window.searchRequests');
  assert.equal(requests.at(-1).level, '인턴'); assert.equal(requests.at(-1).recentDays, 7);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('gemini-results-mobile');
  assert.deepEqual(errors, []);
  const responses = await evaluate('window.searchResponses');
  assert.ok(responses.every(response => response.status === 200));
  const report = { ok: true, requests, responses, screenshots: ['gemini-home-desktop.png', 'fit-results-desktop.png', 'gemini-results-mobile.png'], browserErrors: errors };
  await writeFile('artifacts/verification-browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { socket?.close(); chrome?.kill(); server.kill(); }
