// 直接在页面上下文中执行真实的 content.js，验证提取逻辑 + 按钮 UI
// 说明：content.js 以 IIFE 编写，仅依赖 DOM / Image / chrome.runtime；
//       这里把 chrome.runtime.sendMessage 打桩，以捕获提取结果。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const SHOT = 'C:\\Users\\34566\\Downloads\\考核截图2';
const EXT_DIR = 'C:\\Users\\34566\\Documents\\deepseek-harness\\default-workspace\\imagegrab';
const URL_TEST = 'http://localhost:8765/mock-detail.html';

fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });
const pages = await browser.pages();
// 找到模拟详情页
let page = pages.find((p) => p.url().includes('mock-detail'));
if (!page) {
  page = await browser.newPage();
  await page.goto(URL_TEST, { waitUntil: 'networkidle2' });
} else {
  await page.bringToFront();
}
await new Promise((r) => setTimeout(r, 1500));

// 打桩：捕获 content.js 发往 background 的消息
await page.evaluateOnNewDocument(() => {
  window.__captured = [];
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    sendMessage: (msg, cb) => {
      window.__captured.push(msg);
      const resp = { ok: true, count: (msg.payload && msg.payload.images.length) || 0 };
      if (cb) cb(resp);
      return Promise.resolve(resp);
    },
    getURL: (p) => 'chrome-extension://stub/' + p,
    onMessage: { addListener: () => {} }
  };
});

// 重新加载以便打桩生效
await page.reload({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2000));

// 注入真实的 content.css 与 content.js
const css = fs.readFileSync(EXT_DIR + '\\content.css', 'utf8');
const js = fs.readFileSync(EXT_DIR + '\\content.js', 'utf8');

await page.addStyleTag({ content: css });
await page.evaluate(js);
await new Promise((r) => setTimeout(r, 800));

// 确认按钮注入
let state = await page.evaluate(() => {
  const btn = document.getElementById('imagegrab-btn');
  return { injected: !!btn, text: btn ? btn.textContent.trim() : null };
});
console.log('注入后状态:', JSON.stringify(state));

if (!state.injected) {
  console.log('按钮未注入，终止');
  await browser.disconnect();
  process.exit(1);
}

// 截图：页面右下角按钮
await page.screenshot({ path: SHOT + '\\03-插件-按钮-页面.png' });
console.log('已截图 03-插件-按钮-页面.png');

// 点击「获取图片」，触发真实提取
await page.click('#imagegrab-btn');
console.log('已点击按钮，等待提取完成…');

// 等待提取结果进入 __captured
let captured = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  captured = await page.evaluate(() => window.__captured || []);
  if (captured.length) break;
}

const btnState = await page.evaluate(() => {
  const b = document.getElementById('imagegrab-btn');
  return { text: b.textContent.trim(), state: b.dataset.state };
});
console.log('按钮最终状态:', JSON.stringify(btnState));

// 截取按钮完成态
await page.screenshot({ path: SHOT + '\\03-插件-提取完成态.png' });

if (captured && captured.length) {
  const payload = captured[0].payload;
  console.log('提取到图片数:', payload.images.length);
  console.log('来源:', payload.pageTitle);
  payload.images.forEach((im, i) => console.log(`  ${i + 1}. ${im.width}x${im.height}`));
  fs.writeFileSync(SHOT + '\\_extracted.json', JSON.stringify(payload, null, 2), 'utf8');
} else {
  console.log('未捕获到提取消息');
}

await browser.disconnect();
console.log('DONE');
