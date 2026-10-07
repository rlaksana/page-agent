/**
 * content script for RemotePageController
 */
import { PageController } from '@page-agent/page-controller'

export function initPageController() {
	let pageController: PageController | null = null
	let intervalID: number | null = null

	const myTabIdPromise = chrome.runtime
		.sendMessage({ type: 'PAGE_CONTROL', action: 'get_my_tab_id' })
		.then((response) => {
			return (response as { tabId: number | null }).tabId
		})
		.catch((error) => {
			// Silently swallow context invalidation: the polling loop will
			// tear itself down on the next tick. Anything else surfaces.
			const msg = error instanceof Error ? error.message : String(error)
			if (!msg.includes('Extension context invalidated')) {
				console.error('[RemotePageController.ContentScript]: Failed to get my tab id', error)
			}
			return null
		})

	/**
	 * Full-page DOM extraction by default (matches the @page-agent/page-controller
	 * default). The stored advanced config can narrow it for token economy:
	 * 0 = viewport only, N = viewport expanded by N px.
	 */
	const DEFAULT_VIEWPORT_EXPANSION = -1

	let pcPromise: Promise<PageController> | null = null

	function getPC(): Promise<PageController> {
		if (!pcPromise) {
			pcPromise = (async () => {
				const result = await chrome.storage.local.get('advancedConfig')
				const advancedConfig = (result.advancedConfig ?? {}) as { viewportExpansion?: number }
				const viewportExpansion =
					typeof advancedConfig.viewportExpansion === 'number'
						? advancedConfig.viewportExpansion
						: DEFAULT_VIEWPORT_EXPANSION
				return new PageController({ enableMask: false, viewportExpansion })
			})()
			// Allow a retry after a failed init (e.g. transient storage error).
			pcPromise.catch(() => {
				pcPromise = null
			})
		}
		return pcPromise
	}

	function resetPC() {
		if (pageController) {
			pageController.dispose()
			pageController = null
		}
		pcPromise = null
	}

	intervalID = window.setInterval(() => {
		// Synchronous guard: bail out if the extension context is already gone.
		if (!chrome.runtime?.id) {
			if (intervalID !== null) clearInterval(intervalID)
			intervalID = null
			pageController?.dispose()
			pageController = null
			return
		}
		void (async () => {
			// Re-check inside the async IIFE: a reload can land between the sync
			// guard above and the first await below. chrome.* APIs throw
			// "Extension context invalidated" without lastError when this happens.
			if (!chrome.runtime?.id) return
			try {
				const agentHeartbeat = (await chrome.storage.local.get('agentHeartbeat')).agentHeartbeat
				// Re-check after every await — invalidation can happen mid-flight.
				if (!chrome.runtime?.id) return
				const now = Date.now()
				const agentInTouch = typeof agentHeartbeat === 'number' && now - agentHeartbeat < 2_000

				const isAgentRunning = (await chrome.storage.local.get('isAgentRunning')).isAgentRunning
				if (!chrome.runtime?.id) return
				const currentTabId = (await chrome.storage.local.get('currentTabId')).currentTabId
				if (!chrome.runtime?.id) return
				// The agent is waiting for the user (ask_user / confirmation): release the
				// mask so the user can interact with the page (e.g. solve a captcha).
				const agentAwaitingUser = (await chrome.storage.local.get('agentAwaitingUser'))
					.agentAwaitingUser
				if (!chrome.runtime?.id) return

				const shouldShowMask =
					isAgentRunning &&
					!agentAwaitingUser &&
					agentInTouch &&
					currentTabId === (await myTabIdPromise)
				if (!chrome.runtime?.id) return

				if (shouldShowMask) {
					const pc = await getPC()
					pc.initMask()
					await pc.showMask()
				} else {
					// await getPC().hideMask()
					if (pageController) {
						pageController.hideMask()
						pageController.cleanUpHighlights()
					}
				}

				if (!isAgentRunning && agentInTouch) {
					resetPC()
				}
			} catch (err) {
				// Swallow context-invalidation specifically — that's the loop's
				// intended exit signal, not a real error. Anything else surfaces.
				const msg = err instanceof Error ? err.message : String(err)
				if (!msg.includes('Extension context invalidated')) {
					console.error('[RemotePageController.ContentScript]: poll iteration failed', err)
				}
			}
		})()
	}, 500)

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type !== 'PAGE_CONTROL') {
			// sendResponse({
			// 	success: false,
			// 	error: `[RemotePageController.ContentScript]: Invalid message type: ${message.type}`,
			// })
			return
		}

		const { action, payload } = message
		const methodName = getMethodName(action)

		switch (action) {
			case 'get_last_update_time':
			case 'get_browser_state':
			case 'update_tree':
			case 'clean_up_highlights':
			case 'click_element':
			case 'input_text':
			case 'select_option':
			case 'scroll':
			case 'scroll_horizontally':
			case 'press_key':
			case 'get_page_text':
			case 'get_element_text':
			case 'execute_javascript':
				;(async () => {
					try {
						const pc = (await getPC()) as any
						sendResponse(await pc[methodName](...(payload || [])))
					} catch (error: any) {
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						})
					}
				})()
				break

			default:
				sendResponse({
					success: false,
					error: `Unknown PAGE_CONTROL action: ${action}`,
				})
		}

		return true
	})
}

function getMethodName(action: string): string {
	switch (action) {
		case 'get_last_update_time':
			return 'getLastUpdateTime' as const
		case 'get_browser_state':
			return 'getBrowserState' as const
		case 'update_tree':
			return 'updateTree' as const
		case 'clean_up_highlights':
			return 'cleanUpHighlights' as const

		// DOM actions

		case 'click_element':
			return 'clickElement' as const
		case 'input_text':
			return 'inputText' as const
		case 'select_option':
			return 'selectOption' as const
		case 'scroll':
			return 'scroll' as const
		case 'scroll_horizontally':
			return 'scrollHorizontally' as const
		case 'press_key':
			return 'pressKey' as const
		case 'get_page_text':
			return 'getPageText' as const
		case 'get_element_text':
			return 'getElementText' as const
		case 'execute_javascript':
			return 'executeJavascript' as const

		default:
			return action
	}
}
