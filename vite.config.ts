import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		passWithNoTests: true
	}
}) as ReturnType<typeof defineVitestConfig>;
