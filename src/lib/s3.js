import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export function isS3Configured() {
  return Boolean(
    process.env.AWS_REGION
      && process.env.AWS_ACCESS_KEY_ID
      && process.env.AWS_SECRET_ACCESS_KEY
      && process.env.S3_BUCKET_NAME,
  );
}

export function describeStorageError(error) {
  const name = String(error?.name || error?.Code || '');
  const message = String(error?.message || '');
  if (/not configured|missing aws env/i.test(message)) {
    return 'File storage is not configured on the server. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME.';
  }
  if (
    name === 'InvalidAccessKeyId'
    || name === 'InvalidClientTokenId'
    || /access key id you provided does not exist/i.test(message)
  ) {
    return 'File storage credentials are invalid. Update AWS keys on the server.';
  }
  if (name === 'AccessDenied' || /access denied/i.test(message)) {
    return 'File storage access denied. Check IAM permissions on the S3 bucket.';
  }
  return message || 'File storage request failed';
}

function getClient() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 180);
}

export function buildS3ObjectPublicUrl(bucket, region, key) {
  const encKey = key.split('/').map(encodeURIComponent).join('/');
  return `https://${bucket}.s3.${region}.amazonaws.com/${encKey}`;
}

/**
 * Server-side upload under internship-portal/ prefix (shared bucket OK with CPMU).
 * @param {{ keyPrefix: string, fileName: string, contentType: string, body: Buffer | Uint8Array }} opts
 */
export async function uploadIpBuffer({ keyPrefix, fileName, contentType, body }) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured (missing AWS env vars).');
  }
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  const safe = sanitizeFilename(fileName);
  const key = `${String(keyPrefix || 'ip').replace(/^\/+|\/+$/g, '')}/${randomUUID()}-${safe}`;
  const resolvedType = contentType || 'application/octet-stream';

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: resolvedType,
    }),
  );

  return {
    fileUrl: `/api/ip/files?key=${encodeURIComponent(key)}`,
    key,
    bucket,
    contentType: resolvedType,
  };
}

export async function getIpObject(key) {
  if (!isS3Configured()) throw new Error('S3 is not configured (missing AWS env vars).');
  if (!String(key).startsWith('internship-portal/')) throw new Error('Invalid file key');
  return getClient().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }));
}
