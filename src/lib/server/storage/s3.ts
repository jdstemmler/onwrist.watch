import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command
} from '@aws-sdk/client-s3';
import type { PhotoStorage } from './index';

export type S3Config = {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
};

function isNotFound(e: unknown): boolean {
	if (typeof e !== 'object' || e === null) return false;
	const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
	return err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
}

/** S3-compatible PhotoStorage (Backblaze B2, Cloudflare R2, MinIO, AWS).
 * Same contract as the fs driver: `get` of a missing key is null, `delete`
 * of a missing key is a no-op (S3 deletes are idempotent), `sizeOfPrefix`
 * sums object sizes under the key prefix. The bucket must be private — the
 * app is its only reader; tenancy is enforced by the photo route, and a
 * public bucket would bypass it. */
export function createS3Storage(cfg: S3Config): PhotoStorage {
	const client = new S3Client({
		endpoint: cfg.endpoint,
		region: cfg.region,
		credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
		// Bucket-in-path addressing works across all S3-compatible providers;
		// virtual-hosted style needs per-provider DNS that B2/MinIO lack.
		forcePathStyle: true
	});

	return {
		kind: 's3',

		async put(key, data) {
			await client.send(
				new PutObjectCommand({
					Bucket: cfg.bucket,
					Key: key,
					Body: data,
					ContentType: key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream'
				})
			);
		},

		async get(key) {
			try {
				const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
				return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
			} catch (e) {
				if (isNotFound(e)) return null;
				throw e;
			}
		},

		async delete(key) {
			await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
		},

		async sizeOfPrefix(prefix) {
			let total = 0;
			let token: string | undefined;
			do {
				const res = await client.send(
					new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token })
				);
				for (const obj of res.Contents ?? []) total += obj.Size ?? 0;
				token = res.IsTruncated ? res.NextContinuationToken : undefined;
			} while (token);
			return total;
		}
	};
}
