/**
 * 图提取 ImageGrab · 画廊页脚本
 * 职责：
 *   1. 向 background 拉取本次提取的图片
 *   2. 网格渲染 + 勾选交互（点击卡片切换）
 *   3. 全选 / 反选 / 全不选 / 按尺寸过滤
 *   4. 批量下载并展示进度与结果
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // DOM 引用
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const els = {
    pageInfo: $('page-info'),
    toolbar: $('toolbar'),
    grid: $('grid'),
    count: $('count'),
    empty: $('empty'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressText: $('progress-text'),
    toast: $('toast'),
    btnAll: $('btn-all'),
    btnInvert: $('btn-invert'),
    btnNone: $('btn-none'),
    btnDownload: $('btn-download'),
    minSize: $('min-size')
  };

  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------
  /** @type {{url:string,width:number,height:number}[]} */
  let images = [];
  /** 已选中的 URL 集合 */
  const selected = new Set();
  /** 当前尺寸过滤阈值 */
  let minSize = 0;

  // ---------------------------------------------------------------------------
  // 工具
  // ---------------------------------------------------------------------------

  /** 轻提示 */
  function toast(message, kind = 'ok') {
    els.toast.textContent = message;
    els.toast.dataset.kind = kind;
    els.toast.dataset.show = '1';
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      els.toast.dataset.show = '0';
    }, 3600);
  }

  /** 更新底部计数与下载按钮可用状态 */
  function refreshCount() {
    const visibleCount = visibleImages().length;
    els.count.innerHTML = `已选 <strong>${selected.size}</strong> / ${visibleCount} 张`;
    els.btnDownload.disabled = selected.size === 0;
    els.btnDownload.textContent = selected.size ? `下载选中（${selected.size}）` : '下载选中';
  }

  /** 按当前尺寸阈值返回可见图片 */
  function visibleImages() {
    if (!minSize) return images;
    return images.filter((im) => Math.min(im.width, im.height) >= minSize);
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** 渲染整个网格 */
  function render() {
    const list = visibleImages();
    els.grid.innerHTML = '';

    if (!images.length) {
      els.toolbar.hidden = true;
      els.empty.hidden = false;
      return;
    }

    els.empty.hidden = true;
    els.toolbar.hidden = false;

    const frag = document.createDocumentFragment();

    list.forEach((im, idx) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.url = im.url;
      card.dataset.selected = selected.has(im.url) ? '1' : '0';
      card.tabIndex = 0;
      card.setAttribute('role', 'checkbox');
      card.setAttribute('aria-checked', selected.has(im.url) ? 'true' : 'false');
      card.setAttribute('aria-label', `第 ${idx + 1} 张，${im.width}×${im.height}`);

      card.innerHTML = `
        <div class="card-thumb">
          <span class="card-check">${CHECK_SVG}</span>
          <span class="card-index">${idx + 1}</span>
          <img src="${im.url}" alt="商品图 ${idx + 1}" loading="lazy" referrerpolicy="no-referrer">
        </div>
        <div class="card-meta">
          <span class="card-size">${im.width} × ${im.height}</span>
          <span class="card-name">商品图_${String(idx + 1).padStart(3, '0')}.png</span>
        </div>
      `;

      frag.appendChild(card);
    });

    els.grid.appendChild(frag);
    refreshCount();
  }

  /** 切换某张卡片的选中态 */
  function toggleCard(card) {
    const url = card.dataset.url;
    if (selected.has(url)) {
      selected.delete(url);
      card.dataset.selected = '0';
      card.setAttribute('aria-checked', 'false');
    } else {
      selected.add(url);
      card.dataset.selected = '1';
      card.setAttribute('aria-checked', 'true');
    }
    refreshCount();
  }

  // ---------------------------------------------------------------------------
  // 事件绑定
  // ---------------------------------------------------------------------------

  // 点击卡片切换选中（事件委托）
  els.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) toggleCard(card);
  });

  // 键盘可达性：空格/回车切换
  els.grid.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    toggleCard(card);
  });

  // 全选（仅当前可见的）
  els.btnAll.addEventListener('click', () => {
    visibleImages().forEach((im) => selected.add(im.url));
    render();
  });

  // 反选
  els.btnInvert.addEventListener('click', () => {
    visibleImages().forEach((im) => {
      if (selected.has(im.url)) selected.delete(im.url);
      else selected.add(im.url);
    });
    render();
  });

  // 全不选
  els.btnNone.addEventListener('click', () => {
    selected.clear();
    render();
  });

  // 尺寸过滤
  els.minSize.addEventListener('change', () => {
    minSize = parseInt(els.minSize.value, 10) || 0;
    render();
  });

  // 下载
  els.btnDownload.addEventListener('click', async () => {
    const urls = visibleImages()
      .filter((im) => selected.has(im.url))
      .map((im) => im.url);

    if (!urls.length) {
      toast('请先勾选要下载的图片', 'warn');
      return;
    }

    els.btnDownload.disabled = true;
    els.progress.hidden = false;
    els.progressFill.style.width = '0%';
    els.progressText.textContent = `准备下载 ${urls.length} 张…`;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'IMAGEGRAB_DOWNLOAD',
        payload: { urls }
      });

      if (resp && resp.ok) {
        const msg =
          resp.failed > 0
            ? `完成：成功 ${resp.success} 张，失败 ${resp.failed} 张`
            : `全部完成：共导出 ${resp.success} 张 PNG`;
        toast(msg, resp.failed > 0 ? 'warn' : 'ok');
        els.progressText.textContent = msg;
      } else {
        toast('下载失败：' + (resp && resp.error ? resp.error : '未知错误'), 'warn');
        els.progressText.textContent = '下载失败';
      }
    } catch (err) {
      toast('下载异常：' + (err && err.message ? err.message : err), 'warn');
      els.progressText.textContent = '下载异常';
    } finally {
      els.btnDownload.disabled = selected.size === 0;
      setTimeout(() => {
        els.progress.hidden = true;
      }, 2600);
    }
  });

  // 监听 background 上报的进度
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'IMAGEGRAB_PROGRESS') return;
    const p = message.payload || {};
    if (p.state === 'start') {
      els.progress.hidden = false;
      els.progressFill.style.width = '0%';
      els.progressText.textContent = `开始下载，共 ${p.total} 张…`;
    } else if (p.state === 'running') {
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      els.progressFill.style.width = pct + '%';
      els.progressText.textContent = `正在处理 ${p.done}/${p.total} · ${p.current || ''}`;
    } else if (p.state === 'done') {
      els.progressFill.style.width = '100%';
      els.progressText.textContent = `完成：成功 ${p.success}/${p.total} 张`;
    }
  });

  // ---------------------------------------------------------------------------
  // 启动：拉取数据
  // ---------------------------------------------------------------------------
  (async function init() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'IMAGEGRAB_GET_IMAGES' });
      const session = resp && resp.session;

      if (!session || !Array.isArray(session.images) || !session.images.length) {
        els.pageInfo.textContent = '暂无数据';
        render();
        return;
      }

      images = session.images;
      const title = session.pageTitle ? session.pageTitle.slice(0, 60) : '未知页面';
      els.pageInfo.textContent = `来源：${title} · 共 ${images.length} 张`;
      els.pageInfo.title = session.pageUrl || '';

      // 默认全选，省去用户逐个点击
      images.forEach((im) => selected.add(im.url));

      render();
    } catch (err) {
      els.pageInfo.textContent = '读取失败';
      toast('读取图片列表失败：' + (err && err.message ? err.message : err), 'warn');
      render();
    }
  })();
})();
