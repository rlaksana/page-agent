/**
 * Agent guard rails configured by the user:
 * - site denylist: hosts the agent must never read or operate on
 * - sensitive-action confirmation: clicks matching sensitive keywords
 *   require explicit user approval before they are sent to the page
 */

/**
 * Canonicalize a host entry or URL to a comparable hostname: parsed through
 * URL (drops port/userinfo/path), lowercased, trailing root dot stripped
 * (DNS treats `bank.com.` like `bank.com` — without this, a trailing dot
 * bypasses the denylist). Returns null for empty or unparseable input.
 */
function canonicalHost(entry: string): string | null {
	const trimmed = entry.trim().toLowerCase()
	if (!trimmed) return null
	let hostname: string
	try {
		hostname = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).hostname
	} catch {
		return null
	}
	const normalized = hostname.replace(/\.$/, '')
	return normalized || null
}

/** Pure: extract canonical hostnames from free-form user input (newlines, commas, or spaces). */
export function parseBlockedSites(input: string | string[] | undefined): string[] {
	if (!input) return []
	const raw = Array.isArray(input) ? input : input.split(/[\n,;\s]+/)
	return raw.map(canonicalHost).filter((host): host is string => host !== null)
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
	const normalized = hostname.replace(/\.$/, '')
	return blockedHosts.some(
		(blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`)
	)
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
