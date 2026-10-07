import type { AgentStatus } from '@page-agent/core'
import { Motion } from 'ai-motion'
import { BookOpen, ChevronRight, FileText, Globe, Sparkle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { siGithub } from 'simple-icons'

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Status dot indicator (used by the hub entry)
export function StatusDot({ status }: { status: AgentStatus }) {
	const colorClass = {
		idle: 'bg-muted-foreground',
		running: 'bg-blue-500',
		completed: 'bg-green-500',
		error: 'bg-destructive',
		stopped: 'bg-muted-foreground',
	}[status]

	const label = {
		idle: 'Ready',
		running: 'Running',
		completed: 'Done',
		error: 'Error',
		stopped: 'Stopped',
	}[status]

	return (
		<div className="flex items-center gap-1.5 mr-2">
			<span
				className={cn('size-2 rounded-full', colorClass, status === 'running' && 'animate-pulse')}
			/>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	)
}

export function Logo({ className }: { className?: string }) {
	return <img src="/assets/page-agent-256.webp" alt="Page Agent" className={cn('', className)} />
}

/** Accent logo tile with the sparkle glyph (sidepanel header). */
export function LogoMark({ className }: { className?: string }) {
	return (
		<span className={cn('logo', className)}>
			<Sparkle className="size-3.5" />
		</span>
	)
}

const STATUS_PILL: Record<
	AgentStatus,
	{
		cls: string
		key: 'status.ready' | 'status.running' | 'status.done' | 'status.error' | 'status.stopped'
	}
> = {
	idle: { cls: '', key: 'status.ready' },
	running: { cls: 'p-run', key: 'status.running' },
	completed: { cls: 'p-ok', key: 'status.done' },
	error: { cls: 'p-err', key: 'status.error' },
	stopped: { cls: 'p-warn', key: 'status.stopped' },
}

/** Status pill in the header (design token colors per status). */
export function StatusPill({ status }: { status: AgentStatus }) {
	const t = useT()
	const pill = STATUS_PILL[status]

	return (
		<span className={cn('pill', pill.cls)}>
			<span className="dot" />
			{t(pill.key)}
		</span>
	)
}

// Full-screen ai-motion glow overlay, shown only while running (used by the hub entry)
export function MotionOverlay({ active }: { active: boolean }) {
	const containerRef = useRef<HTMLDivElement>(null)
	const motionRef = useRef<Motion | null>(null)

	useEffect(() => {
		try {
			const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
			const motion = new Motion({
				mode,
				borderWidth: 4,
				borderRadius: 14,
				glowWidth: mode === 'dark' ? 120 : 60,
				styles: { position: 'absolute', inset: '0' },
			})
			motionRef.current = motion
			containerRef.current!.appendChild(motion.element)
			motion.autoResize(containerRef.current!)
		} catch (e) {
			console.warn('[MotionOverlay] Motion unavailable:', e)
		}

		return () => {
			motionRef.current?.dispose()
			motionRef.current = null
		}
	}, [])

	useEffect(() => {
		const motion = motionRef.current
		if (!motion) return

		let disposed = false
		if (active) {
			motion.start()
			motion.fadeIn()
		} else {
			motion.fadeOut().then(() => !disposed && motion.pause())
		}
		return () => {
			disposed = true
		}
	}, [active])

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 z-10 opacity-60 overflow-hidden"
			style={{ display: active ? undefined : 'none' }}
		/>
	)
}

const SUGGESTIONS = [
	{ icon: FileText, key: 'empty.suggest1' },
	{ icon: TableIcon, key: 'empty.suggest2' },
	{ icon: FormIcon, key: 'empty.suggest3' },
] as const

// Small inline SVGs for suggestions (lucide has no combined form/table glyph)
function TableIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
			<path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
			<path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
		</svg>
	)
}

function FormIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect width="20" height="16" x="2" y="4" rx="2" />
			<path d="M6 8h.01" />
			<path d="M10 8h.01" />
			<path d="M14 8h.01" />
			<path d="M18 8h.01" />
			<path d="M8 12h.01" />
			<path d="M12 12h.01" />
			<path d="M16 12h.01" />
			<path d="M7 16h10" />
		</svg>
	)
}

/** Empty state: breathing rings + logo tile + tagline + suggestion chips. */
export function EmptyState({ onSuggest }: { onSuggest: (task: string) => void }) {
	const t = useT()

	return (
		<div className="empty">
			<div className="rings">
				<i />
				<i />
				<i />
				<div className="bigl">
					<Sparkle className="size-8" />
				</div>
			</div>
			<h1 className="h1">{t('empty.title')}</h1>
			<div className="tagl">
				{t('empty.tagline')}
				<span className="caret" />
			</div>
			<div className="sugs">
				{SUGGESTIONS.map(({ icon: Icon, key }) => (
					<button key={key} type="button" className="sug" onClick={() => onSuggest(t(key))}>
						<Icon className="size-4" />
						<span>{t(key)}</span>
						<ChevronRight className="size-3.5" />
					</button>
				))}
			</div>
		</div>
	)
}

/**
 * First-run view: no stored LLM config yet. Offers the demo endpoint
 * or bringing your own key (opens the config panel).
 */
export function Onboarding({ onDemo, onOwnKey }: { onDemo: () => void; onOwnKey: () => void }) {
	const t = useT()

	return (
		<div className="empty">
			<div className="bigl">
				<Sparkle className="size-8" />
			</div>
			<h1 className="h1">{t('onboarding.title')}</h1>
			<div className="obd">{t('onboarding.desc')}</div>
			<div className="sugs">
				<button type="button" className="sug" onClick={onDemo}>
					<Sparkle className="size-4" />
					<span>{t('onboarding.demo')}</span>
					<ChevronRight className="size-3.5" />
				</button>
				<button type="button" className="sug" onClick={onOwnKey}>
					<BookOpen className="size-4" />
					<span>{t('onboarding.ownKey')}</span>
					<ChevronRight className="size-3.5" />
				</button>
			</div>
			<HomeLinks />
		</div>
	)
}

/** GitHub / Docs / Website links row under the empty state. */
export function HomeLinks() {
	return (
		<div className="links">
			<a
				className="btn g"
				href="https://github.com/alibaba/page-agent"
				target="_blank"
				rel="noopener noreferrer"
			>
				<svg role="img" viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
					<path d={siGithub.path} />
				</svg>{' '}
				GitHub
			</a>
			<a
				className="btn g"
				href="https://alibaba.github.io/page-agent/docs/features/chrome-extension"
				target="_blank"
				rel="noopener noreferrer"
			>
				<BookOpen className="size-3.5" /> Docs
			</a>
			<a
				className="btn g"
				href="https://alibaba.github.io/page-agent"
				target="_blank"
				rel="noopener noreferrer"
			>
				<Globe className="size-3.5" /> Website
			</a>
		</div>
	)
}
