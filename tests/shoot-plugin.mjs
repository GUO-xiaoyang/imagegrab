// 提取并在真实 gallery.html 中渲染画廊，产出问卷截图
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = 'C:\\Users\\34566\\Downloads\\考核截图2';
const EXT = 'C:\\Users\\34566\\Documents\\deepseek-harness\\default-workspace\\imagegrab';
const URL_TEST = 'http://localhost:8765/mock-detail.html';

fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });

// ---------- 1. 在模拟详情页执行真实提取 ----------
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__captured = [];
  window.__errors = [];
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    sendMessage: (msg) => {
      window.__captured.push(msg);
      return Promise.resolve({ ok: true });
    },
    getURL: (p) => 'chrome-extension://stub/' + p,
    onMessage: { addListener: () => {} }
  };
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
});

await page.goto(URL_TEST, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const css = fs.readFileSync(path.join(EXT, 'content.css'), 'utf8');
const js = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
await page.addStyleTag({ content: css });
await page.evaluate(js);
await new Promise((r) => setTimeout(r, 600));

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

// 截图 A：页面右下角按钮（提取前）
await page.screenshot({ path: path.join(SHOT, '03-插件-1-详情页按钮.png') });
console.log('saved 03-插件-1-详情页按钮.png');

// 点击提取
await page.click('#imagegrab-btn');
let captured = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  captured = await page.evaluate(() => window.__captured);
  if (captured && captured.length) break;
}
if (!captured || !captured.length) {
  console.log('提取失败');
  await browser.disconnect();
  process.exit(1);
}
const payload = captured[0].payload;
console.log('提取结果：' + payload.images.length + ' 张');
payload.images.forEach((im, i) => console.log('  ' + (i + 1) + '. ' + im.width + 'x' + im.height + '  ' + im.url));
fs.writeFileSync(path.join(SHOT, '_extracted.json'), JSON.stringify(payload, null, 2), 'utf8');

// 截图 B：提取完成后的按钮态 + 页面内提示
await page.screenshot({ path: path.join(SHOT, '03-插件-2-提取完成提示.png') });
console.log('saved 03-插件-2-提取完成提示.png');

// ---------- 2. 在真实 gallery.html 中渲染 ----------
const galleryUrl = 'file:///' + path.join(EXT, 'gallery.html').replace(/\\/g, '/');
const gpage = await browser.newPage();

// 让 gallery.js 拿到我们提取好的数据
await gpage.evaluateOnNewDocument((data) => {
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    sendMessage: (msg) => {
      if (msg && msg.type === 'IMAGEGRAB_GET_IMAGES') {
        return Promise.resolve({ ok: true, session: data });
      }
      if (msg && msg.type === 'IMAGEGRAB_DOWNLOAD') {
        // 模拟下载：逐张上报进度，最后完成
        const urls = (msg.payload && msg.payload.urls) || [];
        urls.forEach((u, i) => {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('__prog', { detail: {
              type: 'IMAGEGRAB_PROGRESS',
              payload: { state: 'running', total: urls.length, done: i + 1, success: i + 1, current: '商品图_' + String(i + 1).padStart(3, '0') + '.png' }
            }}));
          }, 260 * (i + 1));
        });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('__prog', { detail: {
            type: 'IMAGEGRAB_PROGRESS',
            payload: { state: 'done', total: urls.length, done: urls.length, success: urls.length }
          }}));
        }, 260 * urls.length + 200);
        return Promise.resolve({ ok: true, total: urls.length, success: urls.length, failed: 0 });
      }
      return Promise.resolve({ ok: true });
    },
    getURL: (p) => 'file:///' + p,
    onMessage: {
      addListener: (fn) => {
        window.addEventListener('__prog', (e) => fn(e.detail));
      }
    }
  };
}, payload);

await gpage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
await gpage.goto(galleryUrl, { waitUntil: 'load', timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

const gstate = await gpage.evaluate(() => ({
  cards: document.querySelectorAll('.card').length,
  count: document.getElementById('count') ? document.getElementById('count').textContent : null,
  info: document.getElementById('page-info') ? document.getElementById('page-info').textContent : null
}));
console.log('画廊状态:', JSON.stringify(gstate, null, 2));

// 截图 C：画廊全貌
await gpage.screenshot({ path: path.join(SHOT, '03-插件-3-画廊预览.png') });
console.log('saved 03-插件-3-画廊预览.png');

// 取消选中前 3 张，展示勾选交互
await gpage.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  cards.slice(0, 3).forEach((c) => c.click());
});
await new Promise((r) => setTimeout(r, 600));
await gpage.screenshot({ path: path.join(SHOT, '03-插件-4-勾选交互.png') });
console.log('saved 03-插件-4-勾选交互.png');

// 点击下载，抓进度条
await gpage.click('#btn-download');
await new Promise((r) => setTimeout(r, 900));
await gpage.screenshot({ path: path.join(SHOT, '03-插件-5-下载进度.png') });
console.log('saved 03-插件-5-下载进度.png');

await new Promise((r) => setTimeout(r, 2000));
await gpage.screenshot({ path: path.join(SHOT, '03-插件-6-下载完成.png') });
console.log('saved 03-插件-6-下载完成.png');

await browser.disconnect();
console.log('DONE');
