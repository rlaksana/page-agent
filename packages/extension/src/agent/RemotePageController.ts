import type { BrowserState } from '@page-agent/page-controller'

import type { TabsController } from './TabsController'
import { isUrlDenied } from './guards'

const PREFIX = '[RemotePageController]'

const debug = console.debug.bind(console, `\x1b[90m${PREFIX}\x1b[0m`)

function sendMessage(message: {
	type: 'PAGE_CONTROL'
	action: string
	targetTabId: number
	payload?: any
}): Promise<any> {
	return chrome.runtime.sendMessage(message).catch((error) => {
		console.error(PREFIX, message.action, error)
		return null
	})
}

/**
 * Agent side page controller.
 * - live in the agent env (extension page or content script)
 * - communicates with remote PageController via sw
 */
export class RemotePageController {
	tabsController: TabsController

	constructor(tabsController: TabsController) {
		this.tabsController = tabsController
	}

	get currentTabId(): number | null {
		return this.tabsController.currentTabId
	}

	private async getCurrentUrl(): Promise<string> {
		if (!this.currentTabId) return ''
		const { url } = await this.tabsController.getTabInfo(this.currentTabId)
		return url || ''
	}

	private async getCurrentTitle(): Promise<string> {
		if (!this.currentTabId) return ''
		const { title } = await this.tabsController.getTabInfo(this.currentTabId)
		return title || ''
	}

	async getLastUpdateTime(): Promise<number> {
		if (!this.currentTabId) throw new Error('tabsController not initialized.')
		return sendMessage({
			type: 'PAGE_CONTROL',
			action: 'get_last_update_time',
			targetTabId: this.currentTabId,
		})
	}

	async getBrowserState(): Promise<BrowserState> {
		let browserState: BrowserState
		debug('getBrowserState', this.currentTabId)

		const currentUrl = await this.getCurrentUrl()
		const currentTitle = await this.getCurrentTitle()

		if (!this.currentTabId || !isContentScriptAllowed(currentUrl)) {
			if (isUrlDenied(currentUrl)) {
				throw new Error(
					`This site (${currentUrl}) is on the blocked list in the extension settings. ` +
						'The agent cannot read or operate on it.'
				)
			}
			browserState = {
				url: currentUrl,
				title: currentTitle,
				header: '',
				content: '(empty page. either current page is not readable or not loaded yet.)',
				footer: '',
			}
		} else {
			const res = await sendMessage({
				type: 'PAGE_CONTROL',
				action: 'get_browser_state',
				targetTabId: this.currentTabId,
			})
			if (!res || res.success === false) {
				// Common cause: the tab predates the last extension (re)load —
				// Chrome does not re-inject content scripts into already-open tabs.
				// Fail loudly instead of feeding the LLM a broken/empty state, and
				// point at the reload_page action so the agent can recover itself.
				throw new Error(
					`Cannot read the page (${res?.error ?? 'no response from content script'}). ` +
						'Use the reload_page action to reload the tab, then retry. ' +
						'If it still fails, ask the user to reload the tab manually.'
				)
			}
			browserState = res
		}

		const sum = await this.tabsController.summarizeTabs()
		browserState.header = sum + '\n\n' + (browserState.header || '')

		debug('getBrowserState: success', this.currentTabId, browserState)

		return browserState
	}

	async updateTree(): Promise<void> {
		if (!this.currentTabId || !isContentScriptAllowed(await this.getCurrentUrl())) {
			return
		}

		await sendMessage({
			type: 'PAGE_CONTROL',
			action: 'update_tree',
			targetTabId: this.currentTabId,
		})
	}

	async cleanUpHighlights(): Promise<void> {
		if (!this.currentTabId || !isContentScriptAllowed(await this.getCurrentUrl())) {
			return
		}

		await sendMessage({
			type: 'PAGE_CONTROL',
			action: 'clean_up_highlights',
			targetTabId: this.currentTabId,
		})
	}

	async clickElement(...args: any[]): Promise<DomActionReturn> {
		const res = await this.remoteCallDomAction('click_element', args)
		// @note may cause page navigation, wait for 1 second to ensure the page loading started
		await new Promise((resolve) => setTimeout(resolve, 1000))
		return res
	}

	async inputText(...args: any[]): Promise<DomActionReturn> {
		return this.remoteCallDomAction('input_text', args)
	}

	async selectOption(...args: any[]): Promise<DomActionReturn> {
		return this.remoteCallDomAction('select_option', args)
	}

	async scroll(...args: any[]): Promise<DomActionReturn> {
		return this.remoteCallDomAction('scroll', args)
	}

	async scrollHorizontally(...args: any[]): Promise<DomActionReturn> {
		return this.remoteCallDomAction('scroll_horizontally', args)
	}

	async pressKey(...args: any[]): Promise<DomActionReturn> {
		return this.remoteCallDomAction('press_key', args)
	}

	async getPageText(): Promise<{ success: boolean; text?: string; error?: string }> {
		if (!this.currentTabId || !isContentScriptAllowed(await this.getCurrentUrl())) {
			return { success: false, error: 'Page is not readable.' }
		}
		return sendMessage({
			type: 'PAGE_CONTROL',
			action: 'get_page_text',
			targetTabId: this.currentTabId,
		})
	}

	async getElementText(...args: any[]): Promise<DomActionReturn & { text?: string }> {
		return this.remoteCallDomAction('get_element_text', args)
	}

	// `execute_javascript` is intentionally not implemented: AbortSignal cannot cross context

	/** @note Managed by content script via storage polling. */
	async showMask(): Promise<void> {}
	/** @note Managed by content script via storage polling. */
	async hideMask(): Promise<void> {}
	/** @note Managed by content script via storage polling. */
	dispose(): void {}

	private async remoteCallDomAction(action: string, payload: any[]): Promise<DomActionReturn> {
		if (!this.currentTabId) {
			return { success: false, message: 'RemotePageController not initialized.' }
		}

		const url = await this.getCurrentUrl()
		if (isUrlDenied(url)) {
			return {
				success: false,
				message: `Operation not allowed: ${url} is on the blocked list in the extension settings.`,
			}
		}

		if (!isContentScriptAllowed(url)) {
			return {
				success: false,
				message:
					'Operation not allowed on this page. Use open_new_tab to navigate to a web page first.',
			}
		}

		const res = await sendMessage({
			type: 'PAGE_CONTROL',
			action: action,
			targetTabId: this.currentTabId!,
			payload,
		})
		if (!res) {
			// Transport failure — typically the tab navigating mid-call (the
			// content script is torn down during commits). The LLM needs an
			// actionable message, not a bare null.
			return {
				success: false,
				message:
					'No response from the page (it may be navigating). Retry the action, or use reload_page if it persists.',
			}
		}
		if (res.success === false && !res.message) {
			// Older content scripts report `{success:false, error}` — lift it
			// into `message` so every DomActionReturn speaks the same contract.
			res.message = res.error ?? 'The page action failed.'
		}
		return res
	}
}

interface DomActionReturn {
	success: boolean
	message: string
}

/**
 * Check if a URL can run content scripts.
 */
export function isContentScriptAllowed(url: string | undefined): boolean {
	if (!url) return false

	const restrictedPatterns = [
		/^chrome:\/\//,
		/^chrome-extension:\/\//,
		/^about:/,
		/^edge:\/\//,
		/^brave:\/\//,
		/^opera:\/\//,
		/^vivaldi:\/\//,
		/^file:\/\//,
		/^view-source:/,
		/^devtools:\/\//,
	]

	return !restrictedPatterns.some((pattern) => pattern.test(url))
}
