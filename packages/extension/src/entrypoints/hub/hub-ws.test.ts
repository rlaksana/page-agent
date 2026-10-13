import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubWs } from './hub-ws'

/** Minimal WebSocket double: instances are tracked so tests can count reconnects. */
class FakeWebSocket {
	static OPEN = 1
	static instances: FakeWebSocket[] = []

	readyState = FakeWebSocket.OPEN
	#listeners = new Map<string, (() => void)[]>()

	constructor() {
		FakeWebSocket.instances.push(this)
	}

	addEventListener(type: string, listener: () => void) {
		this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener])
	}

	emit(type: string) {
		for (const listener of this.#listeners.get(type) ?? []) listener()
	}

	send() {}

	close() {
		this.readyState = 3
		this.emit('close')
	}
}

const handlers = {
	onExecute: async () => ({ success: true, data: '' }),
	onStop: () => {},
}

describe('HubWs reconnect', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
		FakeWebSocket.instances = []
	})

	it('opens a new socket 2s after an unexpected close', async () => {
		vi.useFakeTimers()
		vi.stubGlobal('WebSocket', FakeWebSocket)
		const states: string[] = []
		const hubWs = new HubWs(38401, handlers, (state) => states.push(state))

		hubWs.connect()
		FakeWebSocket.instances[0].emit('open')
		FakeWebSocket.instances[0].close()

		expect(states).toEqual(['connecting', 'connected', 'disconnected'])
		await vi.advanceTimersByTimeAsync(2000)
		expect(FakeWebSocket.instances).toHaveLength(2)
	})

	it('disconnect() suppresses the scheduled reconnect', async () => {
		vi.useFakeTimers()
		vi.stubGlobal('WebSocket', FakeWebSocket)
		const hubWs = new HubWs(38401, handlers, () => {})

		hubWs.connect()
		FakeWebSocket.instances[0].close()
		hubWs.disconnect()

		await vi.advanceTimersByTimeAsync(10_000)
		expect(FakeWebSocket.instances).toHaveLength(1)
	})

	it('the close event caused by disconnect() does not schedule a reconnect', async () => {
		vi.useFakeTimers()
		vi.stubGlobal('WebSocket', FakeWebSocket)
		const hubWs = new HubWs(38401, handlers, () => {})

		hubWs.connect()
		// disconnect() itself calls #ws.close(), which emits the 'close' event.
		hubWs.disconnect()

		await vi.advanceTimersByTimeAsync(10_000)
		expect(FakeWebSocket.instances).toHaveLength(1)
	})
})
