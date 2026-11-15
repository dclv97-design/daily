/* Decrypts the engine's AES-256-GCM / PBKDF2-SHA256 files, and creates VAPID keys for push. */
(function () {
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bytesToB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function decryptJson(enc, passphrase) {
    const pass = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(enc.salt), iterations: enc.iter || 210000, hash: "SHA-256" },
      pass,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(enc.iv) }, key, b64ToBytes(enc.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function makeVapidKeys() {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    return { publicKey: bytesToB64url(pub), privateKey: jwk.d };
  }

  function b64urlToBytes(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    return b64ToBytes((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  }

  window.Crypt = { decryptJson, makeVapidKeys, b64urlToBytes };
})();
