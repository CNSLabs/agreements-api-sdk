import { useEffect, useMemo, useRef, useState } from 'react';
import {
  API_BASE_PATH,
  ApiClient,
  computeDefaultDeadlineSeconds,
  DEFAULT_API_ENVIRONMENT,
  deployAgreementWithPermit,
  extractAgreementsApiErrorMessage,
  getExecutionInputIds,
  joinUrl,
  resolveApiBaseUrl,
  submitAgreementInputWithPermit,
  type AgreementRecord,
  type AgreementsApiEnvironment,
  type DirectParticipantRecord,
} from '@cns-labs/agreements-api-client';
import type { AgreementJson, InitValue } from '@cns-labs/agreements-protocol-evm';
import { createPublicClient, createWalletClient, custom, http, type Address } from 'viem';
import { linea, lineaSepolia } from 'viem/chains';
import { createBrowserTelemetryHeaders } from './telemetry';

type HttpMethod = 'GET' | 'POST';
type AppView = 'overview' | 'deploy' | 'inspect' | 'input' | 'composer';

type ResponseState = {
  startedAt: string;
  durationMs: number;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  bodyText: string;
  parsedBody: unknown;
};

type InputDefinition = {
  displayName?: string;
  issuer?: string;
};

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

type DeployChainConfig = {
  chainId: number;
  chain: typeof linea | typeof lineaSepolia;
  chainName: string;
};

const DEFAULT_ENVIRONMENT = resolveDefaultEnvironment();
const API_BASE_URL_OVERRIDES = readApiBaseUrlOverrides();
const DEFAULT_OWNER = '0x1111111111111111111111111111111111111111';
const DEFAULT_COUNTERPARTY = '0x2222222222222222222222222222222222222222';
const PRODUCTION_APP_HOST = 'app.shodai.network';
const PRODUCTION_DEVELOPER_PORTAL_URL = 'https://developers.shodai.network/portal/';
const DEVELOPER_PORTAL_PATH = '/developer-portal/portal';
const DEVELOPER_DOCS_URL = 'https://docs.shodai.network';
const DOCS_API_REFERENCE_URL =
  `${DEVELOPER_DOCS_URL}/api-reference/system/get-the-openapi-document-for-the-agreements-api`;
const DEMO_APP_PATH = '/agreements/home';
const GITHUB_URL = 'https://github.com/CNSLabs/';

const SAMPLE_AGREEMENT = {
  metadata: {
    id: 'did:example:agreements-playground-v1',
    templateId: 'did:template:agreements-playground-v1',
    version: '1.0.0',
    createdAt: '2026-04-13T00:00:00Z',
    name: 'Agreements Playground Agreement',
    author: 'CNS Labs',
    description: 'Sample inline agreement JSON for Agreements API validation and deployment testing.',
  },
  variables: {
    partyAAddress: {
      type: 'address',
      name: 'Party A Address',
      validation: { required: true },
    },
    partyBAddress: {
      type: 'address',
      name: 'Party B Address',
      validation: { required: true },
    },
  },
  content: {
    type: 'md',
    data: '# Agreements Playground Agreement\n\nThis is a sample inline agreement payload.',
  },
  execution: {
    states: {
      PENDING_APPROVAL: {
        name: 'Pending Approval',
        description: 'Awaiting approval input.',
        isInitial: true,
      },
      APPROVED: {
        name: 'Approved',
        description: 'Agreement approved.',
      },
    },
    initialize: {
      name: 'Initialize',
      description: 'Set the initial agreement participants.',
      initialState: 'PENDING_APPROVAL',
      data: {
        partyAAddress: '${variables.partyAAddress}',
        partyBAddress: '${variables.partyBAddress}',
      },
    },
    inputs: {
      approve: {
        type: 'VerifiedCredentialEIP712',
        schema: 'verified-credential-eip712.schema.json',
        displayName: 'Approve',
        description: 'Approves the agreement.',
        data: {
          approved: {
            type: 'bool',
            validation: { required: true },
          },
        },
        issuer: '${variables.partyAAddress}',
      },
    },
    transitions: [
      {
        from: 'PENDING_APPROVAL',
        to: 'APPROVED',
        conditions: [{ type: 'isValid', input: 'approve' }],
      },
    ],
  },
} satisfies Record<string, unknown>;

