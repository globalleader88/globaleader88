import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '@/env';
import { assertKeyBelongsToOrg } from './keys';

/**
 * Storage abstraction. Two drivers:
 *   - S3 driver (STORAGE_DRIVER=s3|minio): private bucket, SSE-KMS at rest,
 *     short-lived presigned URLs for upload/download.
 *   - Local driver (STORAGE_DRIVER=local): filesystem, dev only. Upload/
 *     download go through authenticated app routes instead of presigned URLs.
 *
 * All keys are produced server-side (see keys.ts) and validated against the
 * organization prefix before any URL is issued.
 */

export interface PresignedUpload {
  method: 'PUT' | 'POST';
  url: string;
  headers: Record<string, string>;
  key: string;
  expiresInSeconds: number;
}

export interface StorageDriver {
  readonly name: string;
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
  presignDownload(key: string, fileName: string): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// S3 / MinIO
// ---------------------------------------------------------------------------

class S3Driver implements StorageDriver {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.AWS_REGION,
      ...(env.S3_ENDPOINT
        ? { endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE }
        : {}),
    });
  }

  private sseHeaders(): Record<string, string> {
    // Server-side encryption with KMS. In production AWS_KMS_KEY_ID is required
    // (enforced by the env validator).
    if (env.AWS_KMS_KEY_ID) {
      return {
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': env.AWS_KMS_KEY_ID,
      };
    }
    return { 'x-amz-server-side-encryption': 'AES256' };
  }

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    const ServerSideEncryption = env.AWS_KMS_KEY_ID ? 'aws:kms' : 'AES256';
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption,
      ...(env.AWS_KMS_KEY_ID ? { SSEKMSKeyId: env.AWS_KMS_KEY_ID } : {}),
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: env.PRESIGNED_URL_EXPIRATION_SECONDS,
    });
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': contentType, ...this.sseHeaders() },
      key,
      expiresInSeconds: env.PRESIGNED_URL_EXPIRATION_SECONDS,
    };
  }

  async presignDownload(key: string, fileName: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: env.PRESIGNED_URL_EXPIRATION_SECONDS,
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error('Empty object body');
    return Buffer.from(bytes);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: env.AWS_KMS_KEY_ID ? 'aws:kms' : 'AES256',
        ...(env.AWS_KMS_KEY_ID ? { SSEKMSKeyId: env.AWS_KMS_KEY_ID } : {}),
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
  }
}

// ---------------------------------------------------------------------------
// Local filesystem (dev only)
// ---------------------------------------------------------------------------

class LocalDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);
  }

  private resolveSafe(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error('Path traversal detected');
    }
    return full;
  }

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    // Local uploads flow through the authenticated app route, which validates
    // the caller and writes via putObject.
    return {
      method: 'PUT',
      url: `/api/dev-storage/${encodeURIComponent(key)}`,
      headers: { 'Content-Type': contentType },
      key,
      expiresInSeconds: env.PRESIGNED_URL_EXPIRATION_SECONDS,
    };
  }

  async presignDownload(key: string): Promise<string> {
    return `/api/dev-storage/${encodeURIComponent(key)}`;
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveSafe(key));
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const full = this.resolveSafe(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(key));
    } catch {
      /* already gone */
    }
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = env.STORAGE_DRIVER === 'local' ? new LocalDriver() : new S3Driver();
  return driver;
}

/** Org-scoped download URL: validates the key belongs to the org first. */
export async function presignOrgDownload(
  organizationId: string,
  key: string,
  fileName: string,
): Promise<string> {
  assertKeyBelongsToOrg(key, organizationId);
  return getStorage().presignDownload(key, fileName);
}

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
