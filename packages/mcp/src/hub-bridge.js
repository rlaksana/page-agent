#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const EXT_ID = 'akldabonmimlicnjlflnapfeklbfemhj'
const STORE_URL = `https://chromewebstore.google.com/detail/page-agent-ext/${EXT_ID}`
const LOOPBACK_HOST = 'localhost'

const launcherTemplate = readFileSync(
	fileURLToPath(new URL('./launcher.html', import.meta.url)),
	'utf-8'
)

/**
 * HTTP + WebSocket bridge to the hub.html extension tab.
 * - HTTP serves the launcher page (triggers extension to open hub)
 * - WS carries execute/stop commands and result/error responses
 *
 * Supports multiple MCP client processes (one per terminal): the first
 * process to bind the port becomes the owner and holds the extension WS
 * connection. Later processes become standbys — their tool calls are
 * proxied to the owner over HTTP instead of crashing on EADDRINUSE.
 * If the owner exits, the next standby to run a tool takes over the port.
 */
export class HubBridge {
	/** @type {number} */
	port

	/** Called (owner mode) after this instance takes over the port from a dead owner. */
	onTakeover = null

	/** @type {http.Server} */
	#httpServer

	/** @type {WebSocketServer} */
	#wss

	/** @type {boolean} */
	#isOwner = false

	/** @type {import('ws').WebSocket | null} */
	#hub = null

	/** @type {{ resolve: (r: {success: boolean, data: string}) => void, reject: (e: Error) => void } | null} */
	#pendingTask = null

