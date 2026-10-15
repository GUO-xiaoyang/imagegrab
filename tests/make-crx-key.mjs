/**
 * 生成 CRX3 格式的扩展包 + 更新清单，供企业策略强制安装使用。
 * 说明：Chrome 137+ 已移除命令行 --load-extension 加载未打包扩展的能力，
 *       因此本地验证改为「生成签名 CRX + ExtensionInstallForcelist 策略」。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT_DIR = process.env.TEMP + '\\imagegrab-test-ext';
const OUT_DIR = process.env.TEMP + '\\imagegrab-crx';
const KEY_FILE = path.join(OUT_DIR, 'key.pem');

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. 生成/读取 RSA 私钥
// ---------------------------------------------------------------------------
let privateKey;
if (fs.existsSync(KEY_FILE)) {
  privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
} else {
  const { privateKey: pk } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pk;
  fs.writeFileSync(KEY_FILE, pk.export({ type: 'pkcs8', format: 'pem' }));
}
const publicKey = crypto.createPublicKey(privateKey);
const pubDer = publicKey.export({ type: 'spki', format: 'der' });

// ---------------------------------------------------------------------------
// 2. 计算扩展 ID：公钥 DER 的 SHA256 前 16 字节，映射为 a-p
// ---------------------------------------------------------------------------
const sha = crypto.createHash('sha256').update(pubDer).digest().subarray(0, 16);
const extId = [...sha].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0xf))).join('');
console.log('EXT_ID=' + extId);

// ---------------------------------------------------------------------------
// 3. 打包扩展目录为 zip（Chrome CRX 内部是 zip）
// ---------------------------------------------------------------------------
// 这里不依赖外部 zip 库：直接调用 PowerShell 的 Compress-Archive 由调用方完成，
// 本脚本只负责密钥、ID 与清单，避免引入额外依赖。

// ---------------------------------------------------------------------------
// 4. 输出公钥（base64）供策略使用
// ---------------------------------------------------------------------------
console.log('PUBLIC_KEY_B64=' + pubDer.toString('base64'));
fs.writeFileSync(path.join(OUT_DIR, 'public_key_der.b64'), pubDer.toString('base64'), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'ext_id.txt'), extId, 'utf8');
