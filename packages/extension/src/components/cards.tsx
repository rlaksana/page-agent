import type {
	AgentActivity,
	AgentErrorEvent,
	AgentStepEvent,
	HistoricalEvent,
	ObservationEvent,
	RetryEvent,
} from '@page-agent/core'
import {
	ArrowLeft,
	ArrowUp,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronsDown,
	CircleCheck,
	Copy,
	Eye,
	FileText,
	Globe,
	Hand,
	Keyboard,
	MousePointerClick,
	RefreshCw,
	Sparkle,
	XCircle,
	Zap,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

/** Icon button that copies `text` and swaps to a check for 1.5s. */
export function CopyIconButton({
	text,
	label,
	className,
}: {
	text: string
	label: string
	className?: string
}) {
	const [copied, setCopied] = useState(false)

	return (
		<button
			type="button"
			className={cn('ib sm cp', className)}
			aria-label={label}
			title={label}
			onClick={() => {
				navigator.clipboard.writeText(text)
				setCopied(true)
				setTimeout(() => setCopied(false), 1500)
			}}
		>
			{copied ? (
				<Check className="size-3.5" style={{ color: 'var(--ok)' }} />
			) : (
				<Copy className="size-3.5" />
			)}
		</button>
	)
}

/** Minimal JSON tokenizer producing the design's jk/js/jn/jm color spans. */
function JsonCode({ value }: { value: unknown }) {
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
	const parts: React.ReactNode[] = []
	let last = 0
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) {
		if (m.index > last) {
			parts.push(
				<span key={parts.length} className="jm">
					{text.slice(last, m.index)}
				</span>
			)
		}
		if (m[1] && m[2]) {
			parts.push(
				<span key={parts.length} className="jk">
					{m[1]}
				</span>,
				<span key={parts.length} className="jm">
					{m[2]}
				</span>
			)
		} else if (m[1]) {
			parts.push(
				<span key={parts.length} className="js">
					{m[1]}
				</span>
			)
		} else {
			parts.push(
				<span key={parts.length} className="jn">
					{m[0]}
				</span>
			)
		}
		last = re.lastIndex
	}
	if (last < text.length) {
		parts.push(
			<span key={parts.length} className="jm">
				{text.slice(last)}
			</span>
		)
	}
	return <>{parts}</>
}

