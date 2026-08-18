import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

function getAesKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, 'MISSING_ENV', 'JWT_SECRET nao configurada.');
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt a token at rest (aes-256-gcm, keyed with JWT_SECRET). Format: `iv:tag:ciphertext`. */
export function encryptToken(token: string): string {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt a token stored with encryptToken (aes-256-gcm, keyed with JWT_SECRET). */
export function decryptToken(encryptedPayload: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || encryptedHex === undefined) {
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Formato de token criptografado invalido.');
  }
  try {
    const key = getAesKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Falha ao descriptografar token.');
  }
}

/** Decrypt a Meta access token stored in the DB (aes-256-gcm, keyed with JWT_SECRET). */
export function decryptMetaToken(encryptedPayload: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Formato de token criptografado invalido.');
  }
  try {
    const key = getAesKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Falha ao descriptografar token Meta.');
  }
}
