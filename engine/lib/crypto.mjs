// AES-256-GCM with a PBKDF2-SHA256 key, in the same format the web app decrypts with WebCrypto:
// { v, salt, iv, ct } all base64; ct is ciphertext followed by the 16-byte GCM tag.
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

export const ITERATIONS = 210000;

export function encryptJson(obj, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return {
    v: 1,
    alg: "AES-256-GCM/PBKDF2-SHA256",
    iter: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
  };
}
