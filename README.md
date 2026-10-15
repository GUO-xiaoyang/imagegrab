# 图提取 · ImageGrab

> Chrome 电商图片提取下载插件：在淘宝 / 天猫 / 京东 / 拼多多商家版的商品详情页，一键提取页面内所有商品图片，新标签页集中预览、勾选，批量下载为 PNG。

![Manifest](https://img.shields.io/badge/Manifest-V3-6366f1)
![License](https://img.shields.io/badge/license-MIT-8b5cf6)

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 一键提取 | 自动扫描页面所有商品图，兼容 `srcset`、`data-src`、`data-ks-lazyload`、`background-image` 等懒加载写法 |
| 智能过滤 | 自动排除图标、logo、占位图，以及小于 `100×100`、1×1 像素、长宽比异常的图片 |
| 集中预览 | 新标签页网格展示全部图片，含缩略图与真实尺寸 |
| 自由勾选 | 全选 / 反选 / 全不选，支持按最小尺寸阈值过滤 |
| 统一 PNG | jpg / webp 等格式自动经 `createImageBitmap` + `OffscreenCanvas` 重编码为 PNG |
| 批量下载 | 一键保存，文件名自动编号为 `商品图_001.png` |

## 文件结构

```
imagegrab/
├── manifest.json          # Manifest V3 配置（权限、匹配域名、注入规则）
├── content.js             # 注入右下角按钮 + 扫描页面图片
├── content.css            # 悬浮按钮与页面内提示样式
├── background.js          # Service Worker：消息转发、PNG 转换、批量下载
├── gallery.html           # 图片画廊页（新标签页）
├── gallery.js             # 画廊交互：渲染、勾选、过滤、下载
├── gallery.css            # 画廊样式
├── icons/                 # 扩展图标 16 / 48 / 128
├── docs/                  # 官方宣传网站（GitHub Pages 发布源）
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js
└── tests/                 # 本地测试用模拟详情页（非扩展运行所需）
    └── mock-detail.html
```

## 安装方法

1. 下载本仓库（`Code → Download ZIP`）并解压到本地文件夹
2. 打开 Chrome，地址栏输入 `chrome://extensions` 并回车
3. 打开右上角「**开发者模式**」
4. 点击「**加载已解压的扩展程序**」，选择解压后的 `imagegrab` 文件夹
5. 打开任意淘宝 / 京东 / 拼多多商家版商品详情页，页面右下角会出现「**获取图片**」按钮

> 提示：若按钮未出现，先滚动页面让懒加载图片渲染出来再点。插件只在受支持平台的**商品详情页**注入，列表页与首页不会显示。

## 使用流程

1. 在商品详情页点击右下角「获取图片」
2. 插件扫描整页，自动过滤噪音图，随后在新标签页打开画廊
3. 在画廊中勾选需要的图片（支持全选 / 反选 / 按尺寸过滤）
4. 点击「下载选中」，图片以 `商品图_001.png`、`商品图_002.png` … 依次保存到浏览器默认下载目录

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 用户点击按钮时访问当前标签页 |
| `scripting` | 注入内容脚本 |
| `downloads` | 保存 PNG 到本地 |
| `storage` | 在 `storage.session` 中暂存本次提取结果，传递给画廊页 |

`host_permissions` 仅覆盖淘宝 / 天猫 / 京东 / 拼多多商家版域名，不申请任何其它站点权限。

## 本地测试

仓库内的 `tests/mock-detail.html` 是一个离线模拟商品详情页，包含：

- 多张正常尺寸商品图（通过 SVG data URI 生成，无需联网）
- 需要被过滤的噪点：`logo`、`icon`、`1×1` 像素图、`80×80` 小图标
- 懒加载属性样例：`data-src`、`data-ks-lazyload`、`srcset`
- CSS `background-image` 图片

**测试步骤**

1. `chrome://extensions` → 该扩展的「详细信息」→ 打开「**允许访问文件网址**」
2. 用 Chrome 打开 `tests/mock-detail.html`
3. 页面右下角点击「获取图片」，核对画廊中图片数量与过滤结果

## 开发说明

- 全部代码为原生 JavaScript，无构建步骤，改完文件在 `chrome://extensions` 点一次「刷新」即可
- `background.js` 以 `type: "module"` 注册，便于后续拆分模块
- 关键逻辑均有中文注释

## 宣传网站

`docs/` 目录是插件官网，纯静态（HTML + CSS + 原生 JS），无框架、无 CDN、无外部图片：

- 本地预览：直接双击 `docs/index.html`
- 在线访问：<https://guo-xiaoyang.github.io/imagegrab/>

### 如何修改主色调

打开 `docs/css/style.css`，修改 `:root` 中的变量即可全站换肤：

```css
:root {
  --primary: #6366f1;   /* 主色 */
  --accent: #8b5cf6;    /* 渐变色 */
}
```

### 如何修改文案

所有文案都在 `docs/index.html` 中，按区块注释（`Hero`、`产品介绍`、`核心功能`、`安装步骤`）定位即可。

## License

MIT
