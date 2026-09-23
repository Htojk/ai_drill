import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;

/**
 * scrypt 参数：N=16384 / r=8 / p=1（约 16MB 内存、几十毫秒）。
 * 自用场景下这点开销完全可接受，换来的是口令即使连同哈希一起泄露也难离线爆破。
 */
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return { salt, hash: derived.toString("hex") };
}

export async function verifyPassword(password, salt, hash) {
  if (typeof password !== "string" || !salt || !hash) return false;
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
