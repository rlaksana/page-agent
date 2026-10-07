import {
	ArrowDownToLine,
	ArrowLeft,
	CircleCheck,
	CircleDashed,
	CircleX,
	History as HistoryIcon,
	RotateCcw,
	Search,
	Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { type SessionRecord, clearSessions, deleteSession, listSessions } from '@/lib/db'
import { downloadHistoryExport } from '@/lib/history-export'
import { type TKey, type Translate, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function timeAgo(ts: number, t: Translate): string {
	const seconds = Math.floor((Date.now() - ts) / 1000)
	if (seconds < 60) return t('history.justNow')
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return t('history.minutesAgo', { n: minutes })
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return t('history.hoursAgo', { n: hours })
	const days = Math.floor(hours / 24)
	return t('history.daysAgo', { n: days })
}

/** Group key: same calendar day → shared label. */
function dayLabel(ts: number, t: Translate): string {
	const d = new Date(ts)
	const today = new Date()
	const yesterday = new Date(today)
	yesterday.setDate(today.getDate() - 1)
	const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
	if (same(d, today)) return t('history.today')
	if (same(d, yesterday)) return t('history.yesterday')
	return d.toLocaleDateString()
}

type Filter = 'all' | 'done' | 'failed'

const FILTERS: { key: Filter; label: TKey }[] = [
	{ key: 'all', label: 'history.filterAll' },
	{ key: 'done', label: 'history.filterDone' },
	{ key: 'failed', label: 'history.filterFailed' },
]

export function HistoryList({
	onSelect,
	onBack,
	onRerun,
}: {
	onSelect: (id: string) => void
	onBack: () => void
	onRerun: (task: string) => void
}) {
	const t = useT()
	const [sessions, setSessions] = useState<SessionRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [query, setQuery] = useState('')
	const [filter, setFilter] = useState<Filter>('all')

	const load = useCallback(async () => {
		try {
			setSessions(await listSessions())
		} catch (err) {
			console.error('[HistoryList] Failed to load sessions:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const handleDelete = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation()
		await deleteSession(id)
		setSessions((prev) => prev.filter((s) => s.id !== id))
	}

	const handleExport = (e: React.MouseEvent, session: SessionRecord) => {
		e.stopPropagation()
		downloadHistoryExport(session.task, session.createdAt, session.history)
	}

	const handleRerun = (e: React.MouseEvent, task: string) => {
		e.stopPropagation()
		onRerun(task)
	}

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		return sessions
			.filter((s) =>
				filter === 'done'
					? s.status === 'completed'
					: filter === 'failed'
						? s.status === 'error'
						: true
			)
			.filter((s) => !q || s.task.toLowerCase().includes(q))
			.sort((a, b) => b.createdAt - a.createdAt)
	}, [sessions, query, filter])

	// Group consecutive sessions sharing a day label.
	const groups = useMemo(() => {
		const out: { label: string; items: SessionRecord[] }[] = []
		for (const s of filtered) {
			const label = dayLabel(s.createdAt, t)
			const last = out[out.length - 1]
			if (last && last.label === label) {
				last.items.push(s)
			} else {
				out.push({ label, items: [s] })
			}
		}
		return out
	}, [filtered, t])

	return (
		<>
			<div className="sub">
				<button
					type="button"
					className="ib"
					onClick={onBack}
					aria-label={t('common.back')}
					title={t('common.back')}
				>
					<ArrowLeft className="size-4" />
				</button>
				<span className="ttl">{t('history.title')}</span>
				<span className="sp" />
				{sessions.length > 0 && (
					<button
						type="button"
						className="btn g"
						onClick={async () => {
							await clearSessions()
							setSessions([])
						}}
					>
						<Trash2 className="size-3.5" /> {t('history.clearAll')}
					</button>
				)}
			</div>

			<div className="tools">
				<div className="sch">
					<Search className="size-4" />
					<input
						className="in"
						placeholder={t('history.search')}
						aria-label={t('history.search')}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
				<div className="seg" role="radiogroup" aria-label={t('history.title')}>
					{FILTERS.map(({ key, label }) => (
						<button
							key={key}
							type="button"
							role="radio"
							aria-checked={filter === key}
							className={cn(filter === key && 'on')}
							onClick={() => setFilter(key)}
						>
							{t(label)}
						</button>
					))}
				</div>
			</div>

			<div className="hlist">
				{loading && (
					<div aria-label={t('history.loading')} aria-busy="true">
						{[...Array(4)].map((_, i) => (
							<div key={i} className="hrw">
								<div className="hrow" style={{ cursor: 'default' }}>
									<div className="size-4 rounded-full bg-muted animate-pulse" />
									<span>
										<div className="h-3 bg-muted animate-pulse rounded w-3/4" />
										<div className="h-2 bg-muted animate-pulse rounded w-1/3 mt-1.5" />
									</span>
								</div>
							</div>
						))}
					</div>
				)}

				{!loading && filtered.length === 0 && (
					<div className="empty">
						<HistoryIcon className="size-8" style={{ color: 'var(--text-3)' }} />
						<p className="meta">{query ? t('history.noMatch') : t('history.none')}</p>
					</div>
				)}

				{groups.map((group) => (
					<div key={group.label + group.items[0].id}>
						<div className="gl">
							<span className="lab">{group.label}</span>
						</div>
						{group.items.map((session) => (
							<div key={session.id} className="hrw">
								<button type="button" className="hrow" onClick={() => onSelect(session.id)}>
									{session.status === 'completed' ? (
										<CircleCheck className="size-4 okc" />
									) : session.status === 'error' ? (
										<CircleX className="size-4 erc" />
									) : (
										<CircleDashed className="size-4 mut" />
									)}
									<span>
										<span className="tx1">{session.task}</span>
										<div className="mt">
											{timeAgo(session.createdAt, t)} · {session.history.length} {t('common.steps')}
											{session.status === 'error' ? ` · ${t('history.failed')}` : ''}
											{session.status === 'stopped' ? ` · ${t('history.stopped')}` : ''}
										</div>
									</span>
								</button>
								<div className="hact">
									<button
										type="button"
										className="ib sm"
										onClick={(e) => handleRerun(e, session.task)}
										title={t('common.runAgain')}
										aria-label={t('history.runAgainFor', { task: session.task })}
									>
										<RotateCcw className="size-3.5" />
									</button>
									<button
										type="button"
										className="ib sm"
										onClick={(e) => handleExport(e, session)}
										title={t('history.exportJson')}
										aria-label={t('history.exportFor', { task: session.task })}
									>
										<ArrowDownToLine className="size-3.5" />
									</button>
									<button
										type="button"
										className="ib sm"
										onClick={(e) => handleDelete(e, session.id)}
										title={t('common.delete')}
										aria-label={t('history.deleteFor', { task: session.id })}
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							</div>
						))}
					</div>
				))}
			</div>
		</>
	)
}
