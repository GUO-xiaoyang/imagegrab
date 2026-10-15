/**
 * 图提取 ImageGrab · background service worker (Manifest V3)
 * 职责：
 *   1. 接收 content script 提取到的图片列表，暂存并在新标签页打开画廊
 *   2. 为画廊页提供图片数据
 *   3. 处理批量下载：fetch → createImageBitmap → OffscreenCanvas → PNG Blob
 *   4. 通过 chrome.downloads.download 保存为「商品图_序号.png」
 *   5. 通过 runtime 消息上报下载进度
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'imagegrab:lastSession';

/** 文件名前缀 */
const FILE_PREFIX = '商品图';

/** 单个文件下载超时（ms） */
const FETCH_TIMEOUT = 20000;

/** 序号补零位数：001 */
const PAD = 3;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 从 URL 里猜一个可读的扩展名，仅用于日志 */
function guessExt(url) {
  const m = String(url).split('?')[0].match(/\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i);
  return m ? m[1].toLowerCase() : 'unknown';
}

/** 生成「商品图_001.png」 */
function buildFileName(index) {
  return `${FILE_PREFIX}_${String(index).padStart(PAD, '0')}.png`;
}

/**
 * 把任意格式图片 URL 转成 PNG Blob
 * 跨域图片在 MV3 中由扩展进程发起 fetch，配合 host_permissions 可正常读取，
 * 不会受页面 CORS 限制；再经 createImageBitmap + OffscreenCanvas 重编码为 PNG。
 */
async function fetchAsPngBlob(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let resp;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const srcBlob = await resp.blob();

  // 本身就是 PNG 且体积正常，直接复用，省一次重编码
  if (/^image\/png$/i.test(srcBlob.type)) {
    return { blob: srcBlob, converted: false };
  }

  // 其它格式统一转 PNG
  const bitmap = await createImageBitmap(srcBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob: pngBlob, converted: true };
}

/** 把 Blob 转成 data URL（downloads API 在 SW 中更稳妥的写法） */
async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // 分块拼接，避免超长图片把 String.fromCharCode 撑爆
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** 广播进度给画廊页 */
function broadcastProgress(payload) {
  chrome.runtime.sendMessage({ type: 'IMAGEGRAB_PROGRESS', payload }).catch(() => {
    // 画廊页可能已关闭，忽略
  });
}

// ---------------------------------------------------------------------------
// 消息处理
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    // content script 提取完成 → 暂存并打开画廊
    case 'IMAGEGRAB_OPEN_GALLERY':
      handleOpenGallery(message.payload)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;   // 异步响应

    // 画廊页请求数据
    case 'IMAGEGRAB_GET_IMAGES':
      getSession()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;

    // 画廊页请求批量下载
    case 'IMAGEGRAB_DOWNLOAD':
      handleDownload(message.payload)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
      return true;

    default:
      return;
  }
});

// ---------------------------------------------------------------------------
// 业务逻辑
// ---------------------------------------------------------------------------

/** 暂存本次提取结果 */
async function saveSession(session) {
  await chrome.storage.session.set({ [STORAGE_KEY]: session });
}

async function getSession() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}

async function handleOpenGallery(payload) {
  if (!payload || !Array.isArray(payload.images) || !payload.images.length) {
    return { ok: false, error: '没有可展示的图片' };
  }

  const session = {
    images: payload.images,
    pageUrl: payload.pageUrl || '',
    pageTitle: payload.pageTitle || '',
    createdAt: Date.now()
  };
  await saveSession(session);

  // 打开扩展内的画廊页
  const url = chrome.runtime.getURL('gallery.html');
  // 若已存在画廊标签页则复用，避免开一堆
  const existing = await chrome.tabs.query({ url: url + '*' });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.tabs.reload(existing[0].id);
  } else {
    await chrome.tabs.create({ url });
  }

  return { ok: true, count: session.images.length };
}

/**
 * 批量下载
 * payload: { urls: string[] }
 */
async function handleDownload(payload) {
  const urls = (payload && payload.urls) || [];
  if (!urls.length) return { ok: false, error: '未选择任何图片' };

  const total = urls.length;
  let success = 0;
  const failures = [];

  broadcastProgress({ state: 'start', total, done: 0, success: 0, current: '' });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fileName = buildFileName(i + 1);
    broadcastProgress({ state: 'running', total, done: i, success, current: fileName });

    try {
      const { blob } = await fetchAsPngBlob(url);
      const dataUrl = await blobToDataUrl(blob);

      await chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: false,
        conflictAction: 'uniquify'
      });

      success++;
    } catch (err) {
      failures.push({ url, reason: String(err && err.message || err) });
      console.warn('[ImageGrab] 下载失败', url, err);
    }

    broadcastProgress({ state: 'running', total, done: i + 1, success, current: fileName });
  }

  broadcastProgress({ state: 'done', total, done: total, success });
  return { ok: true, total, success, failed: failures.length, failures };
}

// ---------------------------------------------------------------------------
// 安装/更新时清理旧数据
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.storage.session.remove(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
});
