/**
 * Card HTML generation utilities for Panel
 */
import { escapeHtml } from '../utils'

import styles from './Panel.module.css'

type CardType = 'default' | 'input' | 'output' | 'question' | 'observation'

interface CardOptions {
	icon: string
	content: string | string[]
	meta?: string
	type?: CardType
	/** When true, render a copy button inside the card. Requires `copyText`. */
	copyable?: boolean
	/** Raw text copied to the clipboard when the copy button is clicked. */
	copyText?: string
}

/** Create a single history card */
export function createCard({ icon, content, meta, type, copyable, copyText }: CardOptions): string {
	const typeClass = type ? styles[type] : ''
	const contentHtml = Array.isArray(content)
		? `<div class="${styles.reflectionLines}">${content.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>`
		: `<span>${escapeHtml(content)}</span>`

	// Render copy button only when caller explicitly opts in AND supplies text.
	// The handler reads `data-copy-text` from the rendered DOM at click time.
	const copyButtonHtml =
		copyable && typeof copyText === 'string'
			? `<button type="button" class="${styles.copyButton}" data-copy-button data-copy-text="${escapeHtml(copyText)}" data-state="idle" aria-label="Copy">📋</button>`
			: ''

	return `
		<div class="${styles.historyItem} ${typeClass}">
			<div class="${styles.historyContent}">
				<span class="${styles.statusIcon}">${icon}</span>
				${contentHtml}
			</div>
			${copyButtonHtml}
			${meta ? `<div class="${styles.historyMeta}">${meta}</div>` : ''}
		</div>
	`
}

/** Create reflection lines from reflection object */
export function createReflectionLines(reflection: {
	evaluation_previous_goal?: string
	memory?: string
	next_goal?: string
}): string[] {
	const lines: string[] = []
	if (reflection.evaluation_previous_goal) {
		lines.push(`🔍 ${reflection.evaluation_previous_goal}`)
	}
	if (reflection.memory) {
		lines.push(`💾 ${reflection.memory}`)
	}
	if (reflection.next_goal) {
		lines.push(`🎯 ${reflection.next_goal}`)
	}
	return lines
}
