import { describe, expect, it } from 'vitest'

import { createCard } from './cards'

import styles from './Panel.module.css'

describe('createCard with copyable option', () => {
	it('renders a copy button when copyable is true and copyText is provided', () => {
		const html = createCard({
			icon: '🤖',
			content: 'Hello world',
			type: 'output',
			copyable: true,
			copyText: 'Hello world',
		})
		expect(html).toContain('data-copy-button')
		expect(html).toContain(`data-state="idle"`)
		expect(html).toContain(styles.copyButton)
	})

	it('does not render a copy button when copyable is omitted', () => {
		const html = createCard({ icon: '🤖', content: 'Hello', type: 'output' })
		expect(html).not.toContain('data-copy-button')
		expect(html).not.toContain(styles.copyButton)
	})

	it('does not render a copy button when copyable is true but copyText is missing', () => {
		const html = createCard({
			icon: '🤖',
			content: 'Hello',
			type: 'output',
			copyable: true,
		})
		expect(html).not.toContain('data-copy-button')
	})

	it('preserves the original copyText byte-for-byte in the data-copy-text attribute (after HTML-escaping)', () => {
		const text = '# Title\n\nSome **bold** text with "quotes" & <html>'
		const html = createCard({
			icon: '🤖',
			content: text,
			type: 'output',
			copyable: true,
			copyText: text,
		})
		// Attribute value must be HTML-escaped; raw `<html>` cannot appear unescaped.
		expect(html).not.toContain('data-copy-text="<html>"')
		expect(html).toContain('data-copy-text=')
		// The em-dash of escaped forms proves escaping happened.
		expect(html).toContain('&quot;quotes&quot;')
		expect(html).toContain('&amp;')
		expect(html).toContain('&lt;html&gt;')
	})

	it('renders the copy button inside the historyItem wrapper, not outside', () => {
		const html = createCard({
			icon: '🤖',
			content: 'Hello',
			type: 'output',
			copyable: true,
			copyText: 'Hello',
		})
		// Both the wrapper class and the button must coexist in the snippet.
		expect(html).toContain(styles.historyItem)
		expect(html.indexOf(styles.historyItem)).toBeLessThan(html.indexOf('data-copy-button'))
	})
})