function App() {
  const composerPathInputRef = useRef<HTMLInputElement | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [environment, setEnvironment] = useState<AgreementsApiEnvironment>(DEFAULT_ENVIRONMENT);
  const [apiKey, setApiKey] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState(`${API_BASE_PATH}/health`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [response, setResponse] = useState<ResponseState | null>(null);

  const [walletAddress, setWalletAddress] = useState('');
  const [connectedChainId, setConnectedChainId] = useState<number | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState('');

  const [agreementId, setAgreementId] = useState('');
  const [displayName, setDisplayName] = useState('Agreements Playground Agreement');
  const [docUri, setDocUri] = useState('');
  const [agreementJsonText, setAgreementJsonText] = useState(JSON.stringify(SAMPLE_AGREEMENT, null, 2));
  const [initValuesText, setInitValuesText] = useState(
    JSON.stringify({ partyAAddress: DEFAULT_OWNER, partyBAddress: DEFAULT_COUNTERPARTY }, null, 2),
  );
  const [participantsText, setParticipantsText] = useState(
    JSON.stringify(
      [
        { variableKey: 'partyAAddress', walletAddress: DEFAULT_OWNER, walletBinding: 'partner_asserted' },
        { variableKey: 'partyBAddress', walletAddress: DEFAULT_COUNTERPARTY, walletBinding: 'partner_asserted' },
      ],
      null,
      2,
    ),
  );
  const [observersText, setObserversText] = useState(JSON.stringify(['observer@example.com'], null, 2));
  const [selectedInputId, setSelectedInputId] = useState('approve');
  const [inputValuesText, setInputValuesText] = useState('{\n  "approved": true\n}');
  const [loadedAgreement, setLoadedAgreement] = useState<AgreementRecord | null>(null);
  const resolvedBaseUrl = useMemo(() => resolvePlaygroundApiBaseUrl(environment), [environment]);

  const agreementsClient = useMemo(
    () =>
      new ApiClient({
        environment,
        baseUrl: resolvedBaseUrl,
        apiKey: apiKey.trim() || undefined,
        headers: () => createBrowserTelemetryHeaders(),
      }),
    [apiKey, environment, resolvedBaseUrl],
  );

  const deployChain = useMemo(() => resolveDeployChainConfig(environment), [environment]);
  const environmentLabel = formatEnvironmentLabel(environment);
  const developerPortalUrl = useMemo(() => resolveDeveloperPortalUrl(), []);
  const developerPortalLinkProps = getExternalLinkProps(developerPortalUrl);
  const docsUrl = DEVELOPER_DOCS_URL;
  const apiReferenceUrl = useMemo(() => resolveApiReferenceUrl(resolvedBaseUrl), [resolvedBaseUrl]);
  const availableInputIds = useMemo(() => {
    const raw = loadedAgreement?.json;
    const asRecord =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
    return getExecutionInputIds(asRecord);
  }, [loadedAgreement?.json]);
  const selectedInputDefinition = useMemo(() => {
    const agreement = tryAgreementJson(loadedAgreement?.json);
    return getExecutionInputs(agreement)[selectedInputId] || null;
  }, [loadedAgreement?.json, selectedInputId]);
  const curlPreview = useMemo(() => {
    const parts = [`curl -i "${joinUrl(resolveCurlBaseUrl(resolvedBaseUrl), path)}"`];
    if (apiKey.trim()) parts.push(`-H "X-API-Key: ${apiKey.trim()}"`);
    if (method !== 'GET') parts.push(`-X ${method}`);
    if (body.trim()) {
      parts.push('-H "Content-Type: application/json"');
      parts.push(`--data '${body.replace(/'/g, "'\\''")}'`);
    }
    return parts.join(' \\\n  ');
  }, [apiKey, body, method, path, resolvedBaseUrl]);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    return () => {
      document.body.classList.remove('theme-dark');
    };
  }, [theme]);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider?.on || !provider.removeListener) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const next = Array.isArray(accounts) && typeof accounts[0] === 'string' ? normalizeAddress(accounts[0]) : '';
      setWalletAddress(next);
    };
    const handleChainChanged = (chainIdHex: unknown) => {
      setConnectedChainId(typeof chainIdHex === 'string' ? parseChainId(chainIdHex) : null);
    };
    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  useEffect(() => {
    if (!availableInputIds.length) return;
    if (!availableInputIds.includes(selectedInputId)) {
      setSelectedInputId(availableInputIds[0]);
    }
  }, [availableInputIds, selectedInputId]);

  async function runAgreementsRequest<T>(config: {
    method: HttpMethod;
    path: string;
    body?: unknown;
    captureResponse?: boolean;
  }): Promise<T> {
    const startedAt = new Date();
    const startedMs = performance.now();
    const meta = await agreementsClient.exchangeJson(config.method, config.path, config.body);

    if (config.captureResponse !== false) {
      setResponse({
        startedAt: startedAt.toISOString(),
        durationMs: Math.round(performance.now() - startedMs),
        status: meta.status,
        ok: meta.ok,
        headers: meta.headers,
        bodyText: meta.bodyText,
        parsedBody: meta.parsedBody,
      });
    }

    if (!meta.ok) {
      throw new Error(extractAgreementsApiErrorMessage(meta.parsedBody, meta.bodyText, meta.status));
    }
    return (meta.parsedBody as T) ?? ((meta.bodyText as unknown) as T);
  }

  function populateComposer(nextMethod: HttpMethod, nextPath: string, nextBody = '') {
    setMethod(nextMethod);
    setPath(nextPath);
    setBody(nextBody);
    setNotice('Composer updated.');
    setActiveView('composer');
    requestAnimationFrame(() => {
      composerPathInputRef.current?.focus();
      composerPathInputRef.current?.select();
    });
  }

  async function connectWallet() {
    setWalletBusy(true);
    setWalletError('');
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error('No injected wallet found.');
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts.length) throw new Error('Wallet did not return any accounts.');
      await ensureWalletChain(provider, deployChain);
      const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
      setWalletAddress(normalizeAddress(accounts[0]));
      setConnectedChainId(parseChainId(chainHex));
    } catch (walletFailure) {
      setWalletError(formatErrorMessage(walletFailure));
    } finally {
      setWalletBusy(false);
    }
  }

  async function executeComposer() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const trimmedPath = path.trim();
      if (method === 'POST' && trimmedPath === `${API_BASE_PATH}/agreements/deploy-with-permit`) {
        throw new Error('Use "Sign + Deploy" so the connected wallet signs the deploy-with-permit request.');
      }
      if (method === 'POST' && /\/agreements\/[^/]+\/input$/.test(trimmedPath)) {
        throw new Error('Use "Sign + Submit Input" so the connected wallet signs the input submission.');
      }
      await runAgreementsRequest({
        method,
        path,
        body: body.trim() ? JSON.parse(body) : undefined,
      });
      setNotice('Request completed.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function loadAgreement() {
    if (!agreementId.trim()) {
      setError('Enter an agreement id first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const record = await runAgreementsRequest<AgreementRecord>({
        method: 'GET',
        path: `${API_BASE_PATH}/agreements/${agreementId.trim()}`,
      });
      setLoadedAgreement(record);
      setDisplayName(record.displayName || displayName);
      setDocUri(record.docUri || '');
      if (record.json) setAgreementJsonText(JSON.stringify(record.json, null, 2));
      if (record.variables) setInitValuesText(JSON.stringify(record.variables, null, 2));
      if (record.participants) setParticipantsText(JSON.stringify(record.participants, null, 2));
      if (record.observers) setObserversText(JSON.stringify(record.observers, null, 2));
      setNotice('Agreement loaded.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function validateTemplate() {
    setBusy(true);
    setError('');
    try {
      await runAgreementsRequest({
        method: 'POST',
        path: `${API_BASE_PATH}/agreements/validate-template`,
        body: parseJsonObject(agreementJsonText, 'Agreement JSON'),
      });
      setNotice('Template validation completed.');
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : String(validateError));
    } finally {
      setBusy(false);
    }
  }

  async function validatePayload() {
    setBusy(true);
    setError('');
    try {
      await runAgreementsRequest({
        method: 'POST',
        path: `${API_BASE_PATH}/agreements/validate`,
        body: buildValidatePayload(),
      });
      setNotice('Deployment payload validated.');
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : String(validateError));
    } finally {
      setBusy(false);
    }
  }

  async function deployWithPermit() {
    setBusy(true);
    setError('');
    setNotice('Requesting wallet signature for deployment...');
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error('No injected wallet found.');
      if (!walletAddress) throw new Error('Connect the signer wallet first.');
      const agreement = parseJsonObject(agreementJsonText, 'Agreement JSON') as unknown as AgreementJson;
      const initValues = parseJsonObject(initValuesText, 'Init values') as Record<string, InitValue>;

      await ensureWalletChain(provider, deployChain);

      const publicClient = createPublicClient({
        chain: deployChain.chain,
        transport: http(),
      });
      const walletClient = createWalletClient({
        account: walletAddress as Address,
        chain: deployChain.chain,
        transport: custom(provider),
      });

      setNotice('Submitting signed deploy request...');
      const deployStartedAt = new Date();
      const deployStartedMs = performance.now();
      const deployed = await deployAgreementWithPermit({
        client: agreementsClient,
        walletClient: walletClient as never,
        publicClient: publicClient as never,
        agreement,
        displayName: displayName.trim() || 'Agreements Playground Agreement',
        initValues,
        participants: parseJsonArray(participantsText, 'Participants') as DirectParticipantRecord[],
        observers: parseJsonArray(observersText, 'Observers') as string[],
        docUri: docUri.trim() || undefined,
        deadline: computeDefaultDeadlineSeconds(),
      });
      setResponse({
        startedAt: deployStartedAt.toISOString(),
        durationMs: Math.round(performance.now() - deployStartedMs),
        status: 201,
        ok: true,
        headers: {},
        bodyText: JSON.stringify(deployed, null, 2),
        parsedBody: deployed,
      });
      setLoadedAgreement(deployed);
      setAgreementId(deployed.id || agreementId);
      setNotice(`Agreement deployed${deployed.address ? ` at ${deployed.address}` : ''}.`);
    } catch (deployError) {
      setError(deployError instanceof Error ? deployError.message : String(deployError));
    } finally {
      setBusy(false);
    }
  }

  async function loadState() {
    if (!agreementId.trim()) {
      setError('Enter an agreement id first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await runAgreementsRequest({
        method: 'GET',
        path: `${API_BASE_PATH}/agreements/${agreementId.trim()}/state`,
      });
      setNotice('Agreement state loaded.');
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : String(stateError));
    } finally {
      setBusy(false);
    }
  }

  async function loadInputs() {
    if (!agreementId.trim()) {
      setError('Enter an agreement id first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await runAgreementsRequest({
        method: 'GET',
        path: `${API_BASE_PATH}/agreements/${agreementId.trim()}/inputs`,
      });
      setNotice('Input history loaded.');
    } catch (inputsError) {
      setError(inputsError instanceof Error ? inputsError.message : String(inputsError));
    } finally {
      setBusy(false);
    }
  }

  async function submitInput() {
    setBusy(true);
    setError('');
    setNotice('Requesting wallet signature for input submission...');
    try {
      if (!agreementId.trim()) throw new Error('Enter an agreement id first.');
      if (!selectedInputId) throw new Error('Choose an input first.');
      const provider = getInjectedProvider();
      if (!provider) throw new Error('No injected wallet found.');
      if (!walletAddress) throw new Error('Connect the signer wallet first.');

      const agreement = tryAgreementJson(loadedAgreement?.json);
      if (!agreement || !loadedAgreement?.address) throw new Error('Load a deployed agreement first.');

      await ensureWalletChain(provider, deployChain);
      const publicClient = createPublicClient({
        chain: deployChain.chain,
        transport: http(),
      });
      const walletClient = createWalletClient({
        account: walletAddress as Address,
        chain: deployChain.chain,
        transport: custom(provider),
      });
      const values = parseJsonObject(inputValuesText, 'Input values');

      setNotice('Submitting signed input...');
      const inputStartedAt = new Date();
      const inputStartedMs = performance.now();
      const inputRecord = await submitAgreementInputWithPermit({
        client: agreementsClient,
        agreementId: agreementId.trim(),
        walletClient: walletClient as never,
        publicClient: publicClient as never,
        agreementContractAddress: loadedAgreement.address as Address,
        agreement,
        inputId: selectedInputId,
        values,
        deadline: computeDefaultDeadlineSeconds(),
      });
      setResponse({
        startedAt: inputStartedAt.toISOString(),
        durationMs: Math.round(performance.now() - inputStartedMs),
        status: 201,
        ok: true,
        headers: {},
        bodyText: JSON.stringify(inputRecord, null, 2),
        parsedBody: inputRecord,
      });
      setNotice(`Submitted input "${selectedInputId}".`);
    } catch (inputError) {
      setError(inputError instanceof Error ? inputError.message : String(inputError));
    } finally {
      setBusy(false);
    }
  }

  function buildValidatePayload() {
    return {
      agreement: parseJsonObject(agreementJsonText, 'Agreement JSON'),
      initValues: parseJsonObject(initValuesText, 'Init values'),
      participants: parseJsonArray(participantsText, 'Participants'),
      observers: parseJsonArray(observersText, 'Observers'),
    };
  }

  const walletStatus = walletAddress
    ? `${shortenAddress(walletAddress)}${connectedChainId ? ` · chain ${connectedChainId}` : ''}`
    : 'Not connected';

  const quickActions = buildQuickActions({
    agreementId,
    agreementJsonText,
    displayName,
    initValuesText,
    participantsText,
    observersText,
    docUri,
  });
  const viewItems: Array<{ id: AppView; label: string; description: string }> = [
    { id: 'overview', label: 'Overview', description: 'Choose a workflow' },
    { id: 'deploy', label: 'Deploy', description: 'Validate + deploy' },
    { id: 'inspect', label: 'Inspect', description: 'Records, state, inputs' },
    { id: 'input', label: 'Input', description: 'Sign + submit inputs' },
    { id: 'composer', label: 'Composer', description: 'Raw API requests' },
  ];

  function renderResponsePanel(title = 'Latest Response') {
    return (
      <section className="pl-panel pl-response-panel">
        <div className="pl-panel-head">
          <h2>{title}</h2>
          {response ? <span className="pl-mono">{response.startedAt}</span> : null}
        </div>
        <div className="pl-panel-body">
          {response ? (
            <>
              <div className="pl-metrics">
                <div className={`pl-metric ${response.ok ? 'm-ok' : 'm-err'}`}><span>Status</span><strong>{response.status}</strong></div>
                <div className="pl-metric"><span>Duration</span><strong>{response.durationMs} ms</strong></div>
                <div className="pl-metric"><span>Result</span><strong>{response.ok ? 'OK' : 'Failed'}</strong></div>
              </div>
              <CodeBlock title="Body" copyText={response.bodyText}>{formatOutput(response.parsedBody ?? response.bodyText)}</CodeBlock>
            </>
          ) : (
            <>
              <div className="pl-metrics">
                <div className="pl-metric"><span>Status</span><strong>—</strong></div>
                <div className="pl-metric"><span>Duration</span><strong>—</strong></div>
                <div className="pl-metric"><span>Result</span><strong>Pending</strong></div>
              </div>
              <CodeBlock title="Body">Responses from Agreements API requests will appear here.</CodeBlock>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <header className="pl-header">
        <a className="pl-brand" href={developerPortalUrl} {...developerPortalLinkProps}>
          <span className="pl-brand-mark" aria-hidden="true" />
          <span>SHODAI</span>
        </a>
        <nav className="pl-nav" aria-label="Primary navigation">
          <a href={developerPortalUrl} {...developerPortalLinkProps}>Home</a>
          <a href={docsUrl} target="_blank" rel="noreferrer">Docs</a>
          <a href={apiReferenceUrl} target="_blank" rel="noreferrer">API Reference</a>
          <a className="is-active" href="#main">API Playground</a>
          <a href={DEMO_APP_PATH}>Demo App</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="pl-header-right">
          <button
            type="button"
            className="pl-icon-btn"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main id="main" className="pl-main">
        <section className="pl-hero">
          <div className="pl-hero-copy">
            <h1 className="pl-h1">Agreements API</h1>
            <p className="pl-lead">
              Validate, deploy, inspect, and submit signed inputs against the Agreements API from one workspace. All requests run against {environment === 'production' ? 'mainnet' : 'testnet'}.
            </p>
            <div className="pl-hero-actions">
              <a className="pl-btn" href={apiReferenceUrl} target="_blank" rel="noreferrer">Open API Reference ↗</a>
            </div>
          </div>
          <aside className="pl-hero-aside">
            <div className="pl-status-grid">
              <div className="pl-status-row"><span>Target</span><strong>{formatBaseUrlLabel(resolvedBaseUrl)}</strong></div>
              <div className="pl-status-row"><span>Auth</span><strong>{apiKey.trim() ? 'API key loaded' : 'No API key'}</strong></div>
              <div className="pl-status-row"><span>Wallet</span><strong>{walletStatus}</strong></div>
              <div className="pl-status-row"><span>Loaded</span><strong>{loadedAgreement?.id || '—'}</strong></div>
            </div>
          </aside>
        </section>

        <section className="pl-toolbar" aria-label="Session controls">
          <div className="pl-toolbar-cell">
            <label className="pl-field">
              <span>Environment</span>
              <select value={environment} onChange={event => setEnvironment(event.target.value as AgreementsApiEnvironment)}>
                <option value="testnet">testnet</option>
                <option value="production">production</option>
              </select>
            </label>
            <a className="pl-field-link" href={apiReferenceUrl} target="_blank" rel="noreferrer">Open {environmentLabel} OpenAPI ↗</a>
          </div>
          <div className="pl-toolbar-cell">
            <label className="pl-field">
              <span>API Key</span>
              <input value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="cns_pk_..." autoComplete="off" />
            </label>
          </div>
          <div className="pl-toolbar-cell pl-toolbar-wallet">
            <span className="pl-eyebrow-sm pl-eyebrow">Wallet</span>
            <div className="pl-wallet-row">
              <div className="pl-wallet-copy">
                <strong>{walletStatus}</strong>
                <small>{deployChain.chainName} ({deployChain.chainId})</small>
              </div>
              <button type="button" className="pl-btn pl-btn-primary" disabled={walletBusy} onClick={() => void connectWallet()}>
                {walletBusy ? 'Connecting...' : walletAddress ? 'Refresh' : 'Connect'}
              </button>
            </div>
            {walletError ? <div className="pl-banner"><span className="pl-banner-mark">✕</span>{walletError}</div> : null}
          </div>
        </section>

        <nav className="pl-tabs" aria-label="Workflow">
          {viewItems.map((item, index) => (
            <button key={item.id} type="button" className={`pl-tab${activeView === item.id ? ' is-active' : ''}`} onClick={() => setActiveView(item.id)}>
              <span className="pl-tab-num">Step {String(index + 1).padStart(2, '0')}</span>
              <span className="pl-tab-title">{item.label}</span>
              <span className="pl-tab-desc">{item.description}</span>
            </button>
          ))}
        </nav>

        {activeView === 'overview' ? (
          <>
            <section>
              <div className="pl-cards">
                <button type="button" className="pl-wcard" onClick={() => setActiveView('deploy')}>
                  <h3>Deploy New Agreement</h3>
                  <p>Prepare agreement JSON, validate it, and create a signed <code className="pl-mono">deploy-with-permit</code> request from the connected wallet.</p>
                  <div className="pl-wcard-foot"><Method method="POST" /><code className="pl-mono">/agreements/deploy-with-permit</code></div>
                </button>
                <button type="button" className="pl-wcard" onClick={() => setActiveView('inspect')}>
                  <h3>Inspect Agreement</h3>
                  <p>Load an agreement record, then check its current state and existing inputs without leaving this screen.</p>
                  <div className="pl-wcard-foot"><Method method="GET" /><code className="pl-mono">/agreements/:id</code></div>
                </button>
                <button type="button" className="pl-wcard" onClick={() => setActiveView('input')}>
                  <h3>Submit Signed Input</h3>
                  <p>Choose one available input from a loaded agreement, sign it with the connected wallet, and submit.</p>
                  <div className="pl-wcard-foot"><Method method="POST" /><code className="pl-mono">/agreements/:id/input</code></div>
                </button>
                <button type="button" className="pl-wcard" onClick={() => setActiveView('composer')}>
                  <h3>Raw API Composer</h3>
                  <p>Curated shortcuts and a raw request editor for the remaining Agreements API endpoints.</p>
                  <div className="pl-wcard-foot"><Method method="GET" /><Method method="POST" /></div>
                </button>
              </div>
            </section>
            {renderResponsePanel()}
          </>
        ) : null}

        {activeView === 'deploy' ? (
          <>
            <section className="pl-panel">
              <div className="pl-panel-head"><h2>Deploy Agreement</h2><span className="pl-mono">POST /agreements/deploy-with-permit</span></div>
              <div className="pl-deploy">
                <div className="pl-deploy-main">
                  <label className="pl-field"><span>Display Name</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Agreements Playground Agreement" /></label>
                  <label className="pl-field"><span>Doc URI</span><input value={docUri} onChange={event => setDocUri(event.target.value)} placeholder="ar://... or https://..." /></label>
                  <label className="pl-field"><span>Agreement JSON</span><textarea value={agreementJsonText} onChange={event => setAgreementJsonText(event.target.value)} rows={14} /></label>
                  <label className="pl-field"><span>Init Values JSON</span><textarea value={initValuesText} onChange={event => setInitValuesText(event.target.value)} rows={8} /></label>
                  <label className="pl-field"><span>Participants JSON</span><textarea value={participantsText} onChange={event => setParticipantsText(event.target.value)} rows={6} /></label>
                  <label className="pl-field"><span>Observers JSON</span><textarea value={observersText} onChange={event => setObserversText(event.target.value)} rows={4} /></label>
                </div>
                <aside className="pl-deploy-side">
                  <p className="pl-eyebrow-sm pl-eyebrow">Flow</p>
                  <strong>Validate → Sign → Deploy</strong>
                  <p className="pl-hint">This screen is the only guided way to create a signed <code className="pl-mono">deploy-with-permit</code> request.</p>
                  <div className="pl-stack-tight">
                    <button type="button" className="pl-btn" disabled={busy} onClick={() => void validateTemplate()}>Validate Template</button>
                    <button type="button" className="pl-btn" disabled={busy} onClick={() => void validatePayload()}>Validate Payload</button>
                    <button type="button" className="pl-btn pl-btn-primary" disabled={busy || !walletAddress} onClick={() => void deployWithPermit()}>{busy ? 'Signing / Deploying...' : 'Sign + Deploy'}</button>
                    <button type="button" className="pl-btn" disabled={busy || !loadedAgreement?.id} onClick={() => setActiveView('input')}>Go To Input Submission</button>
                  </div>
                  {!walletAddress ? <div className="pl-banner"><span className="pl-banner-mark">!</span>Connect the wallet that should sign the deploy permit first.</div> : null}
                  {error ? <div className="pl-banner"><span className="pl-banner-mark">✕</span>{error}</div> : null}
                  {notice ? <div className="pl-banner"><span className="pl-banner-mark">✓</span>{notice}</div> : null}
                </aside>
              </div>
            </section>
            {renderResponsePanel('Deploy Response')}
          </>
        ) : null}

        {activeView === 'inspect' ? (
          <>
            <div className="pl-grid">
              <section className="pl-panel">
                <div className="pl-panel-head"><h2>Lookup</h2></div>
                <div className="pl-panel-body">
                  <label className="pl-field"><span>Agreement ID</span><input value={agreementId} onChange={event => setAgreementId(event.target.value)} placeholder="agreement uuid" /></label>
                  <div className="pl-row"><button type="button" className="pl-btn pl-btn-primary" disabled={busy} onClick={() => void loadAgreement()}>Load Agreement</button><button type="button" className="pl-btn" disabled={busy || !agreementId.trim()} onClick={() => void loadState()}>Load State</button><button type="button" className="pl-btn" disabled={busy || !agreementId.trim()} onClick={() => void loadInputs()}>Load Inputs</button></div>
                  {error ? <div className="pl-banner"><span className="pl-banner-mark">✕</span>{error}</div> : null}
                  {notice ? <div className="pl-banner"><span className="pl-banner-mark">✓</span>{notice}</div> : null}
                </div>
              </section>
              <section className="pl-panel">
                <div className="pl-panel-head"><h2>Loaded Agreement</h2></div>
                <div className="pl-panel-body">
                  {loadedAgreement ? <div className="pl-status-grid"><div className="pl-status-row"><span>ID</span><strong>{loadedAgreement.id}</strong></div><div className="pl-status-row"><span>Status</span><strong>{loadedAgreement.status || '—'}</strong></div><div className="pl-status-row"><span>Address</span><strong>{loadedAgreement.address || 'Not deployed'}</strong></div></div> : <div className="pl-empty">Load an agreement to inspect its record and discover available inputs.</div>}
                  <button type="button" className="pl-btn" disabled={!loadedAgreement} onClick={() => setActiveView('input')}>Use This For Input Submission →</button>
                </div>
              </section>
              <section className="pl-panel pl-panel-wide"><div className="pl-panel-head"><h2>Agreement Record</h2></div><div className="pl-panel-body">{loadedAgreement ? <CodeBlock title="Record" copyText={JSON.stringify(loadedAgreement, null, 2)}>{formatOutput(loadedAgreement)}</CodeBlock> : <div className="pl-empty">Agreement details will appear here after loading one.</div>}</div></section>
            </div>
            {renderResponsePanel('Inspect Response')}
          </>
        ) : null}

        {activeView === 'input' ? (
          <>
            <div className="pl-grid">
              <section className="pl-panel"><div className="pl-panel-head"><h2>Target Agreement</h2></div><div className="pl-panel-body"><label className="pl-field"><span>Agreement ID</span><input value={agreementId} onChange={event => setAgreementId(event.target.value)} placeholder="agreement uuid" /></label><div className="pl-row"><button type="button" className="pl-btn" disabled={busy || !agreementId.trim()} onClick={() => void loadAgreement()}>Reload Agreement</button><button type="button" className="pl-btn" disabled={busy || !agreementId.trim()} onClick={() => void loadInputs()}>Load Existing Inputs</button></div>{loadedAgreement ? <div className="pl-status-grid"><div className="pl-status-row"><span>Selected</span><strong>{loadedAgreement.id}</strong></div><div className="pl-status-row"><span>Address</span><strong>{loadedAgreement.address || 'Agreement is not yet deployed on-chain.'}</strong></div></div> : <div className="pl-empty">Load a deployed agreement before trying to sign an input.</div>}</div></section>
              <section className="pl-panel"><div className="pl-panel-head"><h2>Sign Input</h2></div><div className="pl-panel-body"><label className="pl-field"><span>Input ID</span><select value={selectedInputId} onChange={event => setSelectedInputId(event.target.value)}>{!availableInputIds.length ? <option value={selectedInputId}>{selectedInputId || 'Load agreement first'}</option> : null}{availableInputIds.map(inputId => <option key={inputId} value={inputId}>{inputId}</option>)}</select></label><label className="pl-field"><span>Input Values JSON</span><textarea value={inputValuesText} onChange={event => setInputValuesText(event.target.value)} rows={10} /></label><div className="pl-status-grid"><div className="pl-status-row"><span>Issuer</span><strong>{selectedInputDefinition?.issuer || '—'}</strong></div></div><button type="button" className="pl-btn pl-btn-primary" disabled={busy || !walletAddress} onClick={() => void submitInput()}>{busy ? 'Signing / Submitting...' : 'Sign + Submit Input'}</button>{error ? <div className="pl-banner"><span className="pl-banner-mark">✕</span>{error}</div> : null}{notice ? <div className="pl-banner"><span className="pl-banner-mark">✓</span>{notice}</div> : null}</div></section>
            </div>
            {renderResponsePanel('Input Response')}
          </>
        ) : null}

        {activeView === 'composer' ? (
          <>
            <div className="pl-grid">
              <section className="pl-panel"><div className="pl-panel-head"><h2>Endpoint Shortcuts</h2></div><div className="pl-panel-body pl-panel-flush"><div className="pl-presets">{quickActions.map(action => <button key={action.id} type="button" className="pl-preset" onClick={() => populateComposer(action.method, action.path, action.body || '')}><div className="pl-preset-head"><Method method={action.method} /><code>{action.path}</code></div><strong>{action.label}</strong><span>{action.note}</span></button>)}</div></div></section>
              <section className="pl-panel"><div className="pl-panel-head"><h2>Composer</h2></div><div className="pl-panel-body"><div className="pl-composer-row"><label className="pl-field"><span>Method</span><select value={method} onChange={event => setMethod(event.target.value as HttpMethod)}><option value="GET">GET</option><option value="POST">POST</option></select></label><label className="pl-field"><span>Path</span><input ref={composerPathInputRef} value={path} onChange={event => setPath(event.target.value)} /></label></div><label className="pl-field"><span>JSON Body</span><textarea value={body} onChange={event => setBody(event.target.value)} rows={12} placeholder="Optional for GET requests" /></label><div className="pl-row"><button type="button" className="pl-btn pl-btn-primary" disabled={busy} onClick={() => void executeComposer()}>{busy ? 'Sending...' : 'Send Request'}</button></div>{error ? <div className="pl-banner"><span className="pl-banner-mark">✕</span>{error}</div> : null}{notice ? <div className="pl-banner"><span className="pl-banner-mark">✓</span>{notice}</div> : null}<CodeBlock title="cURL Preview" copyText={curlPreview}>{curlPreview}</CodeBlock></div></section>
            </div>
            {renderResponsePanel('Composer Response')}
          </>
        ) : null}
      </main>

      <footer className="pl-footer">
        <div>© 2026 CNS Labs Inc.</div>
        <div className="pl-footer-links"><a href="https://docs.shodai.network" target="_blank" rel="noreferrer">Docs</a><a href="https://github.com/CNSLabs" target="_blank" rel="noreferrer">GitHub</a><a href="https://x.com/CNSLabs" target="_blank" rel="noreferrer">X / Twitter</a></div>
      </footer>
    </>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="square">
        <line x1="8" y1="1" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="15" />
        <line x1="1" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="15" y2="8" />
        <line x1="2.8" y1="2.8" x2="4.2" y2="4.2" />
        <line x1="11.8" y1="11.8" x2="13.2" y2="13.2" />
        <line x1="2.8" y1="13.2" x2="4.2" y2="11.8" />
        <line x1="11.8" y1="4.2" x2="13.2" y2="2.8" />
      </g>
    </svg>
  );
}

function Method({ method }: { method: HttpMethod }) {
  return <span className={`pl-method ${method === 'POST' ? 'm-post' : 'm-get'}`}>{method}</span>;
}

function CodeBlock({ title, children, copyText }: { title: string; children: string; copyText?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!copyText || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }
  return (
    <div className="pl-code">
      <div className="pl-code-head">
        <span>{title}</span>
        {copyText ? <button type="button" className="pl-copy-btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button> : null}
      </div>
      <pre className="pl-code-body">{children}</pre>
    </div>
  );
}

function buildQuickActions(params: {
  agreementId: string;
  agreementJsonText: string;
  displayName: string;
  initValuesText: string;
  participantsText: string;
  observersText: string;
  docUri: string;
}) {
  const agreementId = params.agreementId.trim() || 'agreement-123';
  const agreement = parseJsonObjectLoose(params.agreementJsonText, SAMPLE_AGREEMENT);
  const validateBody = {
    agreement,
    displayName: params.displayName.trim() || 'Agreements Playground Agreement',
    initValues: parseJsonObjectLoose(params.initValuesText, {}),
    participants: parseJsonArrayLoose(params.participantsText, []),
    observers: parseJsonArrayLoose(params.observersText, []),
    ...(params.docUri.trim() ? { docUri: params.docUri.trim() } : {}),
  };

  return [
    { id: 'health', label: 'Gateway Health', method: 'GET' as const, path: `${API_BASE_PATH}/health`, note: 'Check gateway availability.' },
    { id: 'list', label: 'List Agreements', method: 'GET' as const, path: `${API_BASE_PATH}/agreements`, note: 'List agreements visible to this API principal.' },
    { id: 'validate-template', label: 'Validate Template', method: 'POST' as const, path: `${API_BASE_PATH}/agreements/validate-template`, body: JSON.stringify(agreement, null, 2), note: 'Validate only the inline agreement JSON.' },
    { id: 'validate', label: 'Validate Payload', method: 'POST' as const, path: `${API_BASE_PATH}/agreements/validate`, body: JSON.stringify(validateBody, null, 2), note: 'Validate the full deployment payload.' },
    { id: 'agreement', label: 'Get Agreement', method: 'GET' as const, path: `${API_BASE_PATH}/agreements/${agreementId}`, note: 'Fetch one agreement record.' },
    { id: 'state', label: 'Get State', method: 'GET' as const, path: `${API_BASE_PATH}/agreements/${agreementId}/state`, note: 'Read the current agreement state.' },
    { id: 'inputs', label: 'Get Inputs', method: 'GET' as const, path: `${API_BASE_PATH}/agreements/${agreementId}/inputs`, note: 'Read cached input history.' },
  ];
}

function resolveDeployChainConfig(environment: AgreementsApiEnvironment) {
  const chain = environment === 'production' ? linea : lineaSepolia;
  return { chainId: chain.id, chain, chainName: chain.name } as DeployChainConfig;
}

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return ((window as typeof window & { ethereum?: Eip1193Provider }).ethereum) || null;
}

async function ensureWalletChain(provider: Eip1193Provider, config: DeployChainConfig) {
  const currentHex = (await provider.request({ method: 'eth_chainId' })) as string;
  if (parseChainId(currentHex) === config.chainId) return;
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${config.chainId.toString(16)}` }],
  });
}

function getExecutionInputs(agreement: AgreementJson | null): Record<string, InputDefinition> {
  const execution = agreement && typeof agreement === 'object' ? (agreement as unknown as Record<string, unknown>).execution : undefined;
  const inputs = execution && typeof execution === 'object' ? (execution as Record<string, unknown>).inputs : undefined;
  return inputs && typeof inputs === 'object' ? (inputs as Record<string, InputDefinition>) : {};
}

function tryAgreementJson(value: unknown): AgreementJson | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as AgreementJson;
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(raw: string, label: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
}

function parseJsonObjectLoose(raw: string, fallback: Record<string, unknown>) {
  try {
    return parseJsonObject(raw, 'JSON body');
  } catch {
    return fallback;
  }
}

function parseJsonArrayLoose(raw: string, fallback: unknown[]) {
  try {
    return parseJsonArray(raw, 'JSON array');
  } catch {
    return fallback;
  }
}

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function parseChainId(value: string) {
  return Number.parseInt(value, 16);
}

function resolveCurlBaseUrl(baseUrl: string) {
  if (baseUrl.trim()) return baseUrl;
  if (typeof window === 'undefined') return 'http://localhost:5176';
  return window.location.origin;
}

function resolveDeveloperPortalUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === PRODUCTION_APP_HOST) {
    return PRODUCTION_DEVELOPER_PORTAL_URL;
  }
  return DEVELOPER_PORTAL_PATH;
}

function resolveApiReferenceUrl(resolvedApiBaseUrl: string) {
  if (import.meta.env.PROD) return DOCS_API_REFERENCE_URL;
  return joinUrl(resolveCurlBaseUrl(resolvedApiBaseUrl), `${API_BASE_PATH}/openapi.json`);
}

function getExternalLinkProps(href: string) {
  return /^https?:\/\//.test(href)
    ? { target: '_blank', rel: 'noreferrer' }
    : {};
}

function resolveDefaultEnvironment(): AgreementsApiEnvironment {
  const configuredEnvironment = (import.meta.env.VITE_AGREEMENTS_API_ENVIRONMENT || '').trim();
  return configuredEnvironment === 'production' ? 'production' : DEFAULT_API_ENVIRONMENT;
}

function resolvePlaygroundApiBaseUrl(environment: AgreementsApiEnvironment) {
  return API_BASE_URL_OVERRIDES[environment] || resolveApiBaseUrl(environment);
}

function readApiBaseUrlOverrides(): Partial<Record<AgreementsApiEnvironment, string>> {
  const legacyOverride = normalizeOptionalBaseUrl(import.meta.env.VITE_EXTERNAL_API_BASE_URL);
  return {
    testnet:
      normalizeOptionalBaseUrl(import.meta.env.VITE_AGREEMENTS_API_TESTNET_BASE_URL) ||
      (DEFAULT_ENVIRONMENT === 'testnet' ? legacyOverride : undefined),
    production:
      normalizeOptionalBaseUrl(import.meta.env.VITE_AGREEMENTS_API_PRODUCTION_BASE_URL) ||
      (DEFAULT_ENVIRONMENT === 'production' ? legacyOverride : undefined),
  };
}

function normalizeOptionalBaseUrl(value: unknown) {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  return trimmed || undefined;
}

function formatEnvironmentLabel(environment: AgreementsApiEnvironment) {
  return environment === 'production' ? 'Production' : 'Testnet';
}

function formatBaseUrlLabel(baseUrl: string) {
  return baseUrl.trim();
}

function formatOutput(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function formatErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const maybeMessage = (value as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(value);
    } catch {
      return 'Unknown wallet error.';
    }
  }
  return String(value);
}

export default App;
