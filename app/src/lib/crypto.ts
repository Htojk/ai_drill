/**
 * 进度码口令加密：PBKDF2(SHA-256) 派生密钥 + AES-GCM 认证加密。
 * 纯 WebCrypto，无第三方依赖；浏览器与 Node（vitest）都能跑。
 *
 * 格式：AQ1.<base64 salt>.<base64 iv>.<base64 密文>
 * 未加密的进度码是纯 base64，前缀能一眼区分开（见 isEncrypted）。
 */
const MAGIC = "AQ1.";
const ITERATIONS = 150_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export const MIN_PASSPHRASE_LENGTH = 6;

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** WebCrypto 的参数类型是 ArrayBuffer，而 Uint8Array 在 TS 里未必收窄到 ArrayBuffer，这里显式转换。 */
function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asBuffer(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** 判断一段进度码是不是加密过的。 */
export function isEncrypted(code: string): boolean {
  return code.trim().startsWith(MAGIC);
}

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `口令至少 ${MIN_PASSPHRASE_LENGTH} 位（口令太短容易被穷举）`;
  }
  return null;
}

export async function encryptProgressCode(code: string, passphrase: string): Promise<string> {
  const invalid = checkPassphrase(passphrase);
  if (invalid) throw new Error(invalid);

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(iv) },
    key,
    new TextEncoder().encode(code)
  );
  return MAGIC + [salt, iv, new Uint8Array(ciphertext)].map(toBase64).join(".");
}

/** 解密失败一律抛「口令不对或进度码损坏」，不区分具体原因，避免泄露信息。 */
export async function decryptProgressCode(payload: string, passphrase: string): Promise<string> {
  if (!isEncrypted(payload)) throw new Error("这不是加密进度码");
  const parts = payload.trim().slice(MAGIC.length).split(".");
  if (parts.length !== 3) throw new Error("进度码格式不正确");

  const [salt, iv, ciphertext] = parts.map(fromBase64);
  const key = await deriveKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, asBuffer(ciphertext));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("口令不对，或进度码已损坏");
  }
}
