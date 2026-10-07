import {
	ArrowLeft,
	ChevronDown,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Layers,
	Loader2,
	Plug,
	TriangleAlert,
	X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { siGithub } from 'simple-icons'

import { DEMO_BASE_URL, DEMO_MODEL, isTestingEndpoint } from '@/agent/constants'
import type { ExtConfig, LanguagePreference } from '@/agent/useAgent'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ConfigPanelProps {
	config: ExtConfig | null
	onSave: (config: ExtConfig) => Promise<void>
	onClose: () => void
}

/** A saved provider profile: enough to restore baseURL/model/apiKey in one click. */
interface ProviderProfile {
	name: string
	config: Pick<ExtConfig, 'baseURL' | 'model' | 'apiKey'>
}

const PROVIDERS_KEY = 'savedProviders'

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

const LANGUAGES: { value: LanguagePreference; label: string; key?: 'settings.langSystem' }[] = [
	{ value: undefined, label: 'System', key: 'settings.langSystem' },
	{ value: 'en-US', label: 'English' },
	{ value: 'zh-CN', label: '中文' },
]

export function ConfigPanel({ config, onSave, onClose }: ConfigPanelProps) {
	const t = useT()
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
	const [blockedSites, setBlockedSites] = useState((config?.blockedSites ?? []).join('\n'))
	const [viewportExpansion, setViewportExpansion] = useState<number | undefined>(
		config?.viewportExpansion
	)
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [testing, setTesting] = useState(false)
	const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
	const [providers, setProviders] = useState<ProviderProfile[]>([])
	const [providerName, setProviderName] = useState('')
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
		setBlockedSites((config?.blockedSites ?? []).join('\n'))
		setViewportExpansion(config?.viewportExpansion)
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

	/** Probe the endpoint with GET /models (same request context the agent uses). */
	const handleTestConnection = async () => {
		setTesting(true)
		setTestResult(null)
		const started = performance.now()
		try {
			const response = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, {
				headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
			})
			const ms = Math.round(performance.now() - started)
			setTestResult(
				response.ok
					? { ok: true, text: `✓ ${t('settings.testOk')} (${ms}ms)` }
					: { ok: false, text: `✗ ${t('settings.testFail')} — HTTP ${response.status}` }
			)
		} catch (error) {
			setTestResult({
				ok: false,
				text: `✗ ${t('settings.testFail')} — ${(error as Error).message}`,
			})
		} finally {
			setTesting(false)
		}
	}

	const handleSave = async (
		override?: Partial<Pick<ExtConfig, 'baseURL' | 'model' | 'apiKey'>>
	) => {
		setSaving(true)
		try {
			await onSave({
				apiKey: override?.apiKey ?? apiKey,
				baseURL: override?.baseURL ?? baseURL,
				model: override?.model ?? model,
				language,
				maxSteps: maxSteps || undefined,
				systemInstruction: systemInstruction || undefined,
				experimentalLlmsTxt,
				experimentalIncludeAllTabs,
				disableNamedToolChoice,
				blockedSites: blockedSites.trim() ? blockedSites.split(/[\n,;\s]+/) : undefined,
				viewportExpansion: typeof viewportExpansion === 'number' ? viewportExpansion : undefined,
			})
		} finally {
			setSaving(false)
		}
	}

	// --- Saved provider profiles (switch without retyping baseURL/model/apiKey) ---

	useEffect(() => {
		chrome.storage.local.get(PROVIDERS_KEY).then((result) => {
			setProviders((result[PROVIDERS_KEY] as ProviderProfile[] | undefined) ?? [])
		})
	}, [])

	const persistProviders = (next: ProviderProfile[]) => {
		setProviders(next)
		void chrome.storage.local.set({ [PROVIDERS_KEY]: next })
	}

	const saveCurrentProvider = () => {
		// Default the profile name to the model, so "gpt-5.1" is a one-keystroke save.
		const name = providerName.trim() || model
		if (!name) return
		persistProviders([
			...providers.filter((p) => p.name !== name),
			{ name, config: { baseURL, model, apiKey } },
		])
		setProviderName('')
	}

	const deleteProvider = (name: string) => {
		persistProviders(providers.filter((p) => p.name !== name))
	}

	const applyProvider = async (profile: ProviderProfile) => {
		// Fill the form from the profile, then persist through the normal save
		// path (passing the values explicitly — state setters above are async)
		// so the agent is rebuilt with the new provider.
		setBaseURL(profile.config.baseURL)
		setModel(profile.config.model)
		setApiKey(profile.config.apiKey)
		await handleSave(profile.config)
	}

	const isProviderActive = (p: ProviderProfile) =>
		p.config.baseURL === baseURL && p.config.model === model && p.config.apiKey === apiKey

	const maskedToken = userAuthToken
		? showToken
			? userAuthToken
			: `${userAuthToken.slice(0, 4)}${'•'.repeat(Math.max(0, userAuthToken.length - 8))}${userAuthToken.slice(-4)}`
		: t('settings.loading')

	return (
		<>
			<div className="sub">
				<button
					type="button"
					className="ib"
					onClick={onClose}
					aria-label={t('common.back')}
					title={t('common.back')}
				>
					<ArrowLeft className="size-4" />
				</button>
				<span className="ttl">{t('settings.title')}</span>
				<span className="sp" />
			</div>

			<div className="set">
				{/* Model provider */}
				<div className="sec">
					<span className="lab">{t('settings.provider')}</span>
					{isTestingEndpoint(baseURL) && (
						<div className="note nw">
							<TriangleAlert className="size-4" />
							<div>
								{t('settings.testingNotice1')}
								<a
									href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('settings.terms')}
								</a>
								{t('settings.testingNotice2')}
								<a
									href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('settings.privacyPolicy')}
								</a>
								{t('settings.testingNotice3')}
							</div>
						</div>
					)}
					<div className="grp">
						<div className="fld">
							<label className="lb" htmlFor="base-url">
								{t('settings.baseUrl')}
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
								{t('settings.model')}
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
								{t('settings.apiKey')}
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
									aria-label={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
									aria-pressed={showApiKey}
								>
									{showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
								</button>
							</div>
						</div>
					</div>
					<div className="fld" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<button
							type="button"
							className="btn g"
							onClick={handleTestConnection}
							disabled={testing || !baseURL}
						>
							{testing ? <Loader2 className="size-3.5 spin" /> : <Plug className="size-3.5" />}
							{t('settings.testConnection')}
						</button>
						{testResult && (
							<span
								className="hint"
								style={{ color: testResult.ok ? 'var(--ok)' : 'var(--err)', marginTop: 0 }}
							>
								{testResult.text}
							</span>
						)}
					</div>
				</div>

				{/* Saved providers: one-click switching */}
				<div className="sec">
					<span className="lab">{t('settings.providers')}</span>
					{providers.length === 0 ? (
						<div className="hint">{t('settings.noProviders')}</div>
					) : (
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
							{providers.map((p) => {
								const active = isProviderActive(p)
								return (
									<span
										key={p.name}
										className="chip"
										style={{ gap: 2, color: active ? 'var(--accent-text)' : undefined }}
									>
										<button
											type="button"
											style={{ all: 'unset', cursor: 'pointer', font: 'inherit' }}
											onClick={() => void applyProvider(p)}
											aria-label={`${t('settings.applyProvider')}: ${p.name}`}
											title={`${t('settings.applyProvider')}: ${p.name}`}
										>
											{active ? '✓ ' : ''}
											{p.name}
										</button>
										<button
											type="button"
											className="ib sm"
											style={{ width: 16, height: 16 }}
											onClick={() => deleteProvider(p.name)}
											aria-label={`${t('settings.deleteProvider')}: ${p.name}`}
											title={t('settings.deleteProvider')}
										>
											<X className="size-3" />
										</button>
									</span>
								)
							})}
						</div>
					)}
					<div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
						<input
							className="in m"
							style={{ flex: 1, minWidth: 0 }}
							placeholder={t('settings.providerNamePlaceholder')}
							value={providerName}
							onChange={(e) => setProviderName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault()
									saveCurrentProvider()
								}
							}}
						/>
						<button type="button" className="btn g" onClick={saveCurrentProvider}>
							{t('settings.saveProvider')}
						</button>
					</div>
				</div>

				{/* Behavior */}
				<div className="sec">
					<span className="lab">{t('settings.behavior')}</span>
					<div className="grp">
						<div className="fld">
							<label className="lb">{t('settings.responseLanguage')}</label>
							<div className="seg" role="radiogroup" aria-label={t('settings.responseLanguage')}>
								{LANGUAGES.map(({ value, label, key }) => (
									<button
										key={label}
										type="button"
										role="radio"
										aria-checked={language === value}
										className={cn(language === value && 'on')}
										onClick={() => setLanguage(value)}
									>
										{key ? t(key) : label}
									</button>
								))}
							</div>
						</div>
						<div className="fld">
							<label className="lb" htmlFor="max-steps">
								{t('settings.maxSteps')}
							</label>
							<input
								id="max-steps"
								className="in m"
								inputMode="numeric"
								placeholder="40"
								min={1}
								value={maxSteps ?? ''}
								onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)}
							/>
							<div className="hint">{t('settings.maxStepsHint')}</div>
						</div>
					</div>
				</div>

				{/* Access */}
				<div className="sec">
					<span className="lab">{t('settings.access')}</span>
					<div className="grp">
						<div className="fld">
							<label className="lb" htmlFor="user-auth-token">
								{t('settings.userAuthToken')}
							</label>
							<div className="inw">
								<input
									id="user-auth-token"
									className="in m pr b"
									readOnly
									value={maskedToken}
									aria-label={t('settings.userAuthToken')}
								/>
								<button
									type="button"
									className="ib b"
									onClick={() => setShowToken(!showToken)}
									disabled={!userAuthToken}
									aria-label={showToken ? t('settings.hideToken') : t('settings.showToken')}
									aria-pressed={showToken}
								>
									{showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
								</button>
								<button
									type="button"
									className="ib"
									onClick={handleCopyToken}
									disabled={!userAuthToken}
									aria-label={t('settings.copyToken')}
								>
									{copied ? <span role="status">✓</span> : <Copy className="size-4" />}
								</button>
							</div>
							<div className="hint">{t('settings.tokenHint')}</div>
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
					<span>{t('settings.hub')}</span>
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
						{t('settings.advanced')}
						<ChevronDown className={cn('size-3.5', !advancedOpen && '-rotate-90')} />
					</button>
					{advancedOpen && (
						<div className="grp">
							<div className="fld">
								<label className="lb" htmlFor="system-instruction">
									{t('settings.systemInstruction')}
								</label>
								<textarea
									id="system-instruction"
									className="tx"
									placeholder={t('settings.systemInstructionPlaceholder')}
									value={systemInstruction}
									onChange={(e) => setSystemInstruction(e.target.value)}
									rows={3}
								/>
							</div>
							<div className="swr">
								<span>{t('settings.disableNamedToolChoice')}</span>
								<Switch
									checked={disableNamedToolChoice}
									onChange={setDisableNamedToolChoice}
									label={t('settings.disableNamedToolChoice')}
								/>
							</div>
							<div className="swr">
								<span>{t('settings.experimentalLlmsTxt')}</span>
								<Switch
									checked={experimentalLlmsTxt}
									onChange={setExperimentalLlmsTxt}
									label={t('settings.experimentalLlmsTxt')}
								/>
							</div>
							<div className="swr">
								<span>{t('settings.experimentalAllTabs')}</span>
								<Switch
									checked={experimentalIncludeAllTabs}
									onChange={setExperimentalIncludeAllTabs}
									label={t('settings.experimentalAllTabs')}
								/>
							</div>
							<div className="fld">
								<label className="lb" htmlFor="viewport-expansion">
									{t('settings.viewportExpansion')}
								</label>
								<input
									id="viewport-expansion"
									className="in m"
									inputMode="numeric"
									placeholder="-1"
									value={viewportExpansion ?? ''}
									onChange={(e) =>
										setViewportExpansion(
											e.target.value !== '' && !Number.isNaN(Number(e.target.value))
												? Number(e.target.value)
												: undefined
										)
									}
								/>
								<div className="hint">{t('settings.viewportExpansionHint')}</div>
							</div>
							<div className="fld">
								<label className="lb" htmlFor="blocked-sites">
									{t('settings.blockedSites')}
								</label>
								<textarea
									id="blocked-sites"
									className="tx"
									placeholder={t('settings.blockedSitesPlaceholder')}
									value={blockedSites}
									onChange={(e) => setBlockedSites(e.target.value)}
									rows={3}
								/>
								<div className="hint">{t('settings.blockedSitesHint')}</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Save bar */}
			<div className="sb">
				<button type="button" className="btn lg" onClick={onClose}>
					{t('settings.cancel')}
				</button>
				<button
					type="button"
					className="btn lg p"
					onClick={() => void handleSave()}
					disabled={saving}
				>
					{saving ? <Loader2 className="size-3.5 spin" /> : t('settings.save')}
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
						{t('settings.sourceCode')}
					</a>
					<a href="https://github.com/gaomeng1900" target="_blank" rel="noopener noreferrer">
						Built with ♥ by @Simon
					</a>
				</div>
				<div className="col2">
					<a href="https://alibaba.github.io/page-agent/" target="_blank" rel="noopener noreferrer">
						{t('settings.homePage')}
					</a>
					<a
						href="https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('settings.privacy')}
					</a>
				</div>
			</div>
		</>
	)
}
