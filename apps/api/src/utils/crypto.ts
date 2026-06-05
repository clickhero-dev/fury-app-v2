import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

function getAesKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, 'MISSING_ENV', 'JWT_SECRET nao configurada.');
  return crypto.createHash('sha256').update(secret).digest();
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
