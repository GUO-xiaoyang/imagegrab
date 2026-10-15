/**
 * 测试用 manifest：在原始 manifest 基础上，额外允许注入 http://localhost:8765/*
 * 目的：让内容脚本能在本地模拟详情页上真实生效，从而验证「注入按钮 → 提取 → 画廊」全链路。
 * 该文件仅用于本地测试，不参与扩展正式交付。
 */
const TEST_HOST = 'http://localhost:8765/*';

const base = require('../manifest.json');

const testManifest = {
  ...base,
  version: '1.0.0',
  content_scripts: base.content_scripts.map((cs) => ({
    ...cs,
    matches: [...cs.matches, TEST_HOST]
  })),
  host_permissions: [...base.host_permissions, 'http://localhost:8765/*']
};

console.log(JSON.stringify(testManifest, null, 2));
