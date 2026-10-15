/**
 * 生成 CRX3 签名的扩展包与更新清单，用于通过企业策略强制安装本地扩展。
 * 背景：Chrome 137+ 已移除 --load-extension 加载未打包扩展的能力，
 *       本地端到端验证需走「签名 CRX + ExtensionInstallForcelist 策略」。
 *
 * CRX3 结构：
 *   "Cr24" | uint32 version=3 | uint32 headerLen | CrxFileHeader | zip
 *   CrxFileHeader { repeated AsymmetricKeyProof sha256_with_rsa = 2; bytes signed_header_data = 10000 }
 *   签名内容 = "CRX3 SignedData\0" + signed_header_data + zip
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT_DIR = process.env.TEMP + '\\imagegrab-test-ext';
const OUT_DIR = process.env.TEMP + '\\imagegrab-crx';
const KEY_FILE = path.join(OUT_DIR, 'key.pem');
const CRX_PATH = path.join(OUT_DIR, 'imagegrab.crx');
const PORT = Number(process.env.CRX_PORT || 8765);
const EXT_VERSION = '1.0.0';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// protobuf 最小编码工具
// ---------------------------------------------------------------------------
function varint(n) {
  const out = [];
  let v = n >>> 0;
  while (v > 127) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return Buffer.from(out);
}
function bytesField(field, buf) {
  return Buffer.concat([varint((field << 3) | 2), varint(buf.length), buf]);
}

// ---------------------------------------------------------------------------
// 1. 密钥与扩展 ID
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

const digest = crypto.createHash('sha256').update(pubDer).digest();
const crxId = digest.subarray(0, 16);
const extId = [...crxId]
  .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0xf)))
  .join('');
console.log('EXT_ID=' + extId);

// ---------------------------------------------------------------------------
// 2. 读取预先生成的 zip
// ---------------------------------------------------------------------------
const zipPath = path.join(OUT_DIR, 'extension.zip');
if (!fs.existsSync(zipPath)) {
  console.error('缺少 extension.zip');
  process.exit(1);
}
const zipBuf = fs.readFileSync(zipPath);
console.log('zip 大小: ' + zipBuf.length + ' 字节');

// ---------------------------------------------------------------------------
// 3. 组装 CRX3
// ---------------------------------------------------------------------------
// SignedData { bytes crx_id = 1; } —— crx_id 留空，Chrome 以公钥推导 ID
const signedData = Buffer.alloc(0);

// AsymmetricKeyProof { bytes public_key = 1; bytes signature = 2; }
const signPayload = Buffer.concat([
  Buffer.from('CRX3 SignedData\x00', 'binary'),
  signedData,
  zipBuf
]);
const signature = crypto.sign('sha256', signPayload, privateKey);
const proof = Buffer.concat([bytesField(1, pubDer), bytesField(2, signature)]);

// CrxFileHeader { sha256_with_rsa = 2; signed_header_data = 10000 }
const header = Buffer.concat([bytesField(2, proof), bytesField(10000, signedData)]);

const headerLenBuf = Buffer.alloc(4);
headerLenBuf.writeUInt32LE(header.length, 0);
const versionBuf = Buffer.alloc(4);
versionBuf.writeUInt32LE(3, 0);

const crx = Buffer.concat([
  Buffer.from('Cr24', 'binary'),
  versionBuf,
  headerLenBuf,
  header,
  zipBuf
]);
fs.writeFileSync(CRX_PATH, crx);
console.log('CRX 已生成: ' + CRX_PATH + ' (' + crx.length + ' 字节)');

// ---------------------------------------------------------------------------
// 4. 更新清单
// ---------------------------------------------------------------------------
const updateXml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${extId}'>
    <updatecheck codebase='http://localhost:${PORT}/imagegrab.crx' version='${EXT_VERSION}' />
  </app>
</gupdate>
`;
fs.writeFileSync(path.join(OUT_DIR, 'update.xml'), updateXml, 'utf8');
console.log('update.xml 已生成');

// ---------------------------------------------------------------------------
// 5. 结果
// ---------------------------------------------------------------------------
const result = {
  extId,
  crxPath: CRX_PATH,
  updateUrl: `http://localhost:${PORT}/update.xml`,
  pubDerB64: pubDer.toString('base64')
};
fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
console.log('RESULT=' + JSON.stringify({ extId, updateUrl: result.updateUrl }));
