import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

import { HubBridge } from './hub-bridge.js'

// Random high port so parallel test runs and dev servers don't collide
const port = 30000 + Math.floor(Math.random() * 20000)
const hubUrl = `ws://localhost:${port}`

/** Connect a fake extension hub tab to the owner bridge */
function connectFakeHub() {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(hubUrl)
		ws.on('open', () => resolve(ws))
		ws.on('error', reject)
	})
}

describe('HubBridge multi-process', () => {
	/** @type {HubBridge[]} */
	let bridges = []
	/** @type {import('ws').WebSocket[]} */
	let sockets = []

	afterEach(async () => {
		for (const ws of sockets) ws.close()
		sockets = []
		for (const bridge of bridges) await bridge.stop()
		bridges = []
	})

	it('second instance on the same port becomes a standby instead of crashing', async () => {
		const owner = new HubBridge(port)
		bridges.push(owner)
		await expect(owner.start()).resolves.toBe(true)

		const standby = new HubBridge(port)
		bridges.push(standby)
		await expect(standby.start()).resolves.toBe(false)
		expect(standby.isOwner).toBe(false)
	})

	it('standby executeTask proxies to the owner and returns the hub result', async () => {
		const owner = new HubBridge(port)
		bridges.push(owner)
		await owner.start()

		const standby = new HubBridge(port)
		bridges.push(standby)
		await standby.start()

		const hubWs = await connectFakeHub()
		sockets.push(hubWs)
		hubWs.on('message', (raw) => {
			const msg = JSON.parse(raw.toString())
			if (msg.type === 'execute') {
				hubWs.send(JSON.stringify({ type: 'result', success: true, data: `ran: ${msg.task}` }))
			}
		})

		await expect(standby.executeTask('hello')).resolves.toEqual({
			success: true,
			data: 'ran: hello',
		})
	})

	it('standby surfaces the owner busy error', async () => {
		const owner = new HubBridge(port)
		bridges.push(owner)
		await owner.start()

		const standby = new HubBridge(port)
		bridges.push(standby)
		await standby.start()

		const hubWs = await connectFakeHub()
		sockets.push(hubWs)
		hubWs.on('message', () => {}) // never replies — task stays pending

		const ownerTask = owner.executeTask('first')
		await expect(standby.executeTask('second')).rejects.toThrow('already running')

		hubWs.send(JSON.stringify({ type: 'result', success: true, data: 'done' }))
		await expect(ownerTask).resolves.toEqual({ success: true, data: 'done' })
	})

	it('standby takes over the port when the owner exits', async () => {
		const owner = new HubBridge(port)
		bridges.push(owner)
		await owner.start()

		const standby = new HubBridge(port)
		bridges.push(standby)
		await standby.start()

		const hubWs = await connectFakeHub()
		const onTakeover = vi.fn()
		standby.onTakeover = onTakeover

		hubWs.terminate() // extension connection drops
		await owner.stop() // owner process dies
		bridges = bridges.filter((b) => b !== owner)

		await expect(standby.executeTask('any')).rejects.toThrow(/took over/)
		expect(standby.isOwner).toBe(true)
		expect(onTakeover).toHaveBeenCalledOnce()
	})
})