	/** @param {number} port */
	constructor(port) {
		this.port = port
		this.#httpServer = http.createServer((req, res) => this.#onRequest(req, res))
		// /execute responses stay open for the whole (potentially long) browser task;
		// Node's default 5-min request timeout would kill the proxied response.
		this.#httpServer.requestTimeout = 0
		this.#wss = new WebSocketServer({ server: this.#httpServer })
		this.#wss.on('connection', (ws) => this.#onConnection(ws))
		// `ws` re-emits the HTTP server's 'error' on itself. Without a listener
		// here, EventEmitter throws an uncaught exception on e.g. EADDRINUSE,
		// killing the process before the HTTP server's own handler can react.
		this.#wss.on('error', (err) =>
			console.error(`[page-agent-mcp] WebSocket server error: ${err.message}`)
		)
	}

	/**
	 * Bind the hub port.
	 * @returns {Promise<boolean>} true if this instance owns the hub (bound the
	 * port), false if another instance already owns it and this one will proxy.
	 */
	async start() {
		try {
			await new Promise((resolve, reject) => {
				this.#httpServer.once('error', reject)
				this.#httpServer.listen(this.port, LOOPBACK_HOST, resolve)
			})
			this.#isOwner = true
			console.error(`[page-agent-mcp] HTTP + WS on http://${LOOPBACK_HOST}:${this.port}`)
			return true
		} catch (err) {
			if (/** @type {NodeJS.ErrnoException} */ (err)?.code === 'EADDRINUSE') {
				console.error(
					`[page-agent-mcp] Port ${this.port} owned by another instance; tools will proxy to it`
				)
				return false
			}
			throw err
		}
	}

	/** Stop the HTTP/WS servers (owner mode). @returns {Promise<void>} */
	stop() {
		return new Promise((resolve) => this.#httpServer.close(() => resolve()))
	}

	get isOwner() {
		return this.#isOwner
	}

	get connected() {
		return this.#hub?.readyState === 1
	}

	get busy() {
		return this.#pendingTask !== null
	}

	/** @returns {Promise<{connected: boolean, busy: boolean}>} */
	async getStatus() {
		if (this.#isOwner) return { connected: this.connected, busy: this.busy }
		try {
			return await this.#request('GET', '/status')
		} catch (err) {
			if (await this.#takeoverIfOwnerDead(err)) return { connected: false, busy: false }
			throw err
		}
	}

	/**
	 * @param {string} task
	 * @param {Record<string, unknown>} [config]
	 * @returns {Promise<{success: boolean, data: string}>}
	 */
	async executeTask(task, config) {
		if (!this.#isOwner) {
			try {
				return await this.#request('POST', '/execute', { task, config })
			} catch (err) {
				if (await this.#takeoverIfOwnerDead(err)) {
					throw new Error(
						'The previous hub owner process exited. This session took over the hub port ' +
							'and re-opened the launcher page. Retry the task once the hub tab reconnects.'
					)
				}
				throw err
			}
		}

		if (!this.connected) throw new Error('Hub is not connected. Is the extension running?')
		if (this.#pendingTask) throw new Error('Agent is already running a task.')

		return new Promise((resolve, reject) => {
			this.#pendingTask = { resolve, reject }
			this.#hub.send(JSON.stringify({ type: 'execute', task, config }))
		})
	}

	stopTask() {
		if (!this.#isOwner) {
			this.#request('POST', '/stop').catch((err) =>
				console.error(`[page-agent-mcp] Stop failed: ${err.message}`)
			)
			return
		}
		if (this.connected) {
			this.#hub.send(JSON.stringify({ type: 'stop' }))
		}
	}

	// TODO: Add version checking

	/**
	 * @param {string} method
	 * @param {string} path
	 * @param {unknown} [body]
	 * @returns {Promise<any>}
	 */
	async #request(method, path, body) {
		const res = await fetch(`http://${LOOPBACK_HOST}:${this.port}${path}`, {
			method,
			headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		})
		const data = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(data.error ?? `Hub owner returned HTTP ${res.status}`)
		return data
	}

	/**
	 * If err is a dead-owner connection failure, try to bind the port ourselves.
	 * @param {unknown} err
	 * @returns {Promise<boolean>} true if this instance became the owner
	 */
	async #takeoverIfOwnerDead(err) {
		if (/** @type {Error & {cause?: {code?: string}}} */ (err)?.cause?.code !== 'ECONNREFUSED') {
			return false
		}
		const tookOver = await this.start()
		if (tookOver) this.onTakeover?.()
		return tookOver
	}

	/** @param {http.IncomingMessage} req */
	#onRequest(req, res) {
		if (req.method === 'POST' && req.url === '/execute') {
			let raw = ''
			req.on('data', (chunk) => (raw += chunk))
			req.on('end', () => {
				/** @type {{task?: string, config?: Record<string, unknown>}} */
				let body
				try {
					body = JSON.parse(raw || '{}')
				} catch {
					res.writeHead(400, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ error: 'Invalid JSON body' }))
					return
				}
				this.executeTask(/** @type {string} */ (body.task), body.config).then(
					(result) => {
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify(result))
					},
					(err) => {
						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: err.message }))
					}
				)
			})
			return
		}

		if (req.method === 'POST' && req.url === '/stop') {
			this.stopTask()
			res.writeHead(204)
			res.end()
			return
		}

		if (req.method === 'GET' && req.url === '/status') {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ connected: this.connected, busy: this.busy }))
			return
		}

		const html = launcherTemplate
			.replaceAll('__EXT_ID__', EXT_ID)
			.replaceAll('__STORE_URL__', STORE_URL)
			.replaceAll('__WS_PORT__', String(this.port))
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		res.end(html)
	}

	/** @param {import('ws').WebSocket} ws */
	#onConnection(ws) {
		if (this.#hub && this.#hub.readyState === 1) {
			ws.close(4000, 'Another hub is already connected')
			return
		}

		this.#hub = ws
		console.error('[page-agent-mcp] Hub connected')

		ws.on('message', (/** @type {Buffer} */ rawData) => {
			/** @type {{ type: string, success?: boolean, data?: string, message?: string }} */
			let msg
			try {
				msg = JSON.parse(rawData.toString('utf-8'))
			} catch {
				return
			}

			if (msg.type === 'result') {
				this.#pendingTask?.resolve({ success: msg.success ?? false, data: msg.data ?? '' })
				this.#pendingTask = null
			} else if (msg.type === 'error') {
				this.#pendingTask?.reject(new Error(msg.message ?? 'Unknown error from hub'))
				this.#pendingTask = null
			}
		})

		ws.on('close', () => {
			console.error('[page-agent-mcp] Hub disconnected')
			if (this.#hub === ws) this.#hub = null
			if (this.#pendingTask) {
				this.#pendingTask.reject(new Error('Hub disconnected while task was running'))
				this.#pendingTask = null
			}
		})
	}
}
