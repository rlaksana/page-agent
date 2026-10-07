import { OpenAIClient } from './OpenAIClient'
import { InvokeError, InvokeErrorTypes } from './errors'
import type {
	InvokeOptions,
	InvokeResult,
	LLMClient,
	LLMConfig,
	Message,
	ResolvedLLMConfig,
	Tool,
} from './types'

export { InvokeError, InvokeErrorTypes }
export type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool }

/**
 * LLM module
 */
export class LLM extends EventTarget {
	config: ResolvedLLMConfig
	client: LLMClient

	constructor(config: LLMConfig) {
		super()
		this.config = parseLLMConfig(config)

		// Default to OpenAI client
		this.client = new OpenAIClient(this.config)
	}

	/**
	 * - call llm api *once*
	 * - invoke tool call *once*
	 * - return the result of the tool
	 *
	 * Retries are resilient by design: every retryable failure is retried,
	 * and from the second attempt on, the model is told WHY its previous
	 * response was rejected so it can self-correct instead of receiving the
	 * identical request again.
	 */
	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		let lastError: unknown
		return await withRetry(
			async () => {
				const attemptMessages =
					lastError instanceof InvokeError
						? [
								...messages,
								{
									role: 'user' as const,
									content:
										`Your previous response was rejected (${lastError.type}): ${lastError.message}. ` +
										'Fix the problem and respond again with exactly one valid tool call.',
								},
							]
						: messages
				try {
					return await this.client.invoke(attemptMessages, tools, abortSignal, options)
				} catch (error) {
					lastError = error
					throw error
				}
			},
			abortSignal,
			{
				maxRetries: this.config.maxRetries,
				onRetry: (attempt, lastError) => {
					this.dispatchEvent(
						new CustomEvent('retry', {
							detail: { attempt, maxAttempts: this.config.maxRetries, lastError },
						})
					)
				},
			}
		)
	}
}

/** Never wait longer than this on a server-advised Retry-After — a hostile or
 * buggy value like `Retry-After: 86400` must not park a task for a day. */
const MAX_RETRY_AFTER_MS = 60_000

/**
 * Retry a function until it succeeds or reaches the maximum number of retries.
 * Backoff: honors a server-provided `retryAfterMs` (from the Retry-After header,
 * capped at 60s), otherwise exponential — 250ms doubling per attempt, capped
 * at 8s — plus jitter. The wait is abort-aware: canceling cuts it short.
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	abortSignal: AbortSignal,
	settings: {
		maxRetries: number
		onRetry: (attempt: number, lastError: Error) => void
	}
): Promise<T> {
	let attempt = 0
	while (true) {
		try {
			return await fn()
		} catch (error: unknown) {
			if ((error as any)?.name === 'AbortError') throw error
			if (error instanceof InvokeError && !error.retryable) throw error
			attempt++
			if (attempt > settings.maxRetries) throw error

			console.debug('[LLM] retryable failure, will retry:', error)
			settings.onRetry(attempt, error as Error)

			const advised = (error as InvokeError).retryAfterMs
			// A server-advised wait is honored exactly (capped); jitter applies
			// only to our own exponential backoff.
			const delay =
				advised != null
					? Math.min(advised, MAX_RETRY_AFTER_MS)
					: Math.min(8_000, 250 * 2 ** (attempt - 1)) + Math.random() * 250
			await sleepCancellable(delay, abortSignal)
		}
	}
}

/** setTimeout that rejects with AbortError as soon as `signal` fires. */
function sleepCancellable(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException('Aborted', 'AbortError'))
			return
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		const onAbort = () => {
			clearTimeout(timer)
			reject(new DOMException('Aborted', 'AbortError'))
		}
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

export function parseLLMConfig(config: LLMConfig): ResolvedLLMConfig {
	// Runtime validation as defensive programming (types already guarantee these)
	if (!config.baseURL || !config.model) {
		throw new Error(
			'[PageAgent] LLM configuration required. Please provide: baseURL, model. ' +
				'See: https://alibaba.github.io/page-agent/docs/features/models'
		)
	}

	if (config.temperature !== undefined) {
		console.warn(
			'[PageAgent] LLMConfig.temperature is deprecated and will be removed in a future version. ' +
				'Use transformRequestBody to set it only for models you have verified accept it.'
		)
	}

	return {
		baseURL: config.baseURL,
		model: config.model,
		apiKey: config.apiKey || '',
		temperature: config.temperature,
		maxRetries: config.maxRetries ?? 10,
		transformRequestBody: config.transformRequestBody ?? ((requestBody) => requestBody),
		disableNamedToolChoice: config.disableNamedToolChoice ?? false,
		customFetch: (config.customFetch ?? fetch).bind(globalThis), // fetch will be illegal unless bound
	}
}
