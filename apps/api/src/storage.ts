import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

export interface StoredFile {
  body: Readable;
  contentType?: string;
}

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error('Invalid key');
    return p;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    await fs.writeFile(`${p}.meta`, JSON.stringify({ contentType }));
  }
  async get(key: string) {
    const p = this.resolve(key);
    try {
      const data = await fs.readFile(p);
      let contentType: string | undefined;
      try {
        contentType = JSON.parse(await fs.readFile(`${p}.meta`, 'utf8')).contentType;
      } catch {
        /* no metadata */
      }
      return { body: Readable.from(data), contentType };
    } catch {
      return null;
    }
  }
}

/** S3-compatible storage: MinIO locally, AWS S3 or Cloudflare R2 in production. */
class S3Storage implements Storage {
  private client: S3Client;
  constructor() {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY && env.S3_SECRET_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
          : undefined,
    });
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: data, ContentType: contentType }),
    );
  }
  async get(key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { body: out.Body as Readable, contentType: out.ContentType };
    } catch {
      return null;
    }
  }
}

export const storage: Storage =
  env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage(env.UPLOAD_DIR);
