// 端到端测试：策略强制安装扩展 → 打开模拟详情页 → 点击按钮 → 截图画廊
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = 'C:\\Users\\34566\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = process.env.TEMP + '\\imagegrab-profile3';
const SHOT = 'C:\\Users\\34566\\Downloads\\考核截图2';
const URL_TEST = 'http://localhost:8765/mock-detail.html';

fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  userDataDir: PROFILE,
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,960',
    '--window-position=0,0',
    '--remote-debugging-port=9333'
  ],
  defaultViewport: null,
  ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages']
});

console.log('Chrome 已启动，等待策略安装扩展…');

let extId = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const targets = await browser.targets();
  const ext = targets.find((t) => t.url().startsWith('chrome-extension://') && !t.url().includes('nkeimhog'));
  if (ext) {
    extId = ext.url().split('/')[2];
    console.log(`第 ${i + 1} 秒发现扩展 target: ${ext.type()} ${ext.url().slice(0, 90)}`);
    break;
  }
}
console.log('EXT_ID=' + (extId || 'NOT_FOUND'));
fs.writeFileSync(SHOT + '\\_extid.txt', extId || '', 'utf8');

// 读取 chrome://policy 确认策略已生效
try {
  const pp = await browser.newPage();
  await pp.goto('chrome://policy/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3500));
  const pol = await pp.evaluate(() => document.body.innerText.slice(0, 900));
  console.log('---- chrome://policy ----');
  console.log(pol);
  await pp.close();
} catch (e) {
  console.log('读取 chrome://policy 失败:', e.message);
}

// 打开模拟详情页
const page = await browser.newPage();
await page.goto(URL_TEST, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));

const state = await page.evaluate(() => {
  const btn = document.getElementById('imagegrab-btn');
  return {
    injected: !!btn,
    btnText: btn ? btn.textContent.trim() : null,
    imgCount: document.querySelectorAll('img').length
  };
});
console.log('注入状态:', JSON.stringify(state));

fs.writeFileSync(SHOT + '\\_state.json', JSON.stringify(state, null, 2), 'utf8');
console.log('READY');
await new Promise((r) => setTimeout(r, 1000 * 60 * 40));
