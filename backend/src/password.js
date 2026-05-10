import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

/**
 * @param {string} password
 * @returns {string} salt:hash 十六进制
 */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * @param {string} password
 * @param {string} stored
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const idx = stored.indexOf(":");
  const saltHex = stored.slice(0, idx);
  const hashHex = stored.slice(idx + 1);
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  let actual;
  try {
    actual = scryptSync(String(password), salt, KEYLEN);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
