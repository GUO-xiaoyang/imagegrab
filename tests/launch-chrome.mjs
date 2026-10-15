// 启动 Chrome：加载测试扩展 + 打开模拟详情页
// 关键：必须移除 Puppeteer 默认的 --disable-extensions，否则 --load-extension 失效
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = 'C:\\Users\\34566\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const EXT = process.env.TEMP + '\\imagegrab-test-ext';
const PROFILE = process.env.TEMP + '\\imagegrab-profile2';
const URL_TEST = 'http://localhost:8765/mock-detail.html';
const SHOT_DIR = 'C:\\Users\\34566\\Downloads\\考核截图2';

if (!fs.existsSync(EXT)) {
  console.error('测试扩展目录不存在:', EXT);
  process.exit(1);
}
fs.mkdirSync(SHOT_DIR, { recursive: true });

// 过滤掉会禁用扩展的默认参数（Puppeteer 默认会加 --disable-extensions）
const args = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,OptimizationHints',
  '--window-size=1440,960',
  '--window-position=0,0',
  '--remote-debugging-port=9333',
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`
];

console.log('关键启动参数:');
args.filter((a) => /extension|remote-debug/.test(a)).forEach((a) => console.log('  ' + a));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  userDataDir: PROFILE,
  args,
  defaultViewport: null,
  ignoreDefaultArgs: [
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps'
  ]
});

console.log('Chrome 已启动');

// 轮询等待扩展注册（MV3 service worker 启动有延迟）
let extId = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const targets = await browser.targets();
  const ext = targets.find((t) => t.url().startsWith('chrome-extension://'));
  if (ext) {
    extId = ext.url().split('/')[2];
    console.log(`第 ${i + 1} 秒：发现扩展 target -> ${ext.type()} ${ext.url().slice(0, 80)}`);
    break;
  }
}

if (!extId) {
  console.log('未通过 target 发现扩展，尝试从 Preferences 读取…');
  const prefPath = PROFILE + '\\Default\\Preferences';
  if (fs.existsSync(prefPath)) {
    const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
    const settings = prefs.extensions && prefs.extensions.settings;
    if (settings) {
      const ids = Object.keys(settings);
      console.log('Preferences 中注册的扩展:', ids.join(', '));
      // 取非 Chrome 内置组件（内置 ID 为 32 位小写字母）
      extId = ids.find((id) => /^[a-p]{32}$/.test(id)) || null;
    }
  }
}

console.log('EXT_ID=' + (extId || 'UNKNOWN'));

// 打开模拟详情页
const page = await browser.newPage();
await page.goto(URL_TEST, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

const state = await page.evaluate(() => {
  const btn = document.getElementById('imagegrab-btn');
  return {
    injected: !!btn,
    btnText: btn ? btn.textContent.trim() : null,
    imgCount: document.querySelectorAll('img').length
  };
});
console.log('注入状态:', JSON.stringify(state));

await page.screenshot({ path: SHOT_DIR + '\\03-插件-页面按钮.png' });
console.log('已截图 03-插件-页面按钮.png');

fs.writeFileSync(SHOT_DIR + '\\_extid.txt', extId || '', 'utf8');
console.log('READY');
await new Promise((r) => setTimeout(r, 1000 * 60 * 40));
