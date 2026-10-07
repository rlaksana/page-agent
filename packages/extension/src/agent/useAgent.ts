/**
 * React hook for using AgentController
 */
import type {
	AgentActivity,
	AgentStatus,
	ExecutionResult,
	HistoricalEvent,
	SupportedLanguage,
} from '@page-agent/core'
import type { LLMConfig } from '@page-agent/llms'
import { useCallback, useEffect, useRef, useState } from 'react'

import { saveSession } from '../lib/db'
import { MultiPageAgent } from './MultiPageAgent'
import { migrateLegacyEndpoint, migrateMaxRetries } from './constants'

/** Language preference: undefined means follow system */
export type LanguagePreference = SupportedLanguage | undefined

export interface AdvancedConfig {
	maxSteps?: number
	systemInstruction?: string
	experimentalLlmsTxt?: boolean
	experimentalIncludeAllTabs?: boolean
	disableNamedToolChoice?: boolean
	/** Hosts the agent must never read or operate on */
	blockedSites?: string[]
	/** Ask before clicking elements whose text matches sensitive keywords */
	confirmSensitiveActions?: boolean
	/**
	 * DOM extraction scope in px, honored by the content script via storage:
	 * -1 = full page (default), 0 = viewport only, N = viewport expanded by N px.
	 */
	viewportExpansion?: number
}

export interface ExtConfig extends LLMConfig, AdvancedConfig {
	language?: LanguagePreference
}

/** A question (or confirmation) the agent is waiting for the user to answer. */
export interface PendingAsk {
	/** 'ask' → free-text answer; 'confirm' → yes/no about a sensitive action */
	kind: 'ask' | 'confirm'
	question: string
	respond: (answer: string) => void
}

export interface UseAgentResult {
	status: AgentStatus
	history: HistoricalEvent[]
	activity: AgentActivity | null
	currentTask: string
	config: ExtConfig | null
	/** False until the stored config finished loading; `config === null` after that means first run */
	configLoaded: boolean
	/** Non-null while the agent is blocked on `ask_user` / a sensitive-action confirmation */
	pendingAsk: PendingAsk | null
	execute: (task: string) => Promise<ExecutionResult>
	stop: () => void
	startNewChat: () => void
	answerAsk: (answer: string) => void
	configure: (config: ExtConfig) => Promise<void>
}

