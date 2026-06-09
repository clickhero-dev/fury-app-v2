import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = 'fury-studio-assets';
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

export async function uploadAsset(buffer: Buffer, fileName: string, mimeType = 'image/png'): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `${PUBLIC_URL}/${fileName}`;
}
