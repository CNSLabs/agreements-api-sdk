import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PartnerApiClient,
  PARTNER_API_BASE_PATH,
  computeDefaultDeadlineSeconds,
  deployAgreementWithPermit,
  extractPartnerApiErrorMessage,
  getExecutionInputIds,
  joinUrl,
  submitAgreementInputWithPermit,
  type AgreementRecord,
  type PartnerDirectParticipantRecord,
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
  rpcUrl: string;
};

const DEFAULT_BASE_URL = resolveDefaultBaseUrl();
const DEFAULT_OWNER = '0x67fD5A5ec681b1208308813a2B3A0DD431Be7278';
const DEFAULT_COUNTERPARTY = '0xbe32388c134a952cdbcc5673e93d46ffd8b85065';

const SAMPLE_AGREEMENT = {
  metadata: {
    id: 'did:example:partner-playground-v1',
    templateId: 'did:template:partner-playground-v1',
    version: '1.0.0',
    createdAt: '2026-04-13T00:00:00Z',
    name: 'Partner Playground Agreement',
    author: 'CNS Labs',
    description: 'Sample inline agreement JSON for partner API validation and deployment testing.',
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
    data: '# Partner Playground Agreement\n\nThis is a sample inline agreement payload.',
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
    inputs: {
      approve: {
        type: 'VerifiedCredentialEIP712',
        schema: 'verified-credential-eip712.schema.json',
        displayName: 'Approve',
        description: 'Approves the agreement.',
        data: { approved: true },
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

  const [activeView, setActiveView] = useState<AppView>('overview');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState(`${PARTNER_API_BASE_PATH}/health`);
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
  const [displayName, setDisplayName] = useState('Partner Playground Agreement');
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

  const partnerClient = useMemo(
    () =>
      new PartnerApiClient({
        baseUrl,
        apiKey: apiKey.trim() || undefined,
        headers: () => createBrowserTelemetryHeaders(),
      }),
    [baseUrl, apiKey],
  );

  const deployChain = useMemo(resolveDeployChainConfig, []);
  const docsUrl = joinUrl(resolveDeveloperDocsBaseUrl(baseUrl), resolveDeveloperDocsBasePath());
  const openApiUrl = joinUrl(resolveCurlBaseUrl(baseUrl), `${PARTNER_API_BASE_PATH}/openapi.json`);
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
    const parts = [`curl -i "${joinUrl(resolveCurlBaseUrl(baseUrl), path)}"`];
    if (apiKey.trim()) parts.push(`-H "X-API-Key: ${apiKey.trim()}"`);
    if (method !== 'GET') parts.push(`-X ${method}`);
    if (body.trim()) {
      parts.push('-H "Content-Type: application/json"');
      parts.push(`--data '${body.replace(/'/g, "'\\''")}'`);
    }
    return parts.join(' \\\n  ');
  }, [apiKey, baseUrl, body, method, path]);

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

  async function runPartnerRequest<T>(config: {
    method: HttpMethod;
    path: string;
    body?: unknown;
    captureResponse?: boolean;
  }): Promise<T> {
    const startedAt = new Date();
    const startedMs = performance.now();
    const meta = await partnerClient.exchangeJson(config.method, config.path, config.body);

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
      throw new Error(extractPartnerApiErrorMessage(meta.parsedBody, meta.bodyText, meta.status));
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
      if (!deployChain.ok) throw new Error(deployChain.message);
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts.length) throw new Error('Wallet did not return any accounts.');
      await ensureWalletChain(provider, deployChain.value);
      const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
      setWalletAddress(normalizeAddress(accounts[0]));
      setConnectedChainId(parseChainId(chainHex));
    } catch (walletFailure) {
      setWalletError(walletFailure instanceof Error ? walletFailure.message : String(walletFailure));
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
      if (method === 'POST' && trimmedPath === `${PARTNER_API_BASE_PATH}/agreements/deploy-with-permit`) {
        throw new Error('Use "Sign + Deploy" so the connected wallet signs the deploy-with-permit request.');
      }
      if (method === 'POST' && /\/agreements\/[^/]+\/input$/.test(trimmedPath)) {
        throw new Error('Use "Sign + Submit Input" so the connected wallet signs the input submission.');
      }
      await runPartnerRequest({
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
      const record = await runPartnerRequest<AgreementRecord>({
        method: 'GET',
        path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId.trim()}`,
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
      await runPartnerRequest({
        method: 'POST',
        path: `${PARTNER_API_BASE_PATH}/agreements/validate-template`,
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
      await runPartnerRequest({
        method: 'POST',
        path: `${PARTNER_API_BASE_PATH}/agreements/validate`,
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
      if (!deployChain.ok) throw new Error(deployChain.message);

      const agreement = parseJsonObject(agreementJsonText, 'Agreement JSON') as unknown as AgreementJson;
      const initValues = parseJsonObject(initValuesText, 'Init values') as Record<string, InitValue>;

      await ensureWalletChain(provider, deployChain.value);

      const publicClient = createPublicClient({
        chain: deployChain.value.chain,
        transport: http(deployChain.value.rpcUrl),
      });
      const walletClient = createWalletClient({
        account: walletAddress as Address,
        chain: deployChain.value.chain,
        transport: custom(provider),
      });

      setNotice('Submitting signed deploy request...');
      const deployStartedAt = new Date();
      const deployStartedMs = performance.now();
      const deployed = await deployAgreementWithPermit({
        client: partnerClient,
        walletClient: walletClient as never,
        publicClient: publicClient as never,
        agreement,
        displayName: displayName.trim() || 'Partner Playground Agreement',
        initValues,
        participants: parseJsonArray(participantsText, 'Participants') as PartnerDirectParticipantRecord[],
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
      await runPartnerRequest({
        method: 'GET',
        path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId.trim()}/state`,
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
      await runPartnerRequest({
        method: 'GET',
        path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId.trim()}/inputs`,
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
      if (!deployChain.ok) throw new Error(deployChain.message);

      const agreement = tryAgreementJson(loadedAgreement?.json);
      if (!agreement || !loadedAgreement?.address) throw new Error('Load a deployed agreement first.');

      await ensureWalletChain(provider, deployChain.value);
      const publicClient = createPublicClient({
        chain: deployChain.value.chain,
        transport: http(deployChain.value.rpcUrl),
      });
      const walletClient = createWalletClient({
        account: walletAddress as Address,
        chain: deployChain.value.chain,
        transport: custom(provider),
      });
      const values = parseJsonObject(inputValuesText, 'Input values');

      setNotice('Submitting signed input...');
      const inputStartedAt = new Date();
      const inputStartedMs = performance.now();
      const inputRecord = await submitAgreementInputWithPermit({
        client: partnerClient,
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
    ? `${shortenAddress(walletAddress)}${connectedChainId ? ` on ${connectedChainId}` : ''}`
    : 'No wallet connected';

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
    { id: 'deploy', label: 'Deploy', description: 'Validate and deploy agreements' },
    { id: 'inspect', label: 'Inspect', description: 'Load records, state, and inputs' },
    { id: 'input', label: 'Input', description: 'Sign and submit agreement inputs' },
    { id: 'composer', label: 'Composer', description: 'Send raw partner API requests' },
  ];

  function renderResponsePanel(title = 'Latest Response') {
    return (
      <section className="panel panel-wide">
        <h2>{title}</h2>
        {response ? (
          <div className="response-layout">
            <div className="response-meta">
              <div className="metric"><span>Status</span><strong>{response.status}</strong></div>
              <div className="metric"><span>Duration</span><strong>{response.durationMs} ms</strong></div>
              <div className="metric"><span>Started</span><strong>{response.startedAt}</strong></div>
            </div>
            <div className="response-block">
              <h3>Body</h3>
              <pre>{formatOutput(response.parsedBody ?? response.bodyText)}</pre>
            </div>
          </div>
        ) : (
          <div className="empty-state">Responses from partner API requests will appear here.</div>
        )}
      </section>
    );
  }

  return (
    <div className="shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Partner API Playground</p>
          <div className="hero-actions">
            <a className="link-chip" href={docsUrl} target="_blank" rel="noreferrer">
              Open Developer Docs
            </a>
            <a className="link-chip" href={openApiUrl} target="_blank" rel="noreferrer">
              Open Raw OpenAPI
            </a>
          </div>
          <h1>Exercise only the partner endpoints that still exist.</h1>
          <p className="lede">
            This playground validates inline agreement JSON, deploys with a signed permit, loads
            agreement state, fetches input history, and submits signed inputs.
          </p>
        </div>

        <div className="status-card">
          <div>
            <span className="status-label">Target</span>
            <strong>{describeBaseUrl(baseUrl)}</strong>
          </div>
          <div>
            <span className="status-label">Auth</span>
            <strong>{apiKey.trim() ? 'API key loaded' : 'No API key'}</strong>
          </div>
          <div>
            <span className="status-label">Wallet</span>
            <strong>{walletStatus}</strong>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="panel workspace-toolbar">
          <div className="toolbar-grid">
            <label className="field toolbar-field">
              <span>Base URL</span>
              <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="http://localhost:8080" />
            </label>
            <label className="field toolbar-field">
              <span>API Key</span>
              <input value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="cns_pk_..." autoComplete="off" />
            </label>
            <div className="toolbar-field toolbar-wallet">
              <span className="status-label">Wallet</span>
              <div className="toolbar-wallet-row">
                <div className="toolbar-wallet-copy">
                  <strong>{walletStatus}</strong>
                  <small>{deployChain.ok ? `${deployChain.value.chainName} (${deployChain.value.chainId})` : deployChain.message}</small>
                </div>
                <button type="button" className="primary" disabled={walletBusy || !deployChain.ok} onClick={() => void connectWallet()}>
                  {walletBusy ? 'Connecting...' : walletAddress ? 'Refresh Wallet' : 'Connect Wallet'}
                </button>
              </div>
              {walletError ? <div className="error-banner compact">{walletError}</div> : null}
            </div>
          </div>
        </section>

        <section className="workspace-nav">
          {viewItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`workspace-tab${activeView === item.id ? ' workspace-tab-active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </section>

        <div className="workspace-view">
          {activeView === 'overview' ? (
            <div className="grid">
              <section className="panel panel-wide">
                <h2>Workflows</h2>
                <div className="surface-groups">
                  <button type="button" className="workspace-card workspace-link" onClick={() => setActiveView('deploy')}>
                    <h3>Deploy New Agreement</h3>
                    <p>Prepare agreement JSON, validate it, and create a signed `deploy-with-permit` request from the connected wallet.</p>
                    <div className="inline-actions">
                      <span className="method-chip method-chip-post">POST</span>
                      <code>/agreements/deploy-with-permit</code>
                    </div>
                  </button>
                  <button type="button" className="workspace-card workspace-link" onClick={() => setActiveView('inspect')}>
                    <h3>Inspect Agreement</h3>
                    <p>Load an agreement record, then check its current state and existing inputs without leaving the same screen.</p>
                    <div className="inline-actions">
                      <span className="method-chip method-chip-get">GET</span>
                      <code>/agreements/:id</code>
                    </div>
                  </button>
                  <button type="button" className="workspace-card workspace-link" onClick={() => setActiveView('input')}>
                    <h3>Submit Signed Input</h3>
                    <p>Choose one available input from a loaded agreement, sign it with the connected wallet, and submit it.</p>
                    <div className="inline-actions">
                      <span className="method-chip method-chip-post">POST</span>
                      <code>/agreements/:id/input</code>
                    </div>
                  </button>
                  <button type="button" className="workspace-card workspace-link" onClick={() => setActiveView('composer')}>
                    <h3>Raw API Composer</h3>
                    <p>Use curated shortcuts and a raw request editor for the remaining partner API endpoints in one focused workspace.</p>
                    <div className="inline-actions">
                      <span className="method-chip method-chip-get">GET</span>
                      <span className="method-chip method-chip-post">POST</span>
                    </div>
                  </button>
                </div>
              </section>

              <section className="panel">
                <h2>Current Session</h2>
                <div className="stack">
                  <div className="info-card"><span className="status-label">Target</span><strong>{describeBaseUrl(baseUrl)}</strong></div>
                  <div className="info-card"><span className="status-label">Auth</span><strong>{apiKey.trim() ? 'API key loaded' : 'No API key'}</strong></div>
                  <div className="info-card"><span className="status-label">Loaded Agreement</span><strong>{loadedAgreement?.id || 'None loaded yet'}</strong></div>
                </div>
              </section>

              <section className="panel">
                <h2>Latest Response</h2>
                {response ? <pre>{formatOutput(response.parsedBody ?? response.bodyText)}</pre> : <div className="empty-state">No request has been sent yet.</div>}
              </section>
            </div>
          ) : null}

          {activeView === 'deploy' ? (
            <div className="grid">
              <section className="panel panel-wide">
                <h2>Deploy Agreement</h2>
                <div className="deploy-grid">
                  <div className="deploy-main">
                    <label className="field">
                      <span>Display Name</span>
                      <input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Partner Playground Agreement" />
                    </label>
                    <label className="field">
                      <span>Doc URI</span>
                      <input value={docUri} onChange={event => setDocUri(event.target.value)} placeholder="ar://... or https://..." />
                    </label>
                    <label className="field">
                      <span>Agreement JSON</span>
                      <textarea value={agreementJsonText} onChange={event => setAgreementJsonText(event.target.value)} rows={14} />
                    </label>
                    <label className="field">
                      <span>Init Values JSON</span>
                      <textarea value={initValuesText} onChange={event => setInitValuesText(event.target.value)} rows={8} />
                    </label>
                    <label className="field">
                      <span>Participants JSON</span>
                      <textarea value={participantsText} onChange={event => setParticipantsText(event.target.value)} rows={6} />
                    </label>
                    <label className="field">
                      <span>Observers JSON</span>
                      <textarea value={observersText} onChange={event => setObserversText(event.target.value)} rows={4} />
                    </label>
                  </div>

                  <div className="deploy-sidebar">
                    <div className="info-card">
                      <span className="status-label">Flow</span>
                      <strong>Validate, sign, deploy</strong>
                      <p className="hint">This screen is the only guided way to create a signed `deploy-with-permit` request.</p>
                    </div>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void validateTemplate()}>Validate Template</button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void validatePayload()}>Validate Payload</button>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy || !walletAddress || !deployChain.ok}
                      onClick={() => void deployWithPermit()}
                    >
                      {busy ? 'Signing / Deploying...' : 'Sign + Deploy'}
                    </button>
                    <button type="button" className="ghost" disabled={busy || !loadedAgreement?.id} onClick={() => setActiveView('input')}>
                      Go To Input Submission
                    </button>
                    {!walletAddress ? <div className="error-banner compact">Connect the wallet that should sign the deploy permit first.</div> : null}
                    {!deployChain.ok ? <div className="error-banner compact">{deployChain.message}</div> : null}
                    {error ? <div className="error-banner compact">{error}</div> : null}
                    {notice ? <div className="success-banner compact">{notice}</div> : null}
                  </div>
                </div>
              </section>
              {renderResponsePanel('Deploy Response')}
            </div>
          ) : null}

          {activeView === 'inspect' ? (
            <div className="grid">
              <section className="panel">
                <h2>Lookup</h2>
                <label className="field">
                  <span>Agreement ID</span>
                  <input value={agreementId} onChange={event => setAgreementId(event.target.value)} placeholder="agreement uuid" />
                </label>
                <div className="actions">
                  <button type="button" className="primary" disabled={busy} onClick={() => void loadAgreement()}>Load Agreement</button>
                  <button type="button" className="ghost" disabled={busy || !agreementId.trim()} onClick={() => void loadState()}>Load State</button>
                  <button type="button" className="ghost" disabled={busy || !agreementId.trim()} onClick={() => void loadInputs()}>Load Inputs</button>
                </div>
                {error ? <div className="error-banner compact">{error}</div> : null}
                {notice ? <div className="success-banner compact">{notice}</div> : null}
              </section>

              <section className="panel">
                <h2>Loaded Agreement</h2>
                {loadedAgreement ? (
                  <div className="stack">
                    <div className="info-card"><span className="status-label">ID</span><strong>{loadedAgreement.id}</strong></div>
                    <div className="info-card"><span className="status-label">Status</span><strong>{loadedAgreement.status || '—'}</strong></div>
                    <div className="info-card"><span className="status-label">Address</span><strong>{loadedAgreement.address || 'Not deployed'}</strong></div>
                    <button type="button" className="ghost" onClick={() => setActiveView('input')}>Use This For Input Submission</button>
                  </div>
                ) : (
                  <div className="empty-state">Load an agreement to inspect its record and discover available inputs.</div>
                )}
              </section>

              <section className="panel panel-wide">
                <h2>Agreement Record</h2>
                {loadedAgreement ? <pre>{formatOutput(loadedAgreement)}</pre> : <div className="empty-state">Agreement details will appear here after loading one.</div>}
              </section>
              {renderResponsePanel('Inspect Response')}
            </div>
          ) : null}

          {activeView === 'input' ? (
            <div className="grid">
              <section className="panel">
                <h2>Target Agreement</h2>
                <label className="field">
                  <span>Agreement ID</span>
                  <input value={agreementId} onChange={event => setAgreementId(event.target.value)} placeholder="agreement uuid" />
                </label>
                <div className="actions">
                  <button type="button" className="ghost" disabled={busy || !agreementId.trim()} onClick={() => void loadAgreement()}>Reload Agreement</button>
                  <button type="button" className="ghost" disabled={busy || !agreementId.trim()} onClick={() => void loadInputs()}>Load Existing Inputs</button>
                </div>
                {loadedAgreement ? (
                  <div className="info-card">
                    <span className="status-label">Selected Agreement</span>
                    <strong>{loadedAgreement.id}</strong>
                    <p className="hint">{loadedAgreement.address || 'Agreement is not yet deployed on-chain.'}</p>
                  </div>
                ) : (
                  <div className="empty-state">Load a deployed agreement before trying to sign an input.</div>
                )}
              </section>

              <section className="panel">
                <h2>Sign Input</h2>
                <label className="field">
                  <span>Input ID</span>
                  <select value={selectedInputId} onChange={event => setSelectedInputId(event.target.value)}>
                    {!availableInputIds.length ? <option value={selectedInputId}>{selectedInputId || 'Load agreement first'}</option> : null}
                    {availableInputIds.map((inputId) => (
                      <option key={inputId} value={inputId}>{inputId}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Input Values JSON</span>
                  <textarea value={inputValuesText} onChange={event => setInputValuesText(event.target.value)} rows={10} />
                </label>
                <div className="info-card">
                  <span className="status-label">Input Issuer</span>
                  <strong>{selectedInputDefinition?.issuer || '—'}</strong>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !walletAddress || !deployChain.ok}
                  onClick={() => void submitInput()}
                >
                  {busy ? 'Signing / Submitting...' : 'Sign + Submit Input'}
                </button>
                {error ? <div className="error-banner compact">{error}</div> : null}
                {notice ? <div className="success-banner compact">{notice}</div> : null}
              </section>
              {renderResponsePanel('Input Response')}
            </div>
          ) : null}

          {activeView === 'composer' ? (
            <div className="grid">
              <section className="panel">
                <h2>Endpoint Shortcuts</h2>
                <div className="preset-list">
                  {quickActions.map((action) => (
                    <button key={action.id} type="button" className="preset" onClick={() => populateComposer(action.method, action.path, action.body || '')}>
                      <div className="preset-meta">
                        <span className={`method-chip method-chip-${action.method.toLowerCase()}`}>{action.method}</span>
                        <code>{action.path}</code>
                      </div>
                      <strong>{action.label}</strong>
                      <span>{action.note}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h2>Composer</h2>
                <div className="composer">
                  <div className="row">
                    <label className="field field-compact">
                      <span>Method</span>
                      <select value={method} onChange={event => setMethod(event.target.value as HttpMethod)}>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </label>
                    <label className="field field-grow">
                      <span>Path</span>
                      <input ref={composerPathInputRef} value={path} onChange={event => setPath(event.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    <span>JSON Body</span>
                    <textarea value={body} onChange={event => setBody(event.target.value)} rows={12} placeholder="Optional for GET requests" />
                  </label>
                  <div className="actions">
                    <button type="button" className="primary" disabled={busy} onClick={() => void executeComposer()}>
                      {busy ? 'Sending...' : 'Send Request'}
                    </button>
                  </div>
                  {error ? <div className="error-banner">{error}</div> : null}
                  {notice ? <div className="success-banner">{notice}</div> : null}
                </div>

                <div className="curl-card">
                  <h3>cURL Preview</h3>
                  <pre>{curlPreview}</pre>
                </div>
              </section>
              {renderResponsePanel('Composer Response')}
            </div>
          ) : null}
        </div>
      </main>
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
    displayName: params.displayName.trim() || 'Partner Playground Agreement',
    initValues: parseJsonObjectLoose(params.initValuesText, {}),
    participants: parseJsonArrayLoose(params.participantsText, []),
    observers: parseJsonArrayLoose(params.observersText, []),
    ...(params.docUri.trim() ? { docUri: params.docUri.trim() } : {}),
  };

  return [
    { id: 'health', label: 'Gateway Health', method: 'GET' as const, path: `${PARTNER_API_BASE_PATH}/health`, note: 'Check gateway availability.' },
    { id: 'list', label: 'List Agreements', method: 'GET' as const, path: `${PARTNER_API_BASE_PATH}/agreements`, note: 'List agreements visible to this partner principal.' },
    { id: 'validate-template', label: 'Validate Template', method: 'POST' as const, path: `${PARTNER_API_BASE_PATH}/agreements/validate-template`, body: JSON.stringify(agreement, null, 2), note: 'Validate only the inline agreement JSON.' },
    { id: 'validate', label: 'Validate Payload', method: 'POST' as const, path: `${PARTNER_API_BASE_PATH}/agreements/validate`, body: JSON.stringify(validateBody, null, 2), note: 'Validate the full deployment payload.' },
    { id: 'agreement', label: 'Get Agreement', method: 'GET' as const, path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId}`, note: 'Fetch one agreement record.' },
    { id: 'state', label: 'Get State', method: 'GET' as const, path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId}/state`, note: 'Read the current agreement state.' },
    { id: 'inputs', label: 'Get Inputs', method: 'GET' as const, path: `${PARTNER_API_BASE_PATH}/agreements/${agreementId}/inputs`, note: 'Read cached input history.' },
  ];
}

function resolveDeployChainConfig() {
  const chainId = Number(import.meta.env.VITE_AGREEMENTS_CHAIN_ID || lineaSepolia.id);
  const chain = chainId === linea.id ? linea : chainId === lineaSepolia.id ? lineaSepolia : null;
  if (!chain) return { ok: false as const, message: `Unsupported VITE_AGREEMENTS_CHAIN_ID ${chainId}.` };
  let rpcUrl = import.meta.env.VITE_AGREEMENTS_RPC_URL;
  const infuraProjectId = import.meta.env.VITE_INFURA_PROJECT_ID;
  if (!rpcUrl && infuraProjectId) {
    rpcUrl = chainId === linea.id
      ? `https://linea-mainnet.infura.io/v3/${infuraProjectId}`
      : `https://linea-sepolia.infura.io/v3/${infuraProjectId}`;
  }
  if (!rpcUrl) rpcUrl = chain.rpcUrls.default.http[0];
  if (!rpcUrl) return { ok: false as const, message: 'Set VITE_AGREEMENTS_RPC_URL or VITE_INFURA_PROJECT_ID.' };
  return { ok: true as const, value: { chainId: chain.id, chain, chainName: chain.name, rpcUrl } as DeployChainConfig };
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

function describeBaseUrl(baseUrl: string) {
  return baseUrl.trim() || 'same-origin via Vite proxy';
}

function resolveCurlBaseUrl(baseUrl: string) {
  if (baseUrl.trim()) return baseUrl;
  if (typeof window === 'undefined') return 'http://localhost:5176';
  return window.location.origin;
}

function resolveDeveloperDocsBaseUrl(baseUrl: string) {
  if (baseUrl.trim()) return baseUrl;
  if (typeof window === 'undefined') return 'http://localhost:5177';

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:5177`;
  }

  return window.location.origin;
}

function resolveDeveloperDocsBasePath() {
  const configuredBasePath = (
    import.meta.env.VITE_DEVELOPER_DOCS_BASE_PATH ||
    import.meta.env.VITE_PARTNER_DOCS_BASE_PATH ||
    '/developers/'
  ).trim();

  if (!configuredBasePath) {
    return '/developers/';
  }

  const normalizedBasePath = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;

  if (normalizedBasePath === '/') {
    return '/';
  }

  return `${normalizedBasePath.replace(/\/+$/, '')}/`;
}

function resolveDefaultBaseUrl() {
  const configuredBaseUrl = (import.meta.env.VITE_PARTNER_API_BASE_URL || '').trim();
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window === 'undefined') return '';
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : window.location.origin;
}

function formatOutput(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export default App;
