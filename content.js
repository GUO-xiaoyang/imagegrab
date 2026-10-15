/**
 * 图提取 ImageGrab · content script
 * 职责：
 *   1. 在支持的电商详情页右下角注入悬浮按钮「获取图片」
 *   2. 点击后扫描整页商品图片（兼容多种懒加载写法）
 *   3. 过滤图标 / logo / 占位图 / 过小图片
 *   4. 补全相对路径、去重，交给 background 打开画廊页
 */

(() => {
  'use strict';

  // 防止重复注入（SPA 路由切换时可能多次执行）
  if (window.__imageGrabInjected) return;
  window.__imageGrabInjected = true;

  /** 各平台「商品详情页」的 URL 特征；不匹配则不注入按钮 */
  const DETAIL_PAGE_RULES = [
    { host: /(^|\.)taobao\.com$/, test: /[?&]id=\d+/ },        // 淘宝详情页 ?id=
    { host: /(^|\.)tmall\.com$/, test: /[?&]id=\d+/ },         // 天猫详情页 ?id=
    { host: /(^|\.)jd\.com$/, test: /\/\d+\.html/ },            // 京东 item.jd.com/123.html
    { host: /(^|\.)pinduoduo\.com$/, test: /goods\.html|goods_id=/ },   // 拼多多商品页
    { host: /(^|\.)yangkeduo\.com$/, test: /goods\.html|goods_id=/ },
    // 本地测试专用：配合 tests/mock-detail.html 验证注入与提取链路
    // （正式环境的 host_permissions 不含该地址，因此不会在真实浏览中生效）
    { host: /^(localhost|127\.0\.0\.1)$/, test: /(mock-detail|\?id=\d+)/ }
  ];

  /** 需要剔除的图标/占位图特征 */
  const NOISE_PATTERN = /(sprite|icon|logo|avatar|qrcode|qr-code|placeholder|loading|blank|spacer|transparent|1x1|pixel|\.gif$|\/ico\/|favicon)/i;

  /** 最小边长（px），小于此尺寸视为图标 */
  const MIN_SIZE = 100;

  /** 单页最多提取张数，避免超大页面卡死 */
  const MAX_IMAGES = 300;

  // ---------------------------------------------------------------------------
  // 工具函数
  // ---------------------------------------------------------------------------

  /** 判断当前页面是否为受支持的商品详情页 */
  function isSupportedDetailPage() {
    const host = location.hostname;
    const url = location.href;
    return DETAIL_PAGE_RULES.some((rule) => rule.host.test(host) && rule.test.test(url));
  }

  /** 把各种相对写法补全为绝对 URL；无法解析时返回 null */
  function toAbsoluteUrl(raw) {
    if (!raw) return null;
    let url = String(raw).trim();
    if (!url) return null;
    // 去掉 CSS 的 url() 包装
    url = url.replace(/^url\((['"]?)(.*?)\1\)$/i, '$2').trim();
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
    // 协议相对 //img.xxx.com/a.jpg
    if (url.startsWith('//')) url = location.protocol + url;
    try {
      const abs = new URL(url, location.href);
      if (!/^https?:$/.test(abs.protocol)) return null;
      return abs.href;
    } catch {
      return null;
    }
  }

  /**
   * 从 srcset 中挑出最大的一张
   * 形如："a.jpg 1x, b.jpg 2x" 或 "a.jpg 400w, b.jpg 800w"
   */
  function pickLargestFromSrcset(srcset) {
    if (!srcset) return null;
    const parts = String(srcset)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    let best = null;
    let bestScore = -1;
    for (const part of parts) {
      const [url, descriptor] = part.split(/\s+/);
      if (!url) continue;
      let score = 1;
      if (descriptor) {
        const m = descriptor.match(/^([\d.]+)([wx])$/i);
        if (m) score = parseFloat(m[1]) * (m[2].toLowerCase() === 'w' ? 1 : 1000);
      }
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best;
  }

  /** 该 URL 是否像需要剔除的噪音图 */
  function isNoise(url) {
    return NOISE_PATTERN.test(url);
  }

  // ---------------------------------------------------------------------------
  // 图片扫描
  // ---------------------------------------------------------------------------

  /**
   * 收集候选 URL（不去重、不校验尺寸）
   * 覆盖：<img> 各属性、srcset、data-* 懒加载、背景图、<picture><source>
   */
  function collectCandidateUrls() {
    const found = new Set();

    const push = (u) => {
      const abs = toAbsoluteUrl(u);
      if (abs) found.add(abs);
    };

    // 1) <img> 标签
    for (const img of document.querySelectorAll('img')) {
      // srcset 存在时优先取其中最大的候选，避免同一图源的大小变体重复入列
      const fromSrcset =
        pickLargestFromSrcset(img.getAttribute('srcset')) ||
        pickLargestFromSrcset(img.getAttribute('data-srcset'));

      if (fromSrcset) {
        push(fromSrcset);
      } else {
        push(img.getAttribute('src'));
      }

      push(img.getAttribute('data-src'));
      push(img.getAttribute('data-lazy-src'));
      push(img.getAttribute('data-original'));
      push(img.getAttribute('data-ks-lazyload'));   // 淘宝常用
      push(img.getAttribute('data-lazyload'));
      push(img.getAttribute('data-echo'));
      push(img.getAttribute('data-url'));
    }

    // 2) <picture><source srcset>
    for (const source of document.querySelectorAll('picture source')) {
      push(pickLargestFromSrcset(source.getAttribute('srcset')));
      push(source.getAttribute('src'));
    }

    // 3) 背景图（内联 style + 计算样式）
    for (const el of document.querySelectorAll('[style*="background"]')) {
      const bg = el.style.backgroundImage;
      if (bg) {
        for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/gi)) push(m[2]);
      }
    }
    // 计算样式里的背景图（覆盖 class 控制的写法），限制元素数量避免卡顿
    const all = document.querySelectorAll('div,section,li,a,span,i');
    const limit = Math.min(all.length, 1500);
    for (let i = 0; i < limit; i++) {
      const bg = getComputedStyle(all[i]).backgroundImage;
      if (bg && bg !== 'none') {
        for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/gi)) push(m[2]);
      }
    }

    // 4) 兜底：页面内联脚本/JSON 中出现的图片地址（很多电商把图放 data 里）
    for (const script of document.querySelectorAll('script:not([src])')) {
      const text = script.textContent || '';
      if (text.length > 500000) continue;   // 跳过超大脚本
      for (const m of text.matchAll(/https?:\/\/[^\s"'\\<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'\\<>]*)?/gi)) {
        push(m[0]);
      }
    }

    return found;
  }

  /**
   * 校验候选图片：真实加载 + 尺寸达标
   * 返回 { url, width, height } 数组
   */
  async function validateImages(urls) {
    const results = [];
    const list = [...urls].filter((u) => !isNoise(u)).slice(0, MAX_IMAGES * 3);

    const checkOne = (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        const timer = setTimeout(() => resolve(null), 8000);
        img.onload = () => {
          clearTimeout(timer);
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          // 过小（图标）、1x1 像素图、异常细长图都排除
          if (w < MIN_SIZE || h < MIN_SIZE) return resolve(null);
          if (w === 1 || h === 1) return resolve(null);
          if (w / h > 12 || h / w > 12) return resolve(null);
          resolve({ url, width: w, height: h });
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        img.src = url;
      });

    // 并发 12 个，避免瞬间打爆连接数
    const CONCURRENCY = 12;
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) {
        const idx = cursor++;
        const r = await checkOne(list[idx]);
        if (r) results.push(r);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    return results;
  }

  // ---------------------------------------------------------------------------
  // UI：右下角悬浮按钮
  // ---------------------------------------------------------------------------

  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'imagegrab-btn';
    btn.type = 'button';
    btn.innerHTML = `
      <svg class="ig-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5-2.5-3L5 17Z" fill="currentColor"/>
        <circle cx="8.5" cy="9" r="1.6" fill="currentColor"/>
      </svg>
      <span class="ig-label">获取图片</span>
    `;
    btn.title = '图提取 ImageGrab：扫描本页所有商品图';
    btn.addEventListener('click', onExtractClick);
    return btn;
  }

  /** 把按钮文案/状态复位 */
  function setButtonState(state, text) {
    const btn = document.getElementById('imagegrab-btn');
    if (!btn) return;
    btn.dataset.state = state;
    const label = btn.querySelector('.ig-label');
    if (label && text) label.textContent = text;
    btn.disabled = state === 'loading';
  }

  /** 点击「获取图片」 */
  async function onExtractClick() {
    if (window.__imageGrabBusy) return;
    window.__imageGrabBusy = true;
    setButtonState('loading', '提取中…');

    try {
      const candidates = collectCandidateUrls();
      const images = await validateImages(candidates);

      if (!images.length) {
        setButtonState('error', '没找到图片');
        // 同时用页面内提示条反馈，避免用户只看到按钮变化
        showToast('未在本页找到符合条件的商品图片（可能图片未加载，先滚动页面再试）', 'warn');
        setTimeout(() => setButtonState('idle', '获取图片'), 2600);
        return;
      }

      // 交给 background：缓存图片列表 + 打开画廊页
      const resp = await chrome.runtime.sendMessage({
        type: 'IMAGEGRAB_OPEN_GALLERY',
        payload: {
          images,
          pageUrl: location.href,
          pageTitle: document.title
        }
      });

      if (resp && resp.ok) {
        setButtonState('done', `已提取 ${images.length} 张`);
        showToast(`已提取 ${images.length} 张图片，正在新页面打开…`, 'ok');
      } else {
        setButtonState('error', '打开失败');
        showToast('打开画廊失败：' + (resp && resp.error ? resp.error : '未知错误'), 'warn');
      }
      setTimeout(() => setButtonState('idle', '获取图片'), 3000);
    } catch (err) {
      console.error('[ImageGrab] 提取失败', err);
      setButtonState('error', '提取失败');
      showToast('提取失败：' + (err && err.message ? err.message : err), 'warn');
      setTimeout(() => setButtonState('idle', '获取图片'), 3000);
    } finally {
      window.__imageGrabBusy = false;
    }
  }

  /** 页面内轻提示 */
  function showToast(message, kind) {
    let el = document.getElementById('imagegrab-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'imagegrab-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind || 'ok';
    el.dataset.show = '1';
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => {
      el.dataset.show = '0';
    }, 3600);
  }

  // ---------------------------------------------------------------------------
  // 初始化
  // ---------------------------------------------------------------------------

  function init() {
    if (!isSupportedDetailPage()) return;      // 非详情页不注入
    if (document.getElementById('imagegrab-btn')) return;
    // 等 body 出现
    const mount = () => {
      if (!document.body) return setTimeout(mount, 200);
      document.body.appendChild(createButton());
    };
    mount();
  }

  init();

  // SPA 路由变化后重新判断（淘宝/京东都是前端路由）
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const btn = document.getElementById('imagegrab-btn');
    if (isSupportedDetailPage()) {
      if (!btn) init();
    } else if (btn) {
      btn.remove();
    }
  }, 1200);
})();
