import type { HistoricalEvent } from '@page-agent/core'
import { ArrowUp, Copy, Download, History, Pencil, RotateCcw, Settings, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ConfigPanel } from '@/components/ConfigPanel'
import { HistoryDetail } from '@/components/HistoryDetail'
import { HistoryList } from '@/components/HistoryList'
import { ActivityCard, CopyIconButton, EventCard } from '@/components/cards'
import { EmptyState, HomeLinks, LogoMark, StatusPill } from '@/components/misc'
import { saveSession } from '@/lib/db'
import { cn } from '@/lib/utils'

import { TabsController } from '../../agent/TabsController'
import { useAgent } from '../../agent/useAgent'

type View =
	| { name: 'chat' }
	| { name: 'config' }
	| { name: 'history' }
	| { name: 'history-detail'; sessionId: string }

export default function App() {
	const [view, setView] = useState<View>({ name: 'chat' })
	const [inputValue, setInputValue] = useState('')
	const historyRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const { status, history, activity, currentTask, config, execute, stop, configure } = useAgent()
	const isRunning = status === 'running'

	// Persist session when task finishes
	const prevStatusRef = useRef(status)
	useEffect(() => {
		const prev = prevStatusRef.current
		prevStatusRef.current = status

		if (
			prev === 'running' &&
			(status === 'completed' || status === 'error' || status === 'stopped') &&
			history.length > 0 &&
			currentTask
		) {
			saveSession({ task: currentTask, history, status }).catch((err) =>
				console.error('[SidePanel] Failed to save session:', err)
			)
		}
	}, [status, history, currentTask])

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
			if (!normalizedTask || status === 'running') return

			setInputValue('')
			setView({ name: 'chat' })

			execute(normalizedTask).catch((error) => {
				console.error('[SidePanel] Failed to execute task:', error)
			})
		},
		[execute, status]
	)

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

	if (view.name === 'config') {
		return (
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
		)
	}

	if (view.name === 'history') {
		return (
			<div className="ps">
				<HistoryList
					onSelect={(id) => setView({ name: 'history-detail', sessionId: id })}
					onBack={() => setView({ name: 'chat' })}
					onRerun={runTask}
				/>
			</div>
		)
	}

	if (view.name === 'history-detail') {
		return (
			<div className="ps">
				<HistoryDetail
					sessionId={view.sessionId}
					onBack={() => setView({ name: 'history' })}
					onRerun={runTask}
				/>
			</div>
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

	const isFailed = status === 'error'
	const isFinished = status === 'completed' || status === 'stopped' || isFailed

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
		? 'Agent is working… stop it to type a new task'
		: isFailed
			? 'Describe what to change, or start a new task…'
			: isFinished
				? 'Ask a follow-up or start a new task…'
				: 'Describe your task…'

	return (
		<div className="ps">
			{isRunning && <div className="glowb" />}

			{/* Header */}
			<header className="hd">
				<LogoMark />
				<span className="ttl">Page Agent</span>
				<span className="sp" />
				<StatusPill status={status} />
				<button
					type="button"
					className="ib"
					onClick={() => setView({ name: 'history' })}
					aria-label="History"
					title="History"
				>
					<History className="size-4" />
				</button>
				<button
					type="button"
					className="ib"
					onClick={() => setView({ name: 'config' })}
					aria-label="Settings"
					title="Settings"
				>
					<Settings className="size-4" />
				</button>
			</header>

			{/* Task banner (only while running — afterwards the task appears as a user bubble) */}
			{isRunning && currentTask && (
				<div className="task">
					<div className="tr">
						<span className="lab">Task</span>
						<span className="sp" />
						<span className="meta">
							Step {stepCount} / {maxSteps}
						</span>
						<CopyIconButton text={currentTask} label="Copy task" />
					</div>
					<p className="tt" title={currentTask}>
						{currentTask}
					</p>
					<div className="prog">
						<i style={{ width: `${progress}%` }} />
					</div>
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
								<Copy className="size-3.5" /> Copy
							</button>
							<button type="button" className="btn g" onClick={saveResultAsFile}>
								<Download className="size-3.5" /> Save .md
							</button>
							<span className="vr" />
							<button
								type="button"
								className="ib"
								onClick={() => runTask(currentTask)}
								aria-label="Run again"
								title="Run again"
							>
								<RotateCcw className="size-3.5" />
							</button>
							<button
								type="button"
								className="ib"
								onClick={editTask}
								aria-label="Edit task"
								title="Edit task"
							>
								<Pencil className="size-3.5" />
							</button>
						</div>
					)}

					{/* Error actions */}
					{isFailed && !resultText && (
						<div className="acts" style={{ marginLeft: 0, gap: 8 }}>
							<button type="button" className="btn lg p" onClick={() => runTask(currentTask)}>
								Run again
							</button>
							<button type="button" className="btn lg" onClick={editTask}>
								Edit task
							</button>
						</div>
					)}
				</main>
			)}

			{/* Composer */}
			<footer className="cmp">
				<div className={cn('box', isRunning && 'off')}>
					<textarea
						ref={textareaRef}
						className="ta2"
						rows={2}
						placeholder={placeholder}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isRunning}
					/>
					<div className="cr">
						{config?.model && <span className="chip">{config.model}</span>}
						{!isRunning && <span className="kbd">Enter to send · Shift+Enter for newline</span>}
						<span className="sp" />
						{isRunning ? (
							<button
								type="button"
								className="send stop"
								onClick={handleStop}
								aria-label="Stop task"
								title="Stop task"
							>
								<Square className="size-3.5" /> Stop
							</button>
						) : (
							<button
								type="button"
								className="send"
								disabled={!inputValue.trim()}
								onClick={() => handleSubmit()}
								aria-label="Send"
								title="Send"
							>
								<ArrowUp className="size-4" />
							</button>
						)}
					</div>
				</div>
			</footer>
		</div>
	)
}
