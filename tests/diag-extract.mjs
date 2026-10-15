// 诊断：为什么点击按钮后没有发出提取消息
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const SHOT = 'C:\\Users\\34566\\Downloads\\考核截图2';
const EXT_DIR = 'C:\\Users\\34566\\Documents\\deepseek-harness\\default-workspace\\imagegrab';
const URL_TEST = 'http://localhost:8765/mock-detail.html';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });
const pages = await browser.pages();
let page = pages.find((p) => p.url().includes('mock-detail'));
if (!page) {
  page = await browser.newPage();
}
await page.bringToFront();

// 打桩，同时记录错误
await page.evaluateOnNewDocument(() => {
  window.__captured = [];
  window.__errors = [];
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    sendMessage: (msg) => {
      try {
        window.__captured.push({ type: msg && msg.type, count: msg && msg.payload && msg.payload.images ? msg.payload.images.length : null });
      } catch (e) {
        window.__captured.push({ err: String(e) });
      }
      return Promise.resolve({ ok: true, count: 0 });
    },
    getURL: (p) => 'chrome-extension://stub/' + p,
    onMessage: { addListener: () => {} }
  };
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('REJECT: ' + String(e.reason)));
});

await page.reload({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2000));

const css = fs.readFileSync(EXT_DIR + '\\content.css', 'utf8');
const js = fs.readFileSync(EXT_DIR + '\\content.js', 'utf8');
await page.addStyleTag({ content: css });
await page.evaluate(js);
await new Promise((r) => setTimeout(r, 600));

// 在页面里直接探测提取能力（复现 content.js 的扫描逻辑）
const probe = await page.evaluate(() => {
  const urls = new Set();
  const toAbs = (raw) => {
    if (!raw) return null;
    let u = String(raw).trim().replace(/^url\((['"]?)(.*?)\1\)$/i, '$2').trim();
    if (!u || u.startsWith('data:') || u.startsWith('blob:')) return null;
    if (u.startsWith('//')) u = location.protocol + u;
    try {
      const a = new URL(u, location.href);
      return /^https?:$/.test(a.protocol) ? a.href : null;
    } catch { return null; }
  };
  for (const img of document.querySelectorAll('img')) {
    for (const attr of ['src', 'data-src', 'data-ks-lazyload', 'data-original']) {
      const v = toAbs(img.getAttribute(attr));
      if (v) urls.add(v);
    }
    const ss = img.getAttribute('srcset');
    if (ss) ss.split(',').forEach((p) => { const v = toAbs(p.trim().split(/\s+/)[0]); if (v) urls.add(v); });
  }
  for (const el of document.querySelectorAll('[style*="background"]')) {
    const bg = el.style.backgroundImage;
    if (bg) for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/gi)) { const v = toAbs(m[2]); if (v) urls.add(v); }
  }
  return {
    totalImgs: document.querySelectorAll('img').length,
    candidateCount: urls.size,
    sample: [...urls].slice(0, 3).map((u) => u.slice(0, 70)),
    hasButton: !!document.getElementById('imagegrab-btn')
  };
});
console.log('页面探测:', JSON.stringify(probe, null, 2));

// 点击并高频轮询状态
await page.click('#imagegrab-btn');
const timeline = [];
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const s = await page.evaluate(() => {
    const b = document.getElementById('imagegrab-btn');
    const toast = document.getElementById('imagegrab-toast');
    return {
      state: b ? b.dataset.state : null,
      text: b ? b.textContent.trim() : null,
      toast: toast ? toast.textContent : null,
      captured: window.__captured.length,
      errors: window.__errors.slice()
    };
  });
  timeline.push({ t: (i + 1) * 0.4, ...s });
  if (s.captured > 0) break;
}

console.log('\n=== 状态时间线 ===');
for (const t of timeline) {
  console.log(`${t.t.toFixed(1)}s state=${t.state} text="${t.text}" toast="${t.toast || ''}" captured=${t.captured}`);
  if (t.errors && t.errors.length) console.log('   ERRORS:', t.errors.join(' | '));
}

const final = await page.evaluate(() => ({ captured: window.__captured, errors: window.__errors }));
console.log('\n最终捕获:', JSON.stringify(final, null, 2));

await page.screenshot({ path: SHOT + '\\_diag-extract.png' });
await browser.disconnect();
console.log('DONE');
