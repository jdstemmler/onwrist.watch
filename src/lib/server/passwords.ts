import argon2 from 'argon2';
import list from './passwords-10k.txt?raw';

const COMMON = new Set(list.split('\n').map((l) => l.trim()).filter(Boolean));

export function emailKey(raw: string): string {
	return raw.trim().toLowerCase();
}

// Minimal-but-real check: one local part, one @, a domain with at least one
// dot, no whitespace anywhere. Not RFC 5322 — just enough to reject garbage
// before it touches the DB or a rate-limit key.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** null = valid. A format error is never account-existence-dependent, so
 * it's safe to report distinctly — it isn't an enumeration channel. */
export function emailFormatError(email: string): string | null {
	const trimmed = email.trim();
	if (!trimmed || /\s/.test(trimmed) || !EMAIL_RE.test(trimmed)) return 'Enter a valid email';
	return null;
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
