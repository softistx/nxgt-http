// The module from `src`, as the specs test it; `dist` is checked by
// verify:artifacts.
export default defineNuxtConfig({
	modules: ['../../src/module'],
	openapi: {
		server: 'server/app.ts',
		operations: '../generated/operations.ts',
	},
	compatibilityDate: '2026-09-01',
	devtools: { enabled: false },
	telemetry: false,
});