export function useAgent(): UseAgentResult {
	const agentRef = useRef<MultiPageAgent | null>(null)
	const [status, setStatus] = useState<AgentStatus>('idle')
	const [history, setHistory] = useState<HistoricalEvent[]>([])
	const [activity, setActivity] = useState<AgentActivity | null>(null)
	const [currentTask, setCurrentTask] = useState('')
	const [config, setConfig] = useState<ExtConfig | null>(null)
	const [configLoaded, setConfigLoaded] = useState(false)
	const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)

	const cleanupRef = useRef<(() => void) | null>(null)

	const setupAgent = useCallback((newConfig: ExtConfig) => {
		if (cleanupRef.current) {
			cleanupRef.current()
			cleanupRef.current = null
		}

		const { systemInstruction, ...agentConfig } = newConfig
		const agent = new MultiPageAgent({
			...agentConfig,
			instructions: systemInstruction ? { system: systemInstruction } : undefined,
		})
		agentRef.current = agent

		const handleStatusChange = () => {
			const newStatus = agent.status as AgentStatus
			setStatus(newStatus)
			if (newStatus !== 'running') {
				setActivity(null)

				// Persist the finished session here (not in the sidepanel view) so
				// every consumer of this hook records runs — sidepanel, hub, MCP.
				if (
					(newStatus === 'completed' || newStatus === 'error' || newStatus === 'stopped') &&
					agent.task &&
					agent.history.length > 0
				) {
					saveSession({
						task: agent.task,
						history: [...agent.history],
						status: newStatus,
					}).catch((err) => console.error('[useAgent] Failed to save session:', err))
				}
			}
		}

		const handleHistoryChange = () => {
			setHistory([...agent.history])
		}

		const handleActivity = (e: Event) => {
			const newActivity = (e as CustomEvent).detail as AgentActivity
			setActivity(newActivity)
		}

		agent.addEventListener('statuschange', handleStatusChange)
		agent.addEventListener('historychange', handleHistoryChange)
		agent.addEventListener('activity', handleActivity)

		// Human-in-the-loop: surface `ask_user` as a sidepanel prompt. While waiting,
		// set `agentAwaitingUser` in storage so the content script's mask polling
		// releases the mask and the user can interact with the page (e.g. captcha).
		agent.onAskUser = (question, options) => {
			const signal = options?.signal
			void chrome.storage.local.set({ agentAwaitingUser: true })
			return new Promise<string>((resolve, reject) => {
				setPendingAsk({ kind: 'ask', question, respond: resolve })
				const rejectAborted = () => {
					// `signal.reason` is not guaranteed to be an Error object.
					const reason = signal?.reason
					reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'))
				}
				if (signal) {
					if (signal.aborted) {
						rejectAborted()
						return
					}
					signal.addEventListener('abort', rejectAborted, { once: true })
				}
			}).finally(() => {
				void chrome.storage.local.set({ agentAwaitingUser: false })
				setPendingAsk(null)
			})
		}

		// Sensitive-action confirmation (click on payment/delete-like elements)
		// shares the same prompt surface as ask_user.
		agent.onConfirmAction = (description) =>
			new Promise<boolean>((resolve) => {
				setPendingAsk({
					kind: 'confirm',
					question: description,
					respond: (answer) => resolve(/^y(es)?$/i.test(answer)),
				})
			}).finally(() => setPendingAsk(null))

		cleanupRef.current = () => {
			agent.removeEventListener('statuschange', handleStatusChange)
			agent.removeEventListener('historychange', handleHistoryChange)
			agent.removeEventListener('activity', handleActivity)
			setPendingAsk(null)
			agent.dispose()
		}
	}, [])

	useEffect(() => {
		chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig']).then((result) => {
			// First run: no stored config. Leave `config` null so the UI shows
			// onboarding (demo / own key) instead of silently starting the demo agent.
			if (!result.llmConfig) {
				setConfigLoaded(true)
				return
			}

			let llmConfig = result.llmConfig as LLMConfig
			const language = (result.language as SupportedLanguage) || undefined
			const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}

			// Auto-migrate legacy testing endpoints
			const legacyMigrated = migrateLegacyEndpoint(llmConfig)
			if (legacyMigrated !== llmConfig) {
				llmConfig = legacyMigrated
			}

			// Auto-migrate stale maxRetries (library default bumped from 2 → 10)
			const retriesMigrated = migrateMaxRetries(llmConfig)
			if (retriesMigrated !== llmConfig) {
				llmConfig = retriesMigrated
			}

			if (llmConfig !== result.llmConfig) {
				void chrome.storage.local.set({ llmConfig })
			}

			const initialConfig = { ...llmConfig, ...advancedConfig, language }
			setConfig(initialConfig)
			setupAgent(initialConfig)
			setConfigLoaded(true)
		})

		return () => {
			if (cleanupRef.current) {
				cleanupRef.current()
				cleanupRef.current = null
			}
		}
	}, [setupAgent])

	const execute = useCallback(async (task: string) => {
		const agent = agentRef.current
		if (!agent) throw new Error('Agent not initialized')

		setCurrentTask(task)
		setHistory([])
		return agent.execute(task)
	}, [])

	const stop = useCallback(() => {
		agentRef.current?.stop()
	}, [])

	/**
	 * Clear the current chat: reset the view and drop the agent's
	 * cross-task conversation context.
	 */
	const startNewChat = useCallback(() => {
		setCurrentTask('')
		setHistory([])
		setActivity(null)
		agentRef.current?.startNewChat()
	}, [])

	/**
	 * Resolve the agent's pending `ask_user` / confirmation prompt.
	 * (Double-invocation under StrictMode is harmless: a promise ignores
	 * a second resolve.)
	 */
	const answerAsk = useCallback((answer: string) => {
		setPendingAsk((current) => {
			current?.respond(answer)
			return null
		})
	}, [])

	const configure = useCallback(
		async ({
			language,
			maxSteps,
			systemInstruction,
			experimentalLlmsTxt,
			experimentalIncludeAllTabs,
			disableNamedToolChoice,
			blockedSites,
			confirmSensitiveActions,
			viewportExpansion,
			...llmConfig
		}: ExtConfig) => {
			await chrome.storage.local.set({ llmConfig })
			if (language) {
				await chrome.storage.local.set({ language })
			} else {
				await chrome.storage.local.remove('language')
			}
			const advancedConfig: AdvancedConfig = {
				maxSteps,
				systemInstruction,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
				disableNamedToolChoice,
				blockedSites,
				confirmSensitiveActions,
				viewportExpansion,
			}
			await chrome.storage.local.set({ advancedConfig })
			const newConfig = { ...llmConfig, ...advancedConfig, language }
			setConfig(newConfig)
			setupAgent(newConfig)
		},
		[setupAgent]
	)

	return {
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
	}
}
