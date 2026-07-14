import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'extension',
		include: ['src/**/*.test.ts'],
		// Scaffolded package — Task 2 will add the first real test file.
		// Avoid breaking the root `npm test` workspace sweep while still empty.
		passWithNoTests: true,
		// Suppress console output from passing tests; failed tests still get their logs.
		silent: 'passed-only',
	},
})
