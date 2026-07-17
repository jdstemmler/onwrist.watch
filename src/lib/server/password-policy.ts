import list from './passwords-10k.txt?raw';

const COMMON = new Set(list.split('\n').map((l) => l.trim()).filter(Boolean));

export function passwordPolicyError(pw: string): string | null {
	if (pw.length < 10) return 'Password must be at least 10 characters';
	if (COMMON.has(pw)) return 'That password is too common — pick something less guessable';
	return null;
}
