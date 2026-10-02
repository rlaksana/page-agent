import {
	ArrowLeft,
	ChevronDown,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Layers,
	Loader2,
	TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { siGithub } from 'simple-icons'

import { DEMO_BASE_URL, DEMO_MODEL, isTestingEndpoint } from '@/agent/constants'
import type { ExtConfig, LanguagePreference } from '@/agent/useAgent'
import { cn } from '@/lib/utils'

interface ConfigPanelProps {
	config: ExtConfig | null
	onSave: (config: ExtConfig) => Promise<void>
	onClose: () => void
}

/** Design-system switch (`.sw` pill with sliding knob). */
function Switch({
	checked,
	onChange,
	label,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	label: string
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			className={cn('sw', checked && 'on')}
			onClick={() => onChange(!checked)}
		>
			<i />
		</button>
	)
}

const LANGUAGES: { value: LanguagePreference; label: string }[] = [
	{ value: undefined, label: 'System' },
	{ value: 'en-US', label: 'English' },
	{ value: 'zh-CN', label: '中文' },
]

export function ConfigPanel({ config, onSave, onClose }: ConfigPanelProps) {
	const [baseURL, setBaseURL] = useState(config?.baseURL || DEMO_BASE_URL)
	const [model, setModel] = useState(config?.model || DEMO_MODEL)
	const [apiKey, setApiKey] = useState(config?.apiKey)
	const [language, setLanguage] = useState<LanguagePreference>(config?.language)
	const [maxSteps, setMaxSteps] = useState(config?.maxSteps)
	const [systemInstruction, setSystemInstruction] = useState(config?.systemInstruction ?? '')
	const [experimentalLlmsTxt, setExperimentalLlmsTxt] = useState(
		config?.experimentalLlmsTxt ?? false
	)
	const [experimentalIncludeAllTabs, setExperimentalIncludeAllTabs] = useState(
		config?.experimentalIncludeAllTabs ?? false
	)
	const [disableNamedToolChoice, setDisableNamedToolChoice] = useState(
		config?.disableNamedToolChoice ?? false
	)
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [userAuthToken, setUserAuthToken] = useState('')
	const [copied, setCopied] = useState(false)
	const [showToken, setShowToken] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)

	const [prevConfig, setPrevConfig] = useState(config)
	if (prevConfig !== config) {
		setPrevConfig(config)
		setBaseURL(config?.baseURL || DEMO_BASE_URL)
		setModel(config?.model || DEMO_MODEL)
		setApiKey(config?.apiKey)
		setLanguage(config?.language)
		setMaxSteps(config?.maxSteps)
		setSystemInstruction(config?.systemInstruction ?? '')
		setExperimentalLlmsTxt(config?.experimentalLlmsTxt ?? false)
		setExperimentalIncludeAllTabs(config?.experimentalIncludeAllTabs ?? false)
		setDisableNamedToolChoice(config?.disableNamedToolChoice ?? false)
	}

	// Poll for user auth token every second until found
	useEffect(() => {
		let interval: NodeJS.Timeout | null = null

		const fetchToken = async () => {
			const result = await chrome.storage.local.get('PageAgentExtUserAuthToken')
			const token = result.PageAgentExtUserAuthToken
			if (typeof token === 'string' && token) {
				setUserAuthToken(token)
				if (interval) {
					clearInterval(interval)
					interval = null
				}
			}
		}

		fetchToken()
		interval = setInterval(fetchToken, 1000)

		return () => {
			if (interval) clearInterval(interval)
		}
	}, [])

	const handleCopyToken = async () => {
		if (userAuthToken) {
			await navigator.clipboard.writeText(userAuthToken)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			await onSave({
				apiKey,
				baseURL,
				model,
				language,
				maxSteps: maxSteps || undefined,
				systemInstruction: systemInstruction || undefined,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
				disableNamedToolChoice,
			})
		} finally {
			setSaving(false)
		}
	}

	const maskedToken = userAuthToken
		? showToken
			? userAuthToken
			: `${userAuthToken.slice(0, 4)}${'•'.repeat(Math.max(0, userAuthToken.length - 8))}${userAuthToken.slice(-4)}`
		: 'Loading...'

	return (
		<>
			<div className="sub">
				<button type="button" className="ib" onClick={onClose} aria-label="Back" title="Back">
					<ArrowLeft className="size-4" />
				</button>
				<span className="ttl">Settings</span>
				<span className="sp" />
			</div>

			<div className="set">
				{/* Model provider */}
				<div className="sec">
					<span className="lab">Model provider</span>
					{isTestingEndpoint(baseURL) && (
						<div className="note nw">
							<TriangleAlert className="size-4" />
							<div>
								You are using our testing API. By continuing you agree to the{' '}
								<a
									href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
									target="_blank"
									rel="noopener noreferrer"
								>
									Terms of Use
								</a>{' '}
								and{' '}
								<a
									href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
									target="_blank"
									rel="noopener noreferrer"
								>
									Privacy Policy
								</a>
								.
							</div>
						</div>
					)}
					<div className="grp">
						<div className="fld">
							<label className="lb" htmlFor="base-url">
								Base URL
							</label>
							<input
								id="base-url"
								className="in m"
								placeholder="https://api.openai.com/v1"
								value={baseURL}
								onChange={(e) => setBaseURL(e.target.value)}
							/>
						</div>
						<div className="fld">
							<label className="lb" htmlFor="model">
								Model
							</label>
							<input
								id="model"
								className="in m"
								placeholder="gpt-5.1"
								value={model}
								onChange={(e) => setModel(e.target.value)}
							/>
						</div>
						<div className="fld">
							<label className="lb" htmlFor="api-key">
								API key
							</label>
							<div className="inw">
								<input
									id="api-key"
									className="in m pr"
									type={showApiKey ? 'text' : 'password'}
									value={apiKey}
									onChange={(e) => setApiKey(e.target.value)}
								/>
								<button
									type="button"
									className="ib"
									onClick={() => setShowApiKey(!showApiKey)}
									aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
									aria-pressed={showApiKey}
								>
									{showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* Behavior */}
				<div className="sec">
					<span className="lab">Behavior</span>
					<div className="grp">
						<div className="fld">
							<label className="lb">Response language</label>
							<div className="seg" role="radiogroup" aria-label="Response language">
								{LANGUAGES.map(({ value, label }) => (
									<button
										key={label}
										type="button"
										role="radio"
										aria-checked={language === value}
										className={cn(language === value && 'on')}
										onClick={() => setLanguage(value)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
						<div className="fld">
							<label className="lb" htmlFor="max-steps">
								Max steps
							</label>
							<input
								id="max-steps"
								className="in m"
								inputMode="numeric"
								placeholder="40"
								min={1}
								max={200}
								value={maxSteps ?? ''}
								onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)}
							/>
							<div className="hint">Between 1 and 200.</div>
						</div>
					</div>
				</div>

				{/* Access */}
				<div className="sec">
					<span className="lab">Access</span>
					<div className="grp">
						<div className="fld">
							<label className="lb" htmlFor="user-auth-token">
								User auth token
							</label>
							<div className="inw">
								<input
									id="user-auth-token"
									className="in m pr b"
									readOnly
									value={maskedToken}
									aria-label="User auth token"
								/>
								<button
									type="button"
									className="ib b"
									onClick={() => setShowToken(!showToken)}
									disabled={!userAuthToken}
									aria-label={showToken ? 'Hide token' : 'Show token'}
									aria-pressed={showToken}
								>
									{showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
								</button>
								<button
									type="button"
									className="ib"
									onClick={handleCopyToken}
									disabled={!userAuthToken}
									aria-label="Copy token"
								>
									{copied ? <span role="status">✓</span> : <Copy className="size-4" />}
								</button>
							</div>
							<div className="hint">Gives a website the ability to call this extension.</div>
						</div>
					</div>
				</div>

				{/* Hub */}
				<button
					type="button"
					className="rowb"
					onClick={() => {
						const wsPort = Number(import.meta.env.VITE_MCP_WS_PORT) || 38401
						chrome.runtime
							.sendMessage({ type: 'OPEN_HUB', wsPort })
							.catch((err) => console.error('[ConfigPanel]: open hub failed', err))
					}}
				>
					<Layers className="size-4" />
					<span>Manage Page Agent Hub</span>
					<ExternalLink className="size-3.5" />
				</button>

				{/* Advanced */}
				<div className="sec">
					<button
						type="button"
						className="adv"
						aria-expanded={advancedOpen}
						onClick={() => setAdvancedOpen(!advancedOpen)}
					>
						Advanced
						<ChevronDown className={cn('size-3.5', !advancedOpen && '-rotate-90')} />
					</button>
					{advancedOpen && (
						<div className="grp">
							<div className="fld">
								<label className="lb" htmlFor="system-instruction">
									System instruction
								</label>
								<textarea
									id="system-instruction"
									className="tx"
									placeholder="Additional instructions for the agent…"
									value={systemInstruction}
									onChange={(e) => setSystemInstruction(e.target.value)}
									rows={3}
								/>
							</div>
							<div className="swr">
								<span>Disable named tool_choice</span>
								<Switch
									checked={disableNamedToolChoice}
									onChange={setDisableNamedToolChoice}
									label="Disable named tool_choice"
								/>
							</div>
							<div className="swr">
								<span>Experimental llms.txt support</span>
								<Switch
									checked={experimentalLlmsTxt}
									onChange={setExperimentalLlmsTxt}
									label="Experimental llms.txt support"
								/>
							</div>
							<div className="swr">
								<span>Experimental include all tabs</span>
								<Switch
									checked={experimentalIncludeAllTabs}
									onChange={setExperimentalIncludeAllTabs}
									label="Experimental include all tabs"
								/>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Save bar */}
			<div className="sb">
				<button type="button" className="btn lg" onClick={onClose}>
					Cancel
				</button>
				<button type="button" className="btn lg p" onClick={handleSave} disabled={saving}>
					{saving ? <Loader2 className="size-3.5 spin" /> : 'Save'}
				</button>
			</div>

			{/* Footer */}
			<div className="ft">
				<div>
					<span className="mono">v{__VERSION__}</span>
					<a href="https://github.com/alibaba/page-agent" target="_blank" rel="noopener noreferrer">
						<svg
							role="img"
							viewBox="0 0 24 24"
							className="size-3 fill-current"
							style={{ display: 'inline', verticalAlign: '-1px' }}
						>
							<path d={siGithub.path} />
						</svg>{' '}
						Source code
					</a>
					<a href="https://github.com/gaomeng1900" target="_blank" rel="noopener noreferrer">
						Built with ♥ by @Simon
					</a>
				</div>
				<div className="col2">
					<a href="https://alibaba.github.io/page-agent/" target="_blank" rel="noopener noreferrer">
						Home page
					</a>
					<a
						href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
						target="_blank"
						rel="noopener noreferrer"
					>
						Privacy
					</a>
				</div>
			</div>
		</>
	)
}
