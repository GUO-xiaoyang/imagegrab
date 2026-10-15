// 通过 CDP 打开 chrome://extensions，确认扩展管理页是否可用
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });
console.log('已连接现有 Chrome');

const page = await browser.newPage();
try {
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(() => {
    const t = document.body ? document.body.innerText : '';
    return {
      title: document.title,
      hasError: /ERR_|错误|禁止|blocked|not allowed/i.test(t),
      text: t.slice(0, 600)
    };
  });
  console.log('chrome://extensions 状态:', JSON.stringify(info, null, 2));
} catch (e) {
  console.log('打开 chrome://extensions 失败:', e.message);
}

// 同时看 chrome://version 拿到的命令行与企业策略信息
try {
  const vp = await browser.newPage();
  await vp.goto('chrome://version/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  const v = await vp.evaluate(() => document.body.innerText.slice(0, 1800));
  console.log('---- chrome://version ----');
  console.log(v);
} catch (e) {
  console.log('chrome://version 失败:', e.message);
}

await browser.disconnect();
