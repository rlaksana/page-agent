/**
 * Agent guard rails configured by the user:
 * - site denylist: hosts the agent must never read or operate on
 * - sensitive-action confirmation: clicks matching sensitive keywords
 *   require explicit user approval before they are sent to the page
 */

/** Pure: extract hostnames from free-form user input (newlines, commas, or spaces). */
export function parseBlockedSites(input: string | string[] | undefined): string[] {
	if (!input) return []
	const raw = Array.isArray(input) ? input : input.split(/[\n,;\s]+/)
	return raw
		.map(
			(entry) =>
				entry
					.trim()
					.toLowerCase()
					// Allow pasting full URLs — keep only the host part.
					.replace(/^https?:\/\//, '')
					.split('/')[0]
		)
		.filter((host) => host.length > 0)
}

/** Pure: is `url`'s host the blocked host itself or a subdomain of it? */
export function isHostBlocked(url: string, blockedHosts: string[]): boolean {
	if (!url || blockedHosts.length === 0) return false
	let hostname: string
	try {
		hostname = new URL(url).hostname.toLowerCase()
	} catch {
		return false
	}
	return blockedHosts.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))
}

let blockedHosts: string[] = []

/** Configure the denylist for the current context. Called by MultiPageAgent. */
export function configureSiteGuard(blockedSites: string[] | undefined): void {
	blockedHosts = parseBlockedSites(blockedSites)
}

/** Is the agent denied from operating on this URL by the user's denylist? */
export function isUrlDenied(url: string | undefined): boolean {
	return isHostBlocked(url ?? '', blockedHosts)
}

/**
 * Keywords (word-boundary matched, case-insensitive) that mark a click as
 * potentially irreversible or financially sensitive. Conservative list.
 */
export const SENSITIVE_ACTION_KEYWORDS = [
	'pay',
	'payment',
	'checkout',
	'purchase',
	'place order',
	'order now',
	'delete',
	'remove',
	'transfer',
	'subscribe',
	'confirm order',
	'send money',
]

const SENSITIVE_RE = new RegExp(
	`\\b(?:${SENSITIVE_ACTION_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
	'i'
)

/** Pure: does the element text look like a sensitive (hard-to-reverse) action? */
export function isSensitiveActionText(text: string): boolean {
	return SENSITIVE_RE.test(text)
}
