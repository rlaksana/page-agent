import { describe, expect, it } from 'vitest'

import { isHostBlocked, isSensitiveActionText, parseBlockedSites } from './guards'

describe('parseBlockedSites', () => {
	it('splits on newlines, commas, and spaces; lowercases; keeps host only', () => {
		expect(parseBlockedSites('Bank.com\nhttps://shop.example.com/cart, foo.dev bar.org')).toEqual([
			'bank.com',
			'shop.example.com',
			'foo.dev',
			'bar.org',
		])
	})

	it('returns empty for undefined or blank input', () => {
		expect(parseBlockedSites(undefined)).toEqual([])
		expect(parseBlockedSites('  \n  ')).toEqual([])
		expect(parseBlockedSites(['a.com', ''])).toEqual(['a.com'])
	})
})

describe('isHostBlocked', () => {
	const blocked = ['bank.com', 'shop.example.com']

	it('blocks exact hosts and subdomains', () => {
		expect(isHostBlocked('https://bank.com/login', blocked)).toBe(true)
		expect(isHostBlocked('https://secure.bank.com/x', blocked)).toBe(true)
		expect(isHostBlocked('https://shop.example.com/p/1', blocked)).toBe(true)
	})

	it('ignores hosts that merely contain the blocked string', () => {
		expect(isHostBlocked('https://bank.com.evil.io/', blocked)).toBe(false)
		expect(isHostBlocked('https://notbank.com/', blocked)).toBe(false)
	})

	it('allows unlisted hosts and is safe on invalid URLs', () => {
		expect(isHostBlocked('https://example.com/', blocked)).toBe(false)
		expect(isHostBlocked('not a url', blocked)).toBe(false)
		expect(isHostBlocked('', [])).toBe(false)
	})
})

describe('isSensitiveActionText', () => {
	it('matches sensitive keywords on word boundaries, case-insensitively', () => {
		expect(isSensitiveActionText('Pay now')).toBe(true)
		expect(isSensitiveActionText('CONFIRM ORDER')).toBe(true)
		expect(isSensitiveActionText('Delete account')).toBe(true)
	})

	it('does not match substrings inside unrelated words', () => {
		expect(isSensitiveActionText('Papaya salad')).toBe(false)
		expect(isSensitiveActionText('Read the documentation')).toBe(false)
	})
})
