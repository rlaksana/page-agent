import type {
	AgentActivity,
	AgentErrorEvent,
	AgentStepEvent,
	HistoricalEvent,
	ObservationEvent,
	RetryEvent,
} from '@page-agent/core'
import {
	Check,
	ChevronDown,
	ChevronRight,
	ChevronsDown,
	CircleCheck,
	Copy,
	Eye,
	Globe,
	Keyboard,
	MousePointerClick,
	RefreshCw,
	Sparkle,
	XCircle,
	Zap,
} from 'lucide-react'
import { Fragment, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

	return (
		<div>
			<div className="lab">{label}</div>
			<pre className="code mono">
				<JsonCode value={value} />
				<CopyIconButton text={text} label={`Copy ${label.toLowerCase()}`} />
			</pre>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Markdown (result answers) — styled entirely by the `.md` rules in design.css
// ---------------------------------------------------------------------------

export function MarkdownContent({ content }: { content: string }) {
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
								<CopyIconButton text={raw} label="Copy code" />
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
	return (
		<div className="res">
			<div className="rh">
				<span className={cn('pill', success ? 'p-ok' : 'p-err')}>
					<span className="dot" />
					{success ? 'Success' : 'Failed'}
				</span>
				<span className="sp" />
				{text && <CopyIconButton text={text} label="Copy result" />}
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
	const [open, setOpen] = useState(defaultOpen)
	const items = [
		{ label: 'Eval', value: reflection.evaluation_previous_goal },
		{ label: 'Memory', value: reflection.memory },
		{ label: 'Next', value: reflection.next_goal },
	].filter((item) => item.value)

	if (items.length === 0) return null

	return (
		<>
			<button type="button" className="think" aria-expanded={open} onClick={() => setOpen(!open)}>
				<Sparkle className="size-3.5" />
				<span>Reflection</span>
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
	const [tab, setTab] = useState<'request' | 'response' | null>(null)

	if (rawRequest == null && rawResponse == null) return null

	const content = tab === 'request' ? rawRequest : tab === 'response' ? rawResponse : null

	return (
		<div>
			<div className="lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
				Raw
				{rawRequest != null && (
					<button
						type="button"
						className={cn('think', tab === 'request' && 'on')}
						style={{ display: 'inline-flex', height: 'auto', width: 'auto', padding: 0 }}
						aria-expanded={tab === 'request'}
						onClick={() => setTab(tab === 'request' ? null : 'request')}
					>
						Request
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
						Response
					</button>
				)}
			</div>
			{content != null && (
				<CodeBlock label={tab === 'request' ? 'Request' : 'Response'} value={content} />
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
	const [open, setOpen] = useState(false)
	const isDone = event.action?.name === 'done'
	const doneInput = isDone ? (event.action.input as { text?: string; success?: boolean }) : null

	return (
		<div className={cn('st', last && 'last')}>
			<span className={cn('node', running ? 'n-run' : 'n-ok')}>{event.stepIndex + 1}</span>
			<div className="sh">
				<span>Step {event.stepIndex + 1}</span>
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
										? 'failed'
										: 'success'
									: JSON.stringify(event.action.input)}
							</span>
						</span>
						{running ? (
							<span className="ts run">
								<RefreshCw className="size-3 spin" /> Running
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
							{!isDone && <CodeBlock label="Input" value={event.action.input} />}
							<CodeBlock label="Output" value={event.action.output} />
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
						Attempt {event.attempt} of {event.maxAttempts}
					</div>
				</div>
			</div>
		</div>
	)
}

function ErrorCard({ event }: { event: AgentErrorEvent }) {
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
								{showRaw ? 'Hide raw response' : 'Show raw response'}
							</button>
						</div>
					)}
					{showRaw && event.rawResponse != null && (
						<CodeBlock label="Raw response" value={event.rawResponse} />
					)}
				</div>
			</div>
		</div>
	)
}

/** Live activity pill shown at the bottom of the feed while running. */
export function ActivityCard({ activity }: { activity: AgentActivity }) {
	const info = (() => {
		switch (activity.type) {
			case 'thinking':
				return { text: 'Thinking…', icon: <Sparkle className="size-3.5" /> }
			case 'executing':
				return {
					text: (
						<>
							Executing <span className="mono">{activity.tool}</span>
						</>
					),
					icon: <RefreshCw className="size-3.5 spin" />,
				}
			case 'executed':
				return {
					text: (
						<>
							Done: <span className="mono">{activity.tool}</span>
						</>
					),
					icon: <Check className="size-3.5" />,
				}
			case 'retrying':
				return {
					text: `Retrying (${activity.attempt}/${activity.maxAttempts})…`,
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

	if (event.type === 'error') {
		return <ErrorCard event={event} />
	}

	// 'user_takeover' has no visual of its own yet.
	return null
}
