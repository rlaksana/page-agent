import type { HistoricalEvent } from '@page-agent/core'
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

const DB_NAME = 'page-agent-ext'
const DB_VERSION = 1

export interface SessionRecord {
	id: string
	task: string
	history: HistoricalEvent[]
	status: 'completed' | 'error' | 'stopped'
	createdAt: number
}

interface PageAgentDB extends DBSchema {
	sessions: {
		key: string
		value: SessionRecord
		indexes: { 'by-created': number }
	}
}

let dbPromise: Promise<IDBPDatabase<PageAgentDB>> | null = null

function getDB() {
	if (!dbPromise) {
		dbPromise = openDB<PageAgentDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore('sessions', { keyPath: 'id' })
				store.createIndex('by-created', 'createdAt')
			},
		})
	}
	return dbPromise
}

/** Keep the newest N sessions; older ones are trimmed on save. */
const MAX_SESSIONS = 200

export async function saveSession(
	session: Omit<SessionRecord, 'id' | 'createdAt'>
): Promise<SessionRecord> {
	const db = await getDB()
	const record: SessionRecord = {
		...session,
		id: crypto.randomUUID(),
		createdAt: Date.now(),
	}
	await db.put('sessions', record)

	// Index keys come back ascending by createdAt, so the overflow prefix is the oldest.
	const keys = await db.getAllKeysFromIndex('sessions', 'by-created')
	if (keys.length > MAX_SESSIONS) {
		await Promise.all(
			keys.slice(0, keys.length - MAX_SESSIONS).map((key) => db.delete('sessions', key))
		)
	}
	return record
}

/** List sessions, newest first */
export async function listSessions(): Promise<SessionRecord[]> {
	const db = await getDB()
	const all = await db.getAllFromIndex('sessions', 'by-created')
	return all.reverse()
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
	const db = await getDB()
	return db.get('sessions', id)
}

export async function deleteSession(id: string): Promise<void> {
	const db = await getDB()
	await db.delete('sessions', id)
}

export async function clearSessions(): Promise<void> {
	const db = await getDB()
	await db.clear('sessions')
}
