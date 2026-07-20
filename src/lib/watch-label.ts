// Pure display helpers shared by server code and components (no server-only
// imports here — components can't reach into $lib/server).

/** Canonical display name for a watch: nickname, else brand + model. */
export function watchLabel(w: { nickname: string | null; brand: string; model: string }): string {
	return w.nickname ?? `${w.brand} ${w.model}`;
}

/** URL a stored photo key is served from (see routes/photos/[...path]). */
export function photoUrl(filePath: string): string {
	return `/photos/${filePath}`;
}
