import type { HistoricalEvent } from '@page-agent/core'
import {
	ArrowUp,
	Copy,
	Download,
	History,
	Pencil,
	Plus,
	RotateCcw,
	Settings,
	Square,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ConfigPanel } from '@/components/ConfigPanel'
import { HistoryDetail } from '@/components/HistoryDetail'
import { HistoryList } from '@/components/HistoryList'
import { ActivityCard, AskUserCard, CopyIconButton, EventCard } from '@/components/cards'
import { EmptyState, HomeLinks, LogoMark, Onboarding, StatusPill } from '@/components/misc'
import { TProvider, translator } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { TabsController } from '../../agent/TabsController'
import { DEMO_CONFIG } from '../../agent/constants'
import { useAgent } from '../../agent/useAgent'

type View =
	| { name: 'chat' }
	| { name: 'config' }
	| { name: 'history' }
	| { name: 'history-detail'; sessionId: string }

/** Compact token count for the usage chip ("12.3k tokens"). */
const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export default function App() {
	const [view, setView] = useState<View>({ name: 'chat' })
	const [inputValue, setInputValue] = useState('')
	const historyRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const {
		status,
		history,
		activity,
		currentTask,
		config,
		configLoaded,
		pendingAsk,
		execute,
		stop,
		startNewChat,
		answerAsk,
		configure,
	} = useAgent()
	const isRunning = status === 'running'

	// Sidepanel UI is English-only by requirement (the agent's response
	// language is a separate setting that follows the task).
	const t = translator()

	// Task queueing: a task submitted while the agent runs is queued and
	// flushed automatically when the current task finishes (one slot).
	const [queuedTask, setQueuedTask] = useState<string | null>(null)

	// Auto-scroll to bottom on new events
	useEffect(() => {
		if (historyRef.current) {
			historyRef.current.scrollTop = historyRef.current.scrollHeight
		}
	}, [history, activity])

	// Auto-focus the input when entering chat and when a task finishes,
	// so users can start typing immediately without a click.
	useEffect(() => {
		if (view.name !== 'chat' || isRunning) return
		textareaRef.current?.focus({ preventScroll: true })
	}, [isRunning, view.name])

	// Auto-grow the composer with its content up to a cap; it scrolls
	// internally (thin scrollbar) beyond that instead of cramming a tiny box.
	const COMPOSER_MAX_HEIGHT = 160
	useEffect(() => {
		const el = textareaRef.current
		if (!el) return
		el.style.height = 'auto'
		el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
	}, [inputValue])

	// Task banner text is clamped to 2 lines; click toggles expand/collapse.
	// Expansion is keyed by task text, so a new task starts collapsed
	// automatically without a reset effect.
	const [expandedTask, setExpandedTask] = useState<string | null>(null)
	const [taskClamped, setTaskClamped] = useState(false)
	const taskExpanded = expandedTask === currentTask
	const taskTextRef = useRef<HTMLButtonElement>(null)

	// Detect truncation while collapsed so the toggle only shows when needed.
	// Skip while expanded: scrollHeight == clientHeight then, which would
	// clear the flag and remove the collapse affordance.
	useEffect(() => {
		if (taskExpanded) return
		const el = taskTextRef.current
		setTaskClamped(!!el && el.scrollHeight > el.clientHeight + 1)
	}, [currentTask, taskExpanded])

	// Sweep any tab group left over from a previous session.
	//
	// In MV3 sidepanel, the document is PRESERVED when the user clicks the X
	// to close the panel — only its visibility flips to `hidden`. React App
	// does NOT remount on reopen, so a plain `useEffect(() => …, [])` misses
	// the close→reopen cycle. The `visibilitychange` event fires reliably on
	// each open, so we hook that and the initial mount.
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void TabsController.cleanupStaleTabGroup()
			}
		}
		document.addEventListener('visibilitychange', onVisible)
		// Run once on mount for the cold-open case.
		void TabsController.cleanupStaleTabGroup()
		return () => document.removeEventListener('visibilitychange', onVisible)
	}, [])

	const runTask = useCallback(
		(task: string) => {
			const normalizedTask = task.trim()
			if (!normalizedTask) return

			setInputValue('')
			setView({ name: 'chat' })

			if (isRunning) {
				setQueuedTask(normalizedTask)
				return
			}

			execute(normalizedTask).catch((error) => {
				console.error('[SidePanel] Failed to execute task:', error)
			})
		},
		[execute, isRunning]
	)

	// Flush the queued task once the agent is free again.
	useEffect(() => {
		if (isRunning || !queuedTask) return
		const next = queuedTask
		setQueuedTask(null)
		runTask(next)
	}, [isRunning, queuedTask, runTask])

	const handleSubmit = useCallback(
		(e?: React.SyntheticEvent) => {
			e?.preventDefault()
			runTask(inputValue)
		},
		[inputValue, runTask]
	)

	const handleStop = useCallback(() => {
		stop()
	}, [stop])

	const handleNewChat = useCallback(() => {
		if (isRunning) return
		startNewChat()
		setView({ name: 'chat' })
		textareaRef.current?.focus({ preventScroll: true })
	}, [isRunning, startNewChat])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			handleSubmit()
		}
	}

	const suggest = useCallback((task: string) => {
		setInputValue(task)
		textareaRef.current?.focus()
	}, [])

	const editTask = useCallback(() => {
		setInputValue(currentTask)
		textareaRef.current?.focus()
	}, [currentTask])

	// --- View routing ---

	// Storage still loading (resolves in milliseconds) — render nothing to
	// avoid flashing the onboarding view before the stored config arrives.
	if (!configLoaded) return null

	// First run: no stored LLM config — offer the demo endpoint or bring your own key.
	if (config === null) {
		return (
			<TProvider value={t}>
				<div className="ps">
					<Onboarding
						onDemo={() => void configure(DEMO_CONFIG)}
						onOwnKey={() => setView({ name: 'config' })}
					/>
				</div>
			</TProvider>
		)
	}

	if (view.name === 'config') {
		return (
			<TProvider value={t}>
				<div className="ps">
					<ConfigPanel
						config={config}
						onSave={async (newConfig) => {
							await configure(newConfig)
							setView({ name: 'chat' })
						}}
						onClose={() => setView({ name: 'chat' })}
					/>
				</div>
			</TProvider>
		)
	}

	if (view.name === 'history') {
		return (
			<TProvider value={t}>
				<div className="ps">
					<HistoryList
						onSelect={(id) => setView({ name: 'history-detail', sessionId: id })}
						onBack={() => setView({ name: 'chat' })}
						onRerun={runTask}
					/>
				</div>
			</TProvider>
		)
	}

	if (view.name === 'history-detail') {
		return (
			<TProvider value={t}>
				<div className="ps">
					<HistoryDetail
						sessionId={view.sessionId}
						onBack={() => setView({ name: 'history' })}
						onRerun={runTask}
					/>
				</div>
			</TProvider>
		)
	}

	// --- Chat view ---

	const showEmptyState = !currentTask && history.length === 0 && !isRunning
	const stepCount = history.filter((e) => e.type === 'step').length
	const maxSteps = config?.maxSteps ?? 40
	const progress = Math.min(100, Math.round((stepCount / maxSteps) * 100))

	const lastStepIdx = (() => {
		for (let i = history.length - 1; i >= 0; i--) {
			if (history[i].type === 'step') return i
		}
		return -1
	})()

	// Status flags (declared early: used by the aria-live region and result actions)
	const isFailed = status === 'error'
	const isFinished = status === 'completed' || status === 'stopped' || isFailed

	// Total tokens consumed by this task's steps (usage comes from the LLM response).
	const totalTokens = history.reduce(
		(sum, e) => sum + (e.type === 'step' ? (e.usage?.totalTokens ?? 0) : 0),
		0
	)

	// Max-steps exhaustion: the agent ran out of budget, not into an error.
	// "Continue" picks up where it stopped (prior turns ride along as context).
	const lastEvent = history.at(-1)
	const isMaxStepsError =
		isFailed &&
		lastEvent?.type === 'error' &&
		((lastEvent as { message?: string }).message ?? '').includes('Step count exceeded')

	// Final result text from the last `done` step, if any.
	const resultText = (() => {
		for (let i = history.length - 1; i >= 0; i--) {
			const e = history[i]
			if (e.type === 'step' && e.action?.name === 'done') {
				const input = e.action.input as { text?: string }
				return input?.text || e.action.output || ''
			}
		}
		return ''
	})()

	const saveResultAsFile = () => {
		const blob = new Blob([resultText], { type: 'text/markdown' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'page-agent-result.md'
		a.click()
		URL.revokeObjectURL(url)
	}

	const placeholder = isRunning
		? t('chat.queuePlaceholder')
		: isFailed
			? t('chat.failedPlaceholder')
			: isFinished
				? t('chat.finishedPlaceholder')
				: t('chat.placeholder')

	return (
		<TProvider value={t}>
			<div className="ps">
				{isRunning && <div className="glowb" />}

				{/* Screen-reader announcements: status transitions and agent-needs-input */}
				<div role="status" aria-live="polite" className="sr">
					{pendingAsk
						? t('status.needsInput')
						: isRunning
							? t('status.agentRunning')
							: status === 'completed'
								? t('status.taskCompleted')
								: isFailed
									? t('status.taskFailed')
									: status === 'stopped'
										? t('status.taskStopped')
										: ''}
				</div>

				{/* Header */}
				<header className="hd">
					<LogoMark />
					<span className="ttl">Page Agent</span>
					<span className="sp" />
					<StatusPill status={status} />
					<button
						type="button"
						className="ib"
						onClick={handleNewChat}
						disabled={isRunning}
						aria-label={t('common.newChat')}
						title={t('common.newChat')}
					>
						<Plus className="size-4" />
					</button>
					<button
						type="button"
						className="ib"
						onClick={() => setView({ name: 'history' })}
						aria-label={t('common.history')}
						title={t('common.history')}
					>
						<History className="size-4" />
					</button>
					<button
						type="button"
						className="ib"
						onClick={() => setView({ name: 'config' })}
						aria-label={t('common.settings')}
						title={t('common.settings')}
					>
						<Settings className="size-4" />
					</button>
				</header>

				{/* Task banner (only while running — afterwards the task appears as a user bubble) */}
				{isRunning && currentTask && (
					<div className="task">
						<div className="tr">
							<span className="lab">{t('common.task')}</span>
							<span className="sp" />
							<span className="meta">
								{t('chat.stepOf', { step: stepCount, max: maxSteps })}
								{totalTokens > 0 && (
									<>
										{' '}
										· {fmtTokens(totalTokens)} {t('chat.tok')}
									</>
								)}
							</span>
							<CopyIconButton text={currentTask} label={t('common.copyTask')} />
						</div>
						<button
							type="button"
							ref={taskTextRef}
							className={cn('tt', taskClamped && 'tog', taskExpanded && 'open')}
							onClick={
								taskClamped ? () => setExpandedTask(taskExpanded ? null : currentTask) : undefined
							}
							aria-expanded={taskExpanded}
							title={currentTask}
						>
							{currentTask}
						</button>
						<div className="prog">
							<i style={{ width: `${progress}%` }} />
						</div>
					</div>
				)}

				{/* Queued next task (submitted while the agent is running) */}
				{queuedTask && (
					<div className="qnext">
						<span className="lab">{t('chat.queued')}</span>
						<span className="qt">{queuedTask}</span>
						<button
							type="button"
							className="ib"
							onClick={() => setQueuedTask(null)}
							aria-label={t('chat.cancelQueued')}
							title={t('chat.cancelQueued')}
						>
							<X className="size-3.5" />
						</button>
					</div>
				)}

				{/* Content */}
				{showEmptyState ? (
					<>
						<EmptyState onSuggest={suggest} />
						<HomeLinks />
					</>
				) : (
					<main ref={historyRef} className={cn('feed', isRunning && 'end fade')}>
						{!isRunning && currentTask && <div className="usr">{currentTask}</div>}

						{history.map((event: HistoricalEvent, index: number) => (
							<EventCard
								key={index}
								event={event}
								running={isRunning && index === lastStepIdx}
								last={index === lastStepIdx && !activity}
							/>
						))}

						{activity && <ActivityCard activity={activity} />}

						{/* Result actions */}
						{isFinished && resultText && (
							<div className="acts" style={{ marginLeft: 0, gap: 8 }}>
								<button
									type="button"
									className="btn g"
									onClick={() => navigator.clipboard.writeText(resultText)}
								>
									<Copy className="size-3.5" /> {t('common.copy')}
								</button>
								<button type="button" className="btn g" onClick={saveResultAsFile}>
									<Download className="size-3.5" /> {t('chat.saveMd')}
								</button>
								{totalTokens > 0 && (
									<span className="chip">
										{t('chat.tokens', { count: fmtTokens(totalTokens) })}
									</span>
								)}
								<span className="vr" />
								<button
									type="button"
									className="ib"
									onClick={() => runTask(currentTask)}
									aria-label={t('common.runAgain')}
									title={t('common.runAgain')}
								>
									<RotateCcw className="size-3.5" />
								</button>
								<button
									type="button"
									className="ib"
									onClick={editTask}
									aria-label={t('common.editTask')}
									title={t('common.editTask')}
								>
									<Pencil className="size-3.5" />
								</button>
							</div>
						)}

						{/* Error actions */}
						{isFailed && !resultText && (
							<div className="acts" style={{ marginLeft: 0, gap: 8 }}>
								{isMaxStepsError && (
									<button
										type="button"
										className="btn lg p"
										onClick={() => runTask(`Continue: ${currentTask}`)}
									>
										{t('chat.continue')}
									</button>
								)}
								<button
									type="button"
									className={cn('btn lg', !isMaxStepsError && 'p')}
									onClick={() => runTask(currentTask)}
								>
									{t('common.runAgain')}
								</button>
								<button type="button" className="btn lg" onClick={editTask}>
									{t('common.editTask')}
								</button>
							</div>
						)}
					</main>
				)}

				{/* Composer */}
				<footer className="cmp">
					{pendingAsk && (
						<AskUserCard
							kind={pendingAsk.kind}
							question={pendingAsk.question}
							onAnswer={answerAsk}
						/>
					)}
					<div className={cn('box', isRunning && 'off')}>
						<textarea
							ref={textareaRef}
							className="ta2"
							rows={2}
							placeholder={placeholder}
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
						<div className="cr">
							{config?.model && <span className="chip">{config.model}</span>}
							{!isRunning && <span className="kbd">{t('chat.enterHint')}</span>}
							<span className="sp" />
							{isRunning ? (
								<button
									type="button"
									className="send stop"
									onClick={handleStop}
									aria-label={t('chat.stopTask')}
									title={t('chat.stopTask')}
								>
									<Square className="size-3.5" /> {t('status.running')}
								</button>
							) : (
								<button
									type="button"
									className="send"
									disabled={!inputValue.trim()}
									onClick={() => handleSubmit()}
									aria-label={t('chat.send')}
									title={t('chat.send')}
								>
									<ArrowUp className="size-4" />
								</button>
							)}
						</div>
					</div>
				</footer>
			</div>
		</TProvider>
	)
}
