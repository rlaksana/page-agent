import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InvokeError, InvokeErrorTypes, LLM } from './index'
import type { LLMClient } from './types'

function makeLLM(maxRetries = 2): LLM {
	return new LLM({
		baseURL: 'http://test.local/v1',
		model: 'gpt-5',
		maxRetries,
	})
}

function abortError(): Error {
	const err = new Error('aborted')
	err.name = 'AbortError'
	return err
}

describe('LLM.invoke retry behavior', () => {
	let llm: LLM
	let client: { invoke: ReturnType<typeof vi.fn> }
	const signal = new AbortController().signal

	beforeEach(() => {
		llm = makeLLM(2)
		client = { invoke: vi.fn() }
		llm.client = client as unknown as LLMClient
	})

	it('returns immediately on first success', async () => {
		client.invoke.mockResolvedValueOnce('ok')
		const retryListener = vi.fn()
		llm.addEventListener('retry', retryListener)

		await expect(llm.invoke([], {}, signal)).resolves.toBe('ok')
		expect(client.invoke).toHaveBeenCalledOnce()
		expect(retryListener).not.toHaveBeenCalled()
	})

	it('retries up to maxRetries on retryable errors, then throws last error', async () => {
		const retryable = new InvokeError(InvokeErrorTypes.NETWORK_ERROR, 'boom')
		client.invoke
			.mockRejectedValueOnce(retryable)
			.mockRejectedValueOnce(retryable)
			.mockRejectedValueOnce(retryable)

		await expect(llm.invoke([], {}, signal)).rejects.toBe(retryable)
		// 1 initial + 2 retries = 3 attempts total
		expect(client.invoke).toHaveBeenCalledTimes(3)
	})

	it('succeeds on retry after transient failure', async () => {
		const retryable = new InvokeError(InvokeErrorTypes.RATE_LIMIT, 'slow down')
		client.invoke.mockRejectedValueOnce(retryable).mockResolvedValueOnce('ok')

		await expect(llm.invoke([], {}, signal)).resolves.toBe('ok')
		expect(client.invoke).toHaveBeenCalledTimes(2)
	})

	it('emits "retry" events with attempt count and lastError', async () => {
		const err1 = new InvokeError(InvokeErrorTypes.NETWORK_ERROR, 'first')
		const err2 = new InvokeError(InvokeErrorTypes.NETWORK_ERROR, 'second')
		client.invoke
			.mockRejectedValueOnce(err1)
			.mockRejectedValueOnce(err2)
			.mockResolvedValueOnce('ok')

		const events: { attempt: number; maxAttempts: number; lastError: Error }[] = []
		llm.addEventListener('retry', (e) => {
			events.push((e as CustomEvent).detail)
		})

		await llm.invoke([], {}, signal)

		expect(events).toEqual([
			{ attempt: 1, maxAttempts: 2, lastError: err1 },
			{ attempt: 2, maxAttempts: 2, lastError: err2 },
		])
	})

	it('does not retry on AbortError, throws immediately', async () => {
		const err = abortError()
		client.invoke.mockRejectedValueOnce(err)

		await expect(llm.invoke([], {}, signal)).rejects.toBe(err)
		expect(client.invoke).toHaveBeenCalledOnce()
	})

	it('does not retry on non-retryable InvokeError (AUTH_ERROR)', async () => {
		const err = new InvokeError(InvokeErrorTypes.AUTH_ERROR, 'bad token')
		client.invoke.mockRejectedValueOnce(err)

		await expect(llm.invoke([], {}, signal)).rejects.toBe(err)
		expect(client.invoke).toHaveBeenCalledOnce()
	})

	it('does not retry on non-retryable InvokeError (CONFIG_ERROR)', async () => {
		const err = new InvokeError(InvokeErrorTypes.CONFIG_ERROR, 'bad config')
		client.invoke.mockRejectedValueOnce(err)

		await expect(llm.invoke([], {}, signal)).rejects.toBe(err)
		expect(client.invoke).toHaveBeenCalledOnce()
	})

	it('retries plain (non-InvokeError) errors as unknown failures', async () => {
		// Plain errors are treated as retryable by withRetry (only InvokeError carries retryable flag)
		const plain = new TypeError('weird')
		client.invoke.mockRejectedValueOnce(plain).mockResolvedValueOnce('ok')

		await expect(llm.invoke([], {}, signal)).resolves.toBe('ok')
		expect(client.invoke).toHaveBeenCalledTimes(2)
	})

	it('waits for retryAfterMs (Retry-After) before retrying', async () => {
		vi.useFakeTimers()
		try {
			const rateLimited = new InvokeError(InvokeErrorTypes.RATE_LIMIT, 'slow down')
			rateLimited.retryAfterMs = 1_000
			client.invoke.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce('ok')

			const promise = llm.invoke([], {}, signal)
			await vi.advanceTimersByTimeAsync(0)
			expect(client.invoke).toHaveBeenCalledOnce()

			// Still inside the server-advised wait — no retry yet.
			await vi.advanceTimersByTimeAsync(999)
			expect(client.invoke).toHaveBeenCalledTimes(1)

			await vi.advanceTimersByTimeAsync(1)
			await expect(promise).resolves.toBe('ok')
			expect(client.invoke).toHaveBeenCalledTimes(2)
		} finally {
			vi.useRealTimers()
		}
	})

	it('uses exponential backoff with jitter when no Retry-After is given', async () => {
		vi.useFakeTimers()
		try {
			const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
			const retryable = new InvokeError(InvokeErrorTypes.NETWORK_ERROR, 'boom')
			client.invoke.mockRejectedValueOnce(retryable).mockResolvedValueOnce('ok')

			const promise = llm.invoke([], {}, signal)
			await vi.advanceTimersByTimeAsync(0)

			const delay = setTimeoutSpy.mock.calls.at(-1)![1]!
			// Attempt 1: 250ms base + up to 250ms jitter.
			expect(delay).toBeGreaterThanOrEqual(250)
			expect(delay).toBeLessThanOrEqual(500)

			await vi.advanceTimersByTimeAsync(delay)
			await expect(promise).resolves.toBe('ok')
		} finally {
			vi.useRealTimers()
		}
	})

	it('caps a server-advised Retry-After at 60 seconds', async () => {
		vi.useFakeTimers()
		try {
			const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
			const rateLimited = new InvokeError(InvokeErrorTypes.RATE_LIMIT, 'slow down')
			rateLimited.retryAfterMs = 3_600_000
			client.invoke.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce('ok')

			const promise = llm.invoke([], {}, signal)
			await vi.advanceTimersByTimeAsync(0)
			const delay = setTimeoutSpy.mock.calls.at(-1)![1]!
			expect(delay).toBeLessThanOrEqual(60_250)
			await vi.advanceTimersByTimeAsync(delay)
			await expect(promise).resolves.toBe('ok')
		} finally {
			vi.useRealTimers()
		}
	})

	it('cuts the retry wait short when aborted', async () => {
		vi.useFakeTimers()
		try {
			const controller = new AbortController()
			const retryable = new InvokeError(InvokeErrorTypes.NETWORK_ERROR, 'boom')
			client.invoke.mockRejectedValue(retryable)

			const promise = llm.invoke([], {}, controller.signal)
			await vi.advanceTimersByTimeAsync(0)
			controller.abort()
			await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
		} finally {
			vi.useRealTimers()
		}
	})

	it('tells the model what was rejected on retry so it can self-correct', async () => {
		const retryable = new InvokeError(InvokeErrorTypes.INVALID_TOOL_ARGS, 'bad args')
		client.invoke.mockRejectedValueOnce(retryable).mockResolvedValueOnce('ok')

		await expect(llm.invoke([{ role: 'user', content: 'do it' }], {}, signal)).resolves.toBe('ok')
		const secondCall = client.invoke.mock.calls.at(-1)![0] as unknown as { content: string }[]
		expect(secondCall).toHaveLength(2)
		expect(secondCall[1].content).toContain('rejected')
		expect(secondCall[1].content).toContain('invalid_tool_args')
	})

	it('maps a hung request (TimeoutError) to a retryable NETWORK_ERROR', async () => {
		const hungFetch = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
		const timedLLM = new LLM({
			baseURL: 'http://test.local/v1',
			model: 'gpt-5',
			maxRetries: 0,
			customFetch: hungFetch as unknown as typeof fetch,
		})

		await expect(timedLLM.invoke([], {}, signal)).rejects.toMatchObject({
			type: InvokeErrorTypes.NETWORK_ERROR,
			retryable: true,
		})
		expect(hungFetch).toHaveBeenCalledOnce()
	})
})
