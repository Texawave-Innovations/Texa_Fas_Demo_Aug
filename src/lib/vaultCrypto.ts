// src/lib/vaultCrypto.ts
// Client-side AES-256-GCM encryption for restricted Vault documents — the
// browser encrypts the file before it ever reaches Cloudinary, so the stored
// object is ciphertext, not the drawing itself. The key travels with the
// document's Firebase record and is only shown to the UI once an approver
// grants access (see modules/vault/vaultAccess.ts for that gate).
//
// Caveat: this app has no Firebase Security Rules yet, so the key node in
// the database is not server-enforced — it's a UI-level gate, same honesty
// level as the rest of the app's RBAC. Encryption of the file bytes is real;
// access control around the key is not yet backed by a security rule.

const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromBase64 = (b64: string): ArrayBuffer => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

export interface EncryptedPayload {
  blob: Blob;
  keyB64: string;
  ivB64: string;
}

export const encryptFile = async (file: File): Promise<EncryptedPayload> => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer);
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return {
    blob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    keyB64: toBase64(rawKey),
    ivB64: toBase64(iv.buffer),
  };
};

export const decryptToBlob = async (
  ciphertext: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mimeType: string,
): Promise<Blob> => {
  const key = await crypto.subtle.importKey('raw', fromBase64(keyB64), 'AES-GCM', false, ['decrypt']);
  const iv = new Uint8Array(fromBase64(ivB64));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Blob([plaintext], { type: mimeType || 'application/octet-stream' });
};
