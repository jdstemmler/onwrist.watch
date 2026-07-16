import argon2 from 'argon2';
import list from './passwords-10k.txt?raw';

const COMMON = new Set(list.split('\n').map((l) => l.trim()).filter(Boolean));

export function emailKey(raw: string): string {
	return raw.trim().toLowerCase();
}

export function passwordPolicyError(pw: string): string | null {
	if (pw.length < 10) return 'Password must be at least 10 characters';
	if (COMMON.has(pw)) return 'That password is too common — pick something less guessable';
	return null;
}

const PARAMS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(pw: string): Promise<string> {
	return argon2.hash(pw, PARAMS);
}

export async function verifyPasswordHash(hash: string, pw: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, pw);
	} catch {
		return false;
	}
}
