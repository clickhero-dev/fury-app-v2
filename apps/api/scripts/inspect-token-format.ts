import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const rows = await sql`
    SELECT access_token, length(access_token) as len,
           left(access_token, 40) as prefix,
           right(access_token, 40) as suffix
    FROM meta_connections
    WHERE tenant_id = '25f4ed8e-5876-426b-ac02-3236122e081b'
    ORDER BY created_at DESC LIMIT 1
  `;
  const row = rows[0];
  console.log('Token length:', row.len);
  console.log('Prefix:', row.prefix);
  console.log('Suffix:', row.suffix);

  // Tentar diferentes formatos
  const token = row.access_token as string;

  // Formato 1: iv:authTag:encrypted (hex)
  const parts = token.split(':');
  console.log('Parts count:', parts.length);
  if (parts.length >= 3) {
    console.log('Part 1 (iv?) length:', parts[0].length, 'hex?', /^[0-9a-f]+$/i.test(parts[0]));
    console.log('Part 2 (authTag?) length:', parts[1].length, 'hex?', /^[0-9a-f]+$/i.test(parts[1]));
    console.log('Part 3 (encrypted?) length:', parts[2].length, 'hex?', /^[0-9a-f]+$/i.test(parts[2]));
  }

  // Tentar base64
  try {
    const decoded = Buffer.from(token, 'base64');
    console.log('\nBase64 decode attempt:', decoded.slice(0, 20).toString('hex'));
  } catch {}

  // Verificar se é AES-256-GCM com SHA256(JWT_SECRET)
  const secret = process.env.JWT_SECRET!;
  console.log('\nJWT_SECRET length:', secret.length);
  
  const key = crypto.createHash('sha256').update(secret).digest();
  console.log('Derived key length:', key.length, 'first bytes:', key.slice(0, 4).toString('hex'));

  // Tentar descriptografar com as 3 partes
  if (parts.length >= 3) {
    try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parts[2], 'hex')),
      decipher.final(),
    ]);
    console.log('\nDECRYPTED (GCM hex):', decrypted.toString('utf8').slice(0, 20));
    } catch(e: any) {
      console.log('\nGCM hex failed:', e.message);
    }
  }

  // Talvez seja base64(iv):base64(authTag):base64(encrypted)
  if (parts.length >= 3) {
    try {
    const decipher2 = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
    decipher2.setAuthTag(Buffer.from(parts[1], 'base64'));
    const decrypted2 = Buffer.concat([
      decipher2.update(Buffer.from(parts[2], 'base64')),
      decipher2.final(),
    ]);
    console.log('DECRYPTED (GCM base64):', decrypted2.toString('utf8').slice(0, 20));
    } catch(e: any) {
      console.log('GCM base64 failed:', e.message);
    }
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
