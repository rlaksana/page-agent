import { ArrowDownToLine, ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CopyIconButton, EventCard } from '@/components/cards'
import { type SessionRecord, deleteSession, getSession } from '@/lib/db'
import { downloadHistoryExport } from '@/lib/history-export'
import { cn } from '@/lib/utils'

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
	completed: { cls: 'p-ok', label: 'Completed' },
	error: { cls: 'p-err', label: 'Failed' },
	stopped: { cls: 'p-warn', label: 'Stopped' },
}

export function HistoryDetail({
	sessionId,
	onBack,
	onRerun,
}: {
	sessionId: string
	onBack: () => void
	onRerun: (task: string) => void
}) {
	const [session, setSession] = useState<SessionRecord | null>(null)

	useEffect(() => {
		getSession(sessionId).then((s) => setSession(s ?? null))
	}, [sessionId])

	if (!session) {
		return (
			<div className="empty">
				<span className="meta">Loading…</span>
			</div>
		)
	}

	const pill = STATUS_PILL[session.status] ?? STATUS_PILL.stopped
	const stepCount = session.history.filter((e) => e.type === 'step').length
	const lastStepIdx = (() => {
		for (let i = session.history.length - 1; i >= 0; i--) {
			if (session.history[i].type === 'step') return i
		}
		return -1
	})()

	return (
		<>
			<div className="sub">
				<button type="button" className="ib" onClick={onBack} aria-label="Back" title="Back">
					<ArrowLeft className="size-4" />
				</button>
				<span className="ttl">History</span>
				<span className="sp" />
			</div>

			<div className="task">
				<div className="tr">
					<span className="lab">Task</span>
					<span className="sp" />
					<span className={cn('pill', pill.cls)}>
						<span className="dot" />
						{pill.label}
					</span>
					<CopyIconButton text={session.task} label="Copy task" />
				</div>
				<p className="tt" title={session.task}>
					{session.task}
				</p>
				<div className="meta" style={{ marginTop: 8 }}>
					{new Date(session.createdAt).toLocaleString()} · {stepCount} steps
				</div>
				<div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
					<button type="button" className="btn" onClick={() => onRerun(session.task)}>
						<RotateCcw className="size-3.5" /> Run again
					</button>
					<button
						type="button"
						className="btn"
						onClick={() => downloadHistoryExport(session.task, session.createdAt, session.history)}
					>
						<ArrowDownToLine className="size-3.5" /> Export
					</button>
					<button
						type="button"
						className="btn d"
						onClick={async () => {
							await deleteSession(sessionId)
							onBack()
						}}
					>
						<Trash2 className="size-3.5" /> Delete
					</button>
				</div>
			</div>

			{/* Events (read-only) */}
			<main className="feed">
				{session.history.map((event, index) => (
					<EventCard key={index} event={event} last={index === lastStepIdx} />
				))}
			</main>
		</>
	)
}
