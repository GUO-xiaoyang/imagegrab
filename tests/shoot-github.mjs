// 截取 GitHub 仓库页 + Pages 上线官网
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = 'C:\\Users\\34566\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'C:\\Users\\34566\\Downloads\\考核截图2';
const REPO = 'https://github.com/GUO-xiaoyang/imagegrab';
const SITE = 'https://guo-xiaoyang.github.io/imagegrab/';

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--proxy-server=http://127.0.0.1:7890',
    '--lang=zh-CN',
    '--force-device-scale-factor=1'
  ],
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 2 }
});

// ---------- 1. GitHub 仓库页 ----------
const repo = await browser.newPage();
console.log('打开仓库页…');
await repo.goto(REPO, { waitUntil: 'domcontentloaded', timeout: 120000 });
// GitHub 是渐进式渲染，等主内容出现
await repo
  .waitForSelector('[aria-labelledby="files"], .repository-content', { timeout: 60000 })
  .catch(() => console.log('等待文件列表超时，继续截图'));
await new Promise((r) => setTimeout(r, 5000));
await repo.screenshot({ path: OUT + '\\04-GitHub仓库首页.png' });
console.log('saved 04-GitHub仓库首页.png');

// 文件列表区域单独截一张（内容更清晰）
try {
  const box = await repo.$('[aria-labelledby="files"]');
  if (box) {
    await box.screenshot({ path: OUT + '\\04-GitHub文件列表.png' });
    console.log('saved 04-GitHub文件列表.png');
  }
} catch (e) {
  console.log('文件列表截图失败:', e.message);
}

// 最近提交信息
const repoInfo = await repo.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : null;
  };
  return {
    title: document.title,
    commitMsg: pick('[data-testid="latest-commit-commit-message"], .commit-message, a[href*="/commit/"]'),
    fileCount: document.querySelectorAll('[aria-labelledby="files"] .react-directory-truncate, [role="row"]').length
  };
});
console.log('仓库页信息:', JSON.stringify(repoInfo, null, 2));

// ---------- 2. GitHub Pages 官网 ----------
const site = await browser.newPage();
console.log('打开 Pages 官网…');
await site.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

// 首屏
await site.screenshot({ path: OUT + '\\06-Pages官网-首屏.png' });
console.log('saved 06-Pages官网-首屏.png');

// 整页
await site.screenshot({ path: OUT + '\\06-Pages官网-整页.png', fullPage: true });
console.log('saved 06-Pages官网-整页.png');

// 核心功能区
await site.evaluate(() => document.getElementById('features')?.scrollIntoView());
await new Promise((r) => setTimeout(r, 1400));
await site.screenshot({ path: OUT + '\\06-Pages官网-核心功能.png' });
console.log('saved 06-Pages官网-核心功能.png');

// 安装步骤区
await site.evaluate(() => document.getElementById('install')?.scrollIntoView());
await new Promise((r) => setTimeout(r, 1400));
await site.screenshot({ path: OUT + '\\06-Pages官网-安装步骤.png' });
console.log('saved 06-Pages官网-安装步骤.png');

// 页脚
await site.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 1400));
await site.screenshot({ path: OUT + '\\06-Pages官网-页脚.png' });
console.log('saved 06-Pages官网-页脚.png');

// 移动端适配
await site.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
await site.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 1200));
await site.screenshot({ path: OUT + '\\06-Pages官网-移动端.png' });
console.log('saved 06-Pages官网-移动端.png');

const siteInfo = await site.evaluate(() => ({
  url: location.href,
  title: document.title,
  h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null
}));
console.log('官网信息:', JSON.stringify(siteInfo, null, 2));

await browser.close();
console.log('DONE');