/** Labeled read-only code block (Input / Output / Raw …) with a copy button. */
function CodeBlock({ label, value }: { label: string; value: unknown }) {
	const t = useT()
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

	return (
		<div>
			<div className="lab">{label}</div>
			<pre className="code mono">
				<JsonCode value={value} />
				<CopyIconButton text={text} label={`${t('common.copy')}: ${label}`} />
			</pre>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Markdown (result answers) — styled entirely by the `.md` rules in design.css
// ---------------------------------------------------------------------------

export function MarkdownContent({ content }: { content: string }) {
	const t = useT()

	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				a: ({ href, children }) => (
					<a href={href} target="_blank" rel="noopener noreferrer">
						{children}
					</a>
				),
				// Inline code vs block code: react-markdown renders block code as pre>code.
				code: ({ className, children, ...props }) => {
					const isBlock = typeof className === 'string' && className.includes('language-')
					if (isBlock) {
						return (
							<code className={className} {...props}>
								{children}
							</code>
						)
					}
					return (
						<code className="i" {...props}>
							{children}
						</code>
					)
				},
				pre: ({ children }) => {
					// Extract language + raw text for the header/copy affordances.
					const child = Array.isArray(children) ? children[0] : children
					const lang =
						/language-(\w+)/.exec(
							(child as { props?: { className?: string } })?.props?.className ?? ''
						)?.[1] ?? 'code'
					const raw = extractText(child)
					return (
						<div className="cb">
							<div className="cbh">
								<span className="lab">{lang}</span>
								<span className="sp" />
								<CopyIconButton text={raw} label={t('card.copyCode')} />
							</div>
							<pre>{children}</pre>
						</div>
					)
				},
				table: ({ children }) => (
					<div className="tw">
						<table>{children}</table>
					</div>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	)
}

function extractText(node: React.ReactNode): string {
	if (node == null || typeof node === 'boolean') return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(extractText).join('')
	const el = node as { props?: { children?: React.ReactNode } }
	return el.props ? extractText(el.props.children) : ''
}

// ---------------------------------------------------------------------------
// Result card (final answer of a `done` action)
// ---------------------------------------------------------------------------

export function ResultCard({ success, text }: { success: boolean; text: string }) {
	const t = useT()

	return (
		<div className="res">
			<div className="rh">
				<span className={cn('pill', success ? 'p-ok' : 'p-err')}>
					<span className="dot" />
					{success ? t('card.success') : t('card.failed')}
				</span>
				<span className="sp" />
				{text && <CopyIconButton text={text} label={t('card.copyResult')} />}
			</div>
			{text && (
				<div className="md">
					<MarkdownContent content={text} />
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Step card — one timeline node with reflection + tool action
// ---------------------------------------------------------------------------

/** Icon for an action name (lucide equivalents of the design's tool glyphs). */
function ActionIcon({ name, className }: { name: string; className?: string }) {
	const icons: Record<string, React.ReactNode> = {
		click_element_by_index: <MousePointerClick className={className} />,
		input: <Keyboard className={className} />,
		scroll: <ChevronsDown className={className} />,
		go_to_url: <Globe className={className} />,
		go_back: <ArrowLeft className={className} />,
		reload_page: <RefreshCw className={className} />,
		press_key: <Keyboard className={className} />,
		extract_content: <FileText className={className} />,
		done: <CircleCheck className={className} />,
	}
	return icons[name] ?? <Zap className={className} />
}

/** Collapsible reflection (eval / memory / next goal) rows. */
function ReflectionSection({
	reflection,
	defaultOpen,
}: {
	reflection: AgentStepEvent['reflection']
	defaultOpen: boolean
}) {
	const t = useT()
	const [open, setOpen] = useState(defaultOpen)
	const items = [
		{ label: t('card.eval'), value: reflection.evaluation_previous_goal },
		{ label: t('card.memory'), value: reflection.memory },
		{ label: t('card.next'), value: reflection.next_goal },
	].filter((item) => item.value)

	if (items.length === 0) return null

	return (
		<>
			<button type="button" className="think" aria-expanded={open} onClick={() => setOpen(!open)}>
				<Sparkle className="size-3.5" />
				<span>{t('card.reflection')}</span>
				{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
			</button>
			{open && (
				<div className="thinkbox">
					<div className="rows">
						{items.map((item) => (
							<div key={item.label} className="rw">
								<span className="lab">{item.label}</span>
								<p>{item.value}</p>
							</div>
						))}
					</div>
				</div>
			)}
		</>
	)
}

/** Raw request/response debug tabs, restyled for the tool body. */
function RawSection({ rawRequest, rawResponse }: { rawRequest?: unknown; rawResponse?: unknown }) {
	const t = useT()
	const [tab, setTab] = useState<'request' | 'response' | null>(null)

	if (rawRequest == null && rawResponse == null) return null

	const content = tab === 'request' ? rawRequest : tab === 'response' ? rawResponse : null

	return (
		<div>
			<div className="lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
				{t('card.raw')}
				{rawRequest != null && (
					<button
						type="button"
						className={cn('think', tab === 'request' && 'on')}
						style={{ display: 'inline-flex', height: 'auto', width: 'auto', padding: 0 }}
						aria-expanded={tab === 'request'}
						onClick={() => setTab(tab === 'request' ? null : 'request')}
					>
						{t('card.request')}
					</button>
				)}
				{rawResponse != null && (
					<button
						type="button"
						className={cn('think', tab === 'response' && 'on')}
						style={{ display: 'inline-flex', height: 'auto', width: 'auto', padding: 0 }}
						aria-expanded={tab === 'response'}
						onClick={() => setTab(tab === 'response' ? null : 'response')}
					>
						{t('card.response')}
					</button>
				)}
			</div>
			{content != null && (
				<CodeBlock
					label={tab === 'request' ? t('card.request') : t('card.response')}
					value={content}
				/>
			)}
		</div>
	)
}

export function StepCard({
	event,
	running,
	last,
}: {
	event: AgentStepEvent
	running?: boolean
	last?: boolean
}) {
	const t = useT()
	const [open, setOpen] = useState(false)
	const isDone = event.action?.name === 'done'
	const doneInput = isDone ? (event.action.input as { text?: string; success?: boolean }) : null

	return (
		<div className={cn('st', last && 'last')}>
			<span className={cn('node', running ? 'n-run' : 'n-ok')}>{event.stepIndex + 1}</span>
			<div className="sh">
				<span>{t('card.step', { step: event.stepIndex + 1 })}</span>
			</div>
			<div className="stack">
				<ReflectionSection reflection={event.reflection} defaultOpen={!!running} />

				<div className={cn('tool', running && 'run')}>
					<button type="button" className="th" aria-expanded={open} onClick={() => setOpen(!open)}>
						<span className="ti">
							<ActionIcon name={event.action.name} className="size-3.5" />
						</span>
						<span className="tmain">
							<span className="tn">{event.action.name}</span>
							<span className="ta">
								{isDone
									? doneInput?.success === false
										? t('card.failed')
										: t('card.success')
									: JSON.stringify(event.action.input)}
							</span>
						</span>
						{running ? (
							<span className="ts run">
								<RefreshCw className="size-3 spin" /> {t('card.running')}
							</span>
						) : (
							<span className="ts ok">
								<Check className="size-3" />
							</span>
						)}
						<span className="mut">
							{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
						</span>
					</button>
					{running && <div className="shim" />}
					{open && (
						<div className="tb">
							{!isDone && <CodeBlock label={t('card.input')} value={event.action.input} />}
							<CodeBlock label={t('card.output')} value={event.action.output} />
							<RawSection rawRequest={event.rawRequest} rawResponse={event.rawResponse} />
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Minor event cards
// ---------------------------------------------------------------------------

function ObservationCard({ event }: { event: ObservationEvent }) {
	return (
		<div className="obs" style={{ paddingLeft: 34 }}>
			<Eye className="size-3.5" />
			<span>{event.content}</span>
		</div>
	)
}

function RetryCard({ event }: { event: RetryEvent }) {
	const t = useT()
	const dots = Array.from({ length: Math.min(event.maxAttempts, 10) }, (_, i) => i < event.attempt)

	return (
		<div style={{ paddingLeft: 34, flex: 'none' }}>
			<div className="note nw" role="status">
				<RefreshCw className="size-4" />
				<div>
					<b>{event.message}</b>
					<span className="dots">
						{dots.map((on, i) => (
							<i key={i} className={on ? 'on' : ''} />
						))}
					</span>
					<div className="meta" style={{ marginTop: 4 }}>
						{t('card.attemptOf', { attempt: event.attempt, max: event.maxAttempts })}
					</div>
				</div>
			</div>
		</div>
	)
}

function ErrorCard({ event }: { event: AgentErrorEvent }) {
	const t = useT()
	const [showRaw, setShowRaw] = useState(false)

	return (
		<div style={{ paddingLeft: 0, flex: 'none' }}>
			<div className="note ne" role="alert">
				<XCircle className="size-4" />
				<div style={{ minWidth: 0 }}>
					<b>{event.message}</b>
					{event.rawResponse != null && (
						<div className="row2">
							<button
								type="button"
								className="think"
								style={{ width: 'auto' }}
								aria-expanded={showRaw}
								onClick={() => setShowRaw(!showRaw)}
							>
								{showRaw ? t('card.hideRaw') : t('card.showRaw')}
							</button>
						</div>
					)}
					{showRaw && event.rawResponse != null && (
						<CodeBlock label={t('card.rawResponse')} value={event.rawResponse} />
					)}
				</div>
			</div>
		</div>
	)
}

/**
 * Prompt docked above the composer while the agent waits for the user:
 * free-text answer (`ask`) or a proceed/decline confirmation (`confirm`).
 */
export function AskUserCard({
	question,
	kind,
	onAnswer,
}: {
	question: string
	kind: 'ask' | 'confirm'
	onAnswer: (answer: string) => void
}) {
	const t = useT()
	const [value, setValue] = useState('')
	const inputRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		inputRef.current?.focus({ preventScroll: true })
	}, [])

	if (kind === 'confirm') {
		return (
			<div className="askw">
				<div className="askq">
					<Hand className="size-3.5" />
					<span>{t('ask.confirmTitle')}</span>
				</div>
				<div className="askt" role="question">
					{question}
				</div>
				<div className="cr">
					<span className="sp" />
					<button type="button" className="btn g" onClick={() => onAnswer('no')}>
						{t('ask.decline')}
					</button>
					<button
						type="button"
						className="send"
						onClick={() => onAnswer('yes')}
						aria-label={t('ask.proceed')}
					>
						<Check className="size-4" />
					</button>
				</div>
			</div>
		)
	}

	const submit = () => {
		const text = value.trim()
		if (text) onAnswer(text)
	}

	return (
		<div className="askw">
			<div className="askq">
				<Hand className="size-3.5" />
				<span>{t('ask.title')}</span>
			</div>
			<div className="askt" role="question">
				{question}
			</div>
			<textarea
				ref={inputRef}
				className="ta2"
				rows={2}
				placeholder={t('ask.placeholder')}
				aria-label={t('ask.yourAnswer')}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
						e.preventDefault()
						submit()
					}
				}}
			/>
			<div className="cr">
				<span className="sp" />
				<button
					type="button"
					className="send"
					disabled={!value.trim()}
					onClick={submit}
					aria-label={t('ask.sendAnswer')}
				>
					<ArrowUp className="size-4" />
				</button>
			</div>
		</div>
	)
}

/** Live activity pill shown at the bottom of the feed while running. */
export function ActivityCard({ activity }: { activity: AgentActivity }) {
	const t = useT()
	const info = (() => {
		switch (activity.type) {
			case 'thinking':
				return { text: t('card.thinking'), icon: <Sparkle className="size-3.5" /> }
			case 'executing':
				return {
					text: (
						<>
							{t('card.executing')} <span className="mono">{activity.tool}</span>
						</>
					),
					icon: <RefreshCw className="size-3.5 spin" />,
				}
			case 'executed':
				return {
					text: (
						<>
							{t('card.executed')} <span className="mono">{activity.tool}</span>
						</>
					),
					icon: <Check className="size-3.5" />,
				}
			case 'retrying':
				return {
					text: t('card.retrying', { attempt: activity.attempt, max: activity.maxAttempts }),
					icon: <RefreshCw className="size-3.5 spin" />,
				}
			case 'error':
				return { text: activity.message, icon: <XCircle className="size-3.5" /> }
		}
	})()

	return (
		<div className="act" role="status">
			{info.icon}
			<span>{info.text}</span>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function EventCard({
	event,
	running,
	last,
}: {
	event: HistoricalEvent
	running?: boolean
	last?: boolean
}) {
	const t = useT()

	if (event.type === 'step') {
		if (event.action?.name === 'done') {
			const input = event.action.input as { text?: string; success?: boolean }
			return (
				<Fragment>
					<StepCard event={event} running={running} last={last} />
					<ResultCard
						success={input?.success ?? true}
						text={input?.text || event.action.output || ''}
					/>
				</Fragment>
			)
		}
		return <StepCard event={event} running={running} last={last} />
	}

	if (event.type === 'observation') {
		return <ObservationCard event={event} />
	}

	if (event.type === 'retry') {
		return <RetryCard event={event} />
	}

	if (event.type === 'user_takeover') {
		return (
			<div className="obs" style={{ paddingLeft: 34 }}>
				<Hand className="size-3.5" />
				<span>{t('card.userTakeover')}</span>
			</div>
		)
	}

	if (event.type === 'error') {
		return <ErrorCard event={event} />
	}

	return null
}
