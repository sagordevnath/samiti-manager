/**
 * ── Field-level encryption for member identity numbers ──────────────────────
 * AES-256-GCM for storage, HMAC-SHA256 for exact-match duplicate search.
 * Master key comes from env (MEMBER_ENC_KEY, base64 or passphrase); per-org
 * subkeys are derived with HKDF so compromise of one org's key material does
 * not expose another's. Ciphertext format: v1.<iv>.<tag>.<ct> (all base64url).
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const MASTER = env.MEMBER_ENC_KEY;
const SALT_INFO_PREFIX = 'samity-member-id:v1:';

/** Deterministic 32-byte subkey per org (HKDF-SHA256). */
function orgKey(orgId: string): Buffer {
  const derived = hkdfSync('sha256', MASTER, Buffer.from('samity-member-enc'), Buffer.from(SALT_INFO_PREFIX + orgId), 32);
  return Buffer.from(derived);
}

/** Encrypt plaintext → `v1.<iv>.<tag>.<ct>` (base64url segments). */
export function encryptIdNumber(plain: string, orgId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', orgKey(orgId), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64u = (b: Buffer) => b.toString('base64url');
  return `v1.${b64u(iv)}.${b64u(tag)}.${b64u(ct)}`;
}

/** Decrypt a `v1.<iv>.<tag>.<ct>` ciphertext (service-role use only). */
export function decryptIdNumber(enc: string, orgId: string): string {
  const [, ivB, tagB, ctB] = enc.split('.');
  if (!ivB || !tagB || !ctB) throw new Error('bad ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', orgKey(orgId), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * Blind index for duplicate search: HMAC-SHA256 of the normalized id with a
 * per-org key. Deterministic, non-reversible, indexable.
 */
export function idSearchHash(raw: string, orgId: string): string {
  const normalized = raw.replace(/\D/g, '');
  return createHmac('sha256', orgKey(`${orgId}:idx`)).update(normalized).digest('base64');
}

/** Mask an identity number for display: keep the last 4 digits only. */
export function maskIdNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `••••••${digits.slice(-4)}`;
}

/** Mask a mobile number: 01712••••78 style. */
export function maskMobile(raw: string): string {
  return raw.length >= 11 ? `${raw.slice(0, 5)}••••${raw.slice(-2)}` : '••••••';
}
