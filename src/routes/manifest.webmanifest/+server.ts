import { json, type RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/server/config';

// Served dynamically (instead of a static file) so the PWA identity follows
// the APP_NAME env var — a future rename is an env edit, not a code change.
export const GET: RequestHandler = async () =>
	json(
		{
			name: config.appName,
			short_name: config.appName,
			start_url: '/log',
			display: 'standalone',
			background_color: '#131614',
			theme_color: '#131614',
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
			]
		},
		{ headers: { 'content-type': 'application/manifest+json' } }
	);
