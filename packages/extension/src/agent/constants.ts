import type { LLMConfig } from '@page-agent/llms'

// Demo LLM for testing
export const DEMO_MODEL = 'qwen3.5-plus'
export const DEMO_BASE_URL = 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run'
// export const DEMO_API_KEY = 'NA'

export const DEMO_CONFIG: LLMConfig = {
	baseURL: DEMO_BASE_URL,
	model: DEMO_MODEL,
	// apiKey: DEMO_API_KEY,
}

/** Legacy testing endpoints that should be auto-migrated to DEMO_BASE_URL */
export const LEGACY_TESTING_ENDPOINTS = [
	'https://hwcxiuzfylggtcktqgij.supabase.co/functions/v1/llm-testing-proxy',
]

export function isTestingEndpoint(url: string): boolean {
	const normalized = url.replace(/\/+$/, '')
	return normalized === DEMO_BASE_URL || LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)
}

export function migrateLegacyEndpoint(config: LLMConfig): LLMConfig {
	const normalized = config.baseURL.replace(/\/+$/, '')
	if (LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)) {
		return { ...DEMO_CONFIG }
	}
	return config
}

// Matches library default in packages/llms/src/index.ts:104.
// Bump in lockstep with the library default and extend this helper if the
// library default changes again.
const MAX_RETRIES_TARGET = 10

/**
 * Strip a stale `maxRetries` value (< MAX_RETRIES_TARGET) stored on the
 * LLMConfig so the value falls back to the library default. Pure function:
 * returns the same object reference when no migration is needed, a new
 * object without the field otherwise.
 */
export function migrateMaxRetries(config: LLMConfig): LLMConfig {
	if (config.maxRetries === undefined || config.maxRetries >= MAX_RETRIES_TARGET) {
		return config
	}
	const { maxRetries: _drop, ...rest } = config
	void _drop
	return rest as LLMConfig
}
