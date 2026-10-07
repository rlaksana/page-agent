import { createContext, useContext } from 'react'

/**
 * Sidepanel UI strings. The UI is English-only by requirement; the `t()` key
 * layer stays so strings remain enumerable and a second UI language can be
 * added later without re-touching the components. The AGENT's response
 * language is a separate setting (settings.responseLanguage) that follows the
 * task's language — not affected by this module.
 */
const en = {
	// Common
	'common.back': 'Back',
	'common.task': 'Task',
	'common.steps': 'steps',
	'common.copy': 'Copy',
	'common.copyTask': 'Copy task',
	'common.runAgain': 'Run again',
	'common.editTask': 'Edit task',
	'common.delete': 'Delete',
	'common.export': 'Export',
	'common.newChat': 'New chat',
	'common.history': 'History',
	'common.settings': 'Settings',

	// Status announcements (aria-live) and pills
	'status.ready': 'Ready',
	'status.running': 'Running',
	'status.done': 'Done',
	'status.error': 'Error',
	'status.stopped': 'Stopped',
	'status.agentRunning': 'Agent is running.',
	'status.taskCompleted': 'Task completed.',
	'status.taskFailed': 'Task failed.',
	'status.taskStopped': 'Task stopped.',
	'status.needsInput': 'The agent needs your answer.',

	// Chat view
	'chat.stepOf': 'Step {{step}} / {{max}}',
	'chat.tok': 'tok',
	'chat.queued': 'Queued',
	'chat.cancelQueued': 'Cancel queued task',
	'chat.queuePlaceholder': 'Queue a task to run after this one…',
	'chat.failedPlaceholder': 'Describe what to change, or start a new task…',
	'chat.finishedPlaceholder': 'Ask a follow-up or start a new task…',
	'chat.placeholder': 'Describe your task…',
	'chat.continue': 'Continue',
	'chat.saveMd': 'Save .md',
	'chat.tokens': '{{count}} tokens',
	'chat.stopTask': 'Stop task',
	'chat.send': 'Send',
	'chat.enterHint': 'Enter to send · Shift+Enter for newline',

	// Ask user
	'ask.title': 'The agent asks',
	'ask.placeholder': 'Type your answer…',
	'ask.yourAnswer': 'Your answer',
	'ask.sendAnswer': 'Send answer',

	// Cards
	'card.success': 'Success',
	'card.failed': 'Failed',
	'card.reflection': 'Reflection',
	'card.eval': 'Eval',
	'card.memory': 'Memory',
	'card.next': 'Next',
	'card.raw': 'Raw',
	'card.request': 'Request',
	'card.response': 'Response',
	'card.input': 'Input',
	'card.output': 'Output',
	'card.running': 'Running',
	'card.step': 'Step {{step}}',
	'card.attemptOf': 'Attempt {{attempt}} of {{max}}',
	'card.hideRaw': 'Hide raw response',
	'card.showRaw': 'Show raw response',
	'card.rawResponse': 'Raw response',
	'card.copyCode': 'Copy code',
	'card.copyResult': 'Copy result',
	'card.userTakeover': 'User took over control and made changes to the page',
	'card.thinking': 'Thinking…',
	'card.executing': 'Executing',
	'card.executed': 'Done:',
	'card.retrying': 'Retrying ({{attempt}}/{{max}})…',

	// Empty state / onboarding
	'empty.title': 'Page Agent',
	'empty.tagline': 'Enter a task to automate this page',
	'empty.suggest1': 'Summarize this page',
	'empty.suggest2': 'Extract the table as Markdown',
	'empty.suggest3': 'Fill in this form for me',
	'onboarding.title': 'Get started',
	'onboarding.desc':
		'Page Agent needs an LLM to think. Connect your own OpenAI-compatible API, or try the shared demo endpoint first.',
	'onboarding.demo': 'Try the demo',
	'onboarding.ownKey': 'Use my own key',

	// History
	'history.title': 'History',
	'history.clearAll': 'Clear all',
	'history.search': 'Search tasks',
	'history.filterAll': 'All',
	'history.filterDone': 'Done',
	'history.filterFailed': 'Failed',
	'history.loading': 'Loading history',
	'history.noMatch': 'No matching tasks',
	'history.none': 'No history yet',
	'history.today': 'Today',
	'history.yesterday': 'Yesterday',
	'history.justNow': 'just now',
	'history.minutesAgo': '{{n}}m ago',
	'history.hoursAgo': '{{n}}h ago',
	'history.daysAgo': '{{n}}d ago',
	'history.exportJson': 'Export JSON',
	'history.runAgainFor': 'Run history task again: {{task}}',
	'history.exportFor': 'Export history for {{task}}',
	'history.deleteFor': 'Delete history for {{task}}',
	'history.failed': 'failed',
	'history.stopped': 'stopped',
	'history.loadingDots': 'Loading…',
	'history.completed': 'Completed',

	// Settings
	'settings.title': 'Settings',
	'settings.provider': 'Model provider',
	'settings.testingNotice1': 'You are using our testing API. By continuing you agree to the ',
	'settings.testingNotice2': ' and ',
	'settings.testingNotice3': '.',
	'settings.terms': 'Terms of Use',
	'settings.privacyPolicy': 'Privacy Policy',
	'settings.baseUrl': 'Base URL',
	'settings.model': 'Model',
	'settings.apiKey': 'API key',
	'settings.showApiKey': 'Show API key',
	'settings.hideApiKey': 'Hide API key',
	'settings.behavior': 'Behavior',
	'settings.langSystem': 'System',
	'settings.responseLanguage': 'Response language',
	'settings.maxSteps': 'Max steps',
	'settings.maxStepsHint': 'Minimum 1. Leave empty for the default (40).',
	'settings.access': 'Access',
	'settings.userAuthToken': 'User auth token',
	'settings.showToken': 'Show token',
	'settings.hideToken': 'Hide token',
	'settings.copyToken': 'Copy token',
	'settings.tokenHint': 'Gives a website the ability to call this extension.',
	'settings.hub': 'Manage Page Agent Hub',
	'settings.advanced': 'Advanced',
	'settings.systemInstruction': 'System instruction',
	'settings.systemInstructionPlaceholder': 'Additional instructions for the agent…',
	'settings.disableNamedToolChoice': 'Disable named tool_choice',
	'settings.experimentalLlmsTxt': 'Experimental llms.txt support',
	'settings.experimentalAllTabs': 'Experimental include all tabs',
	'settings.blockedSites': 'Blocked sites',
	'settings.blockedSitesPlaceholder': 'bank.com\nshop.internal.dev — one host per line',
	'settings.blockedSitesHint':
		'The agent will never read or operate on these hosts (subdomains included).',
	'settings.viewportExpansion': 'DOM viewport expansion',
	'settings.viewportExpansionHint':
		'-1 = full page (default) · 0 = viewport only · N = viewport + N px',
	'settings.testConnection': 'Test connection',
	'settings.testOk': 'Connected',
	'settings.testFail': 'Connection failed',
	'settings.providers': 'Saved providers',
	'settings.providerNamePlaceholder': 'Name to save this provider as…',
	'settings.saveProvider': 'Save current',
	'settings.deleteProvider': 'Delete provider',
	'settings.applyProvider': 'Switch to this provider',
	'settings.noProviders': 'Save a provider to switch between them without retyping keys.',
	'settings.cancel': 'Cancel',
	'settings.save': 'Save',
	'settings.loading': 'Loading...',
	'settings.sourceCode': 'Source code',
	'settings.homePage': 'Home page',
	'settings.privacy': 'Privacy',
} as const

export type TKey = keyof typeof en

export type Translate = (key: TKey, params?: Record<string, string | number>) => string

/**
 * English-only translator. Keyed lookup stays so a second UI language can be
 * added later without re-touching the components.
 */
export function translator(): Translate {
	return (key, params) => {
		let text: string = en[key]
		if (params) {
			text = text.replace(/\{\{(\w+)\}\}/g, (match, name) =>
				params[name] != null ? String(params[name]) : match
			)
		}
		return text
	}
}

// English default: components render correctly even without a provider
// (e.g. when shared components are mounted outside the sidepanel).
const TContext = createContext<Translate>(translator())
export const TProvider = TContext.Provider
export const useT = () => useContext(TContext)
