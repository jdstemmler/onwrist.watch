// savePhoto and other write-path helpers land in Task 10 — this file
// currently holds only the URL helper needed by the dashboard shell.

export function photoUrl(filePath: string): string {
	return `/photos/${filePath}`;
}
