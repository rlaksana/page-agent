import type { LLMConfig } from '@page-agent/llms'
import { describe, expect, it } from 'vitest'

import { migrateMaxRetries } from './constants'

const baseConfig: LLMConfig = {
	baseURL: 'https://example.com/v1',
	model: 'some-model',
	apiKey: 'sk-test',
}

describe('migrateMaxRetries', () => {
	it('returns the same reference when maxRetries is undefined', () => {
		const input: LLMConfig = { ...baseConfig }
		expect(migrateMaxRetries(input)).toBe(input)
	})

	it('returns the same reference when maxRetries >= 10', () => {
		const cases: Exclude<LLMConfig['maxRetries'], undefined>[] = [10, 15, 50]
		for (const value of cases) {
			const input: LLMConfig = { ...baseConfig, maxRetries: value }
			expect(migrateMaxRetries(input)).toBe(input)
		}
	})

	it('strips maxRetries when it is below 10', () => {
		const cases: Exclude<LLMConfig['maxRetries'], undefined>[] = [0, 1, 2, 5, 9]
		for (const value of cases) {
			const input: LLMConfig = { ...baseConfig, maxRetries: value }
			const result = migrateMaxRetries(input)
			expect(result).not.toBe(input)
			expect(result).not.toHaveProperty('maxRetries')
			expect(result.baseURL).toBe(baseConfig.baseURL)
			expect(result.model).toBe(baseConfig.model)
			expect(result.apiKey).toBe(baseConfig.apiKey)
		}
	})

	it('does not mutate the input object', () => {
		const input: LLMConfig = { ...baseConfig, maxRetries: 2 }
		const snapshot = { ...input }
		migrateMaxRetries(input)
		expect(input).toEqual(snapshot)
	})
})
