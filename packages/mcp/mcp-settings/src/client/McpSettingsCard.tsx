import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {
  McpConnectionTestResult,
  McpSettingsCardFace,
  McpServerSettings,
  McpTransport,
} from './controller.ts'
import type { McpSettingsLocaleKey } from './locales.ts'

export type McpSettingsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.mcpSettings'>
  & InjectFace<McpSettingsCardFace>

/** Render one self-contained MCP service manager. */
export function McpSettingsCard(props: McpSettingsCardProps) {
  const state = props.useMcpSettingsCard(snapshot => snapshot)
  const [draft, setDraft] = useState<readonly McpServerSettings[]>(state.servers)
  const [tests, setTests] = useState<Record<string, McpConnectionTestResult>>({})
  const [expandedTools, setExpandedTools] = useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setDraft(state.servers)
  }, [state.revision])

  const valid = useMemo(() => isValid(draft), [draft])
  if (!state.available) return null
  const disabled = !state.writable || saving || testing !== undefined

  const update = (id: string, change: Partial<McpServerSettings>) => {
    setDraft(current => current.map(server => server.id === id ? { ...server, ...change } : server))
    setMessage(undefined)
    setFailed(false)
  }
  const setTransport = (server: McpServerSettings, transport: McpTransport) => {
    if (transport === server.transport) return
    const replacement = transport === 'stdio' ? asStdio(server) : asHttp(server)
    setDraft(current => current.map(item => item.id === server.id ? replacement : item))
    setMessage(undefined)
    setFailed(false)
  }
  const remove = (id: string) => {
    setDraft(current => current.filter(server => server.id !== id))
    setTests(current => omitRecordKey(current, id))
    setExpandedTools(current => omitRecordKey(current, id))
  }
  const add = () => {
    setDraft(current => [...current, newServer()])
    setMessage(undefined)
    setFailed(false)
  }
  const updateMap = (
    server: McpServerSettings,
    field: 'headers' | 'env',
    position: number,
    part: 'name' | 'value',
    value: string,
  ) => {
    const entries = Object.entries(server[field] ?? {})
    const entry = entries[position]
    if (entry === undefined) return
    entries[position] = part === 'name' ? [value, entry[1]] : [entry[0], value]
    update(server.id, { [field]: Object.fromEntries(entries) })
  }
  const addMapEntry = (server: McpServerSettings, field: 'headers' | 'env') => {
    const map = { ...(server[field] ?? {}) }
    let index = 1
    const base = field === 'headers' ? 'X-Custom-Header' : 'MCP_ENV'
    let key = base
    while (Object.keys(map).some(name => name.toLowerCase() === key.toLowerCase())) key = `${base}_${index++}`
    map[key] = ''
    update(server.id, { [field]: map })
  }
  const removeMapEntry = (server: McpServerSettings, field: 'headers' | 'env', position: number) => {
    const entries = Object.entries(server[field] ?? {})
    entries.splice(position, 1)
    update(server.id, { [field]: Object.fromEntries(entries) })
  }
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setMessage(undefined)
    setFailed(false)
    try {
      await props.saveServices(draft)
      setMessage(props.t('saved'))
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }
  const test = async (server: McpServerSettings) => {
    const saved = state.servers.find(candidate => candidate.id === server.id)
    if (saved === undefined || JSON.stringify(saved) !== JSON.stringify(server)) {
      setFailed(true)
      setMessage(props.t('saveBeforeTest'))
      return
    }
    setTesting(server.id)
    setMessage(undefined)
    setFailed(false)
    try {
      const result = await props.testConnection(server.id)
      setTests(current => ({ ...current, [server.id]: result }))
    } catch (error) {
      setTests(current => ({
        ...current,
        [server.id]: {
          ok: false,
          durationMs: 0,
          toolNames: [],
          tools: [],
          error: error instanceof Error ? error.message : String(error),
        },
      }))
    } finally {
      setTesting(undefined)
    }
  }

  return (
    <section style={styles.card}>
      <h3 style={styles.title}>{props.t('title')}</h3>
      <p style={styles.description}>{props.t('description')}</p>
      {!state.writable ? <p style={styles.notice}>{props.t('readOnly')}</p> : null}
      {draft.length === 0 ? <p style={styles.empty}>{props.t('empty')}</p> : null}
      {draft.map((server) => {
        const result = tests[server.id]
        return <div key={server.id} style={styles.row}>
          <p style={styles.metadata}>{props.t('serviceId')}: {server.id}</p>
          <label style={styles.label}>
            {props.t('transport')}
            <select
              style={styles.input}
              value={server.transport}
              disabled={disabled}
              onChange={(event) => { setTransport(server, event.target.value as McpTransport) }}
            >
              <option value="streamable-http">Streamable HTTP</option>
              <option value="stdio">stdio</option>
            </select>
          </label>
          <label style={styles.label}>
            {props.t('serviceName')}
            <input
              style={styles.input}
              value={server.serverName}
              disabled={disabled}
              onChange={(event) => { update(server.id, { serverName: event.target.value }) }}
              placeholder="cmagent"
            />
          </label>
          <p style={styles.hint}>{props.t('namespace')}</p>
          {server.transport === 'streamable-http'
            ? <HttpFields
              server={server}
              disabled={disabled}
              update={update}
              addMapEntry={addMapEntry}
              updateMap={updateMap}
              removeMapEntry={removeMapEntry}
              t={props.t}
            />
            : <StdioFields
              server={server}
              disabled={disabled}
              update={update}
              addMapEntry={addMapEntry}
              updateMap={updateMap}
              removeMapEntry={removeMapEntry}
              t={props.t}
            />}
          <p style={styles.sectionTitle}>{props.t('advanced')}</p>
          <label style={styles.label}>
            {props.t('toolCallTimeout')}
            <input
              style={styles.input}
              type="number"
              min="1"
              step="1"
              value={server.toolCallTimeoutMs}
              disabled={disabled}
              onChange={(event) => { update(server.id, { toolCallTimeoutMs: Number(event.target.value) }) }}
            />
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={server.failOnStartupError}
              disabled={disabled}
              onChange={(event) => { update(server.id, { failOnStartupError: event.target.checked }) }}
            />
            {props.t('failOnStartupError')}
          </label>
          <div style={styles.testBox}>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={disabled || !valid}
              onClick={() => { void test(server) }}
            >
              {testing === server.id ? props.t('testing') : props.t('testConnection')}
            </button>
            {result === undefined
              ? <p style={styles.hint}>{props.t('testHint')}</p>
              : <TestResult
                result={result}
                expandedToolName={expandedTools[server.id]}
                onToggleTool={(name) => {
                  setExpandedTools(current => ({
                    ...current,
                    [server.id]: current[server.id] === name ? undefined : name,
                  }))
                }}
                t={props.t}
              />}
          </div>
          <div style={styles.controls}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={server.enabled}
                disabled={disabled}
                onChange={(event) => { update(server.id, { enabled: event.target.checked }) }}
              />
              {props.t('enabled')}
            </label>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={disabled}
              onClick={() => { remove(server.id) }}
            >
              {props.t('remove')}
            </button>
          </div>
        </div>
      })}
      <div style={styles.footer}>
        <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={add}>
          {props.t('add')}
        </button>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={disabled || !valid}
          onClick={() => { void save() }}
        >
          {saving ? props.t('saving') : props.t('save')}
        </button>
      </div>
      {!valid ? <p style={styles.error}>{props.t('invalid')}</p> : null}
      {message !== undefined ? <p style={failed ? styles.error : styles.notice} role="status">{message}</p> : null}
    </section>
  )
}

function HttpFields({
  server,
  disabled,
  update,
  addMapEntry,
  updateMap,
  removeMapEntry,
  t,
}: FieldsProps) {
  return <>
    <label style={styles.label}>
      {t('endpoint')}
      <input
        style={styles.input}
        type="url"
        value={server.url ?? ''}
        disabled={disabled}
        onChange={(event) => { update(server.id, { url: event.target.value }) }}
        placeholder="http://localhost:8080/mcp"
      />
    </label>
    <MapEditor
      server={server}
      field="headers"
      disabled={disabled}
      addMapEntry={addMapEntry}
      updateMap={updateMap}
      removeMapEntry={removeMapEntry}
      t={t}
    />
  </>
}

function StdioFields({
  server,
  disabled,
  update,
  addMapEntry,
  updateMap,
  removeMapEntry,
  t,
}: Pick<FieldsProps, 'server' | 'disabled' | 'update' | 'addMapEntry' | 'updateMap' | 'removeMapEntry' | 't'>) {
  return <>
    <label style={styles.label}>
      {t('command')}
      <input
        style={styles.input}
        value={server.command ?? ''}
        disabled={disabled}
        onChange={(event) => { update(server.id, { command: event.target.value }) }}
        placeholder="npx"
      />
    </label>
    <label style={styles.label}>
      {t('arguments')}
      <textarea
        style={styles.textarea}
        value={(server.args ?? []).join('\n')}
        disabled={disabled}
        onChange={(event) => {
          update(server.id, { args: event.target.value.split(/\r?\n/).filter(Boolean) })
        }}
        placeholder={'--yes\n@modelcontextprotocol/server-filesystem'}
      />
    </label>
    <p style={styles.hint}>{t('argumentsHint')}</p>
    <label style={styles.label}>
      {t('workingDirectory')}
      <input
        style={styles.input}
        value={server.cwd ?? ''}
        disabled={disabled}
        onChange={(event) => { update(server.id, { cwd: event.target.value }) }}
        placeholder="C:\\workspace"
      />
    </label>
    <MapEditor
      server={server}
      field="env"
      disabled={disabled}
      addMapEntry={addMapEntry}
      updateMap={updateMap}
      removeMapEntry={removeMapEntry}
      t={t}
    />
  </>
}

type FieldsProps = {
  server: McpServerSettings
  disabled: boolean
  update: (id: string, change: Partial<McpServerSettings>) => void
  addMapEntry: (server: McpServerSettings, field: 'headers' | 'env') => void
  updateMap: (
    server: McpServerSettings,
    field: 'headers' | 'env',
    position: number,
    part: 'name' | 'value',
    value: string,
  ) => void
  removeMapEntry: (server: McpServerSettings, field: 'headers' | 'env', position: number) => void
  t: (key: McpSettingsLocaleKey) => string
}

function MapEditor({
  server,
  field,
  disabled,
  addMapEntry,
  updateMap,
  removeMapEntry,
  t,
}: Pick<FieldsProps, 'server' | 'disabled' | 'addMapEntry' | 'updateMap' | 'removeMapEntry' | 't'> & {
  field: 'headers' | 'env'
}) {
  const labels = field === 'headers'
    ? [t('customHeaders'), t('addHeader'), t('headerName'), t('headerValue')]
    : [t('environment'), t('addEnvironment'), t('environmentName'), t('environmentValue')]
  return <>
    <p style={styles.sectionTitle}>{labels[0]}</p>
    {Object.entries(server[field] ?? {}).map(([name, value], position) => <div key={position} style={styles.mapRow}>
      <input
        style={styles.input}
        value={name}
        disabled={disabled}
        onChange={(event) => { updateMap(server, field, position, 'name', event.target.value) }}
        placeholder={labels[2]}
      />
      <input
        style={styles.input}
        value={value}
        disabled={disabled}
        onChange={(event) => { updateMap(server, field, position, 'value', event.target.value) }}
        placeholder={labels[3]}
      />
      <button
        type="button"
        style={styles.secondaryButton}
        disabled={disabled}
        onClick={() => { removeMapEntry(server, field, position) }}
      >
        {t('removeHeader')}
      </button>
    </div>)}
    <button
      type="button"
      style={styles.secondaryButton}
      disabled={disabled}
      onClick={() => { addMapEntry(server, field) }}
    >
      {labels[1]}
    </button>
  </>
}

function TestResult({
  result,
  expandedToolName,
  onToggleTool,
  t,
}: {
  result: McpConnectionTestResult
  expandedToolName: string | undefined
  onToggleTool: (name: string) => void
  t: (key: McpSettingsLocaleKey) => string
}) {
  if (!result.ok) {
    return <div style={styles.error}>
      <p style={styles.resultLine}>{t('testFailed')} · {t('duration')}: {result.durationMs} ms</p>
      <p style={styles.resultLine}>{t('failureReason')}: {result.error ?? t('unknownError')}</p>
    </div>
  }
  return <div style={styles.discovery}>
    <p style={styles.success}>{t('testSuccess')} · {t('duration')}: {result.durationMs} ms</p>
    <div style={styles.discoveryHeader}>
      <span>{t('availableTools')}</span>
      <span style={styles.toolCount}>{t('toolsFound')}: {result.tools.length}</span>
    </div>
    {result.tools.length === 0 ? <p style={styles.hint}>{t('noToolsFound')}</p> : result.tools.map((tool) => {
      const expanded = expandedToolName === tool.name
      const fields = inputFields(tool.inputSchema)
      return <div key={tool.name} style={styles.toolItem}>
        <button
          type="button"
          style={styles.toolRowButton}
          onClick={() => { onToggleTool(tool.name) }}
          aria-expanded={expanded}
        >
          <span style={styles.disclosure}>{expanded ? '⌄' : '›'}</span>
          <span style={styles.toolSummary}>
            <strong style={styles.toolName}>{tool.name}</strong>
            <span style={styles.toolDescription}>{tool.description ?? t('noDescription')}</span>
          </span>
          <span style={styles.availablePill}>{t('discovered')}</span>
        </button>
        {!expanded ? null : <div style={styles.toolDetail}>
          <p style={styles.detailLabel}>{t('toolDescription')}</p>
          <p style={styles.detailText}>{tool.description ?? t('noDescription')}</p>
          <p style={styles.detailLabel}>{t('inputSchema')}</p>
          {fields.length === 0
            ? <p style={styles.hint}>{t('noInputFields')}</p>
            : <div style={styles.inputFields}>
              {fields.map(field => <div key={field.name} style={styles.inputField}>
                <span>
                  <strong>{field.name}</strong>
                  {field.required ? <em style={styles.requiredMark}> *</em> : null}
                  {field.description === undefined
                    ? null
                    : <small style={styles.fieldDescription}>{field.description}</small>}
                </span>
                <span style={styles.typePill}>{field.type}</span>
              </div>)}
            </div>}
        </div>}
      </div>
    })}
  </div>
}

function inputFields(inputSchema: Record<string, unknown>) {
  const properties = asRecord(inputSchema.properties)
  const required = new Set(
    Array.isArray(inputSchema.required)
      ? inputSchema.required.filter((name): name is string => typeof name === 'string')
      : [],
  )
  return Object.entries(properties).map(([name, value]) => {
    const schema = asRecord(value)
    const typeValue = schema.type
    const type = typeof typeValue === 'string'
      ? typeValue
      : Array.isArray(typeValue)
        ? typeValue.filter((item): item is string => typeof item === 'string').join(' | ')
        : 'any'
    return {
      name,
      required: required.has(name),
      type: type || 'any',
      ...(typeof schema.description === 'string' ? { description: schema.description } : {}),
    }
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))
}

function asHttp(server: McpServerSettings): McpServerSettings {
  const { command: _command, args: _args, env: _env, cwd: _cwd, ...common } = server
  return {
    ...common,
    transport: 'streamable-http',
    url: '',
    headers: {},
  }
}

function asStdio(server: McpServerSettings): McpServerSettings {
  const { url: _url, headers: _headers, ...common } = server
  return { ...common, transport: 'stdio', command: '', args: [], env: {}, cwd: '' }
}

function isValid(servers: readonly McpServerSettings[]): boolean {
  const ids = new Set<string>()
  const names = new Set<string>()
  return servers.every((server) => {
    const validName = /^[A-Za-z0-9_-]{1,32}$/.test(server.serverName)
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.id) || ids.has(server.id) || !validName || names.has(server.serverName)) {
      return false
    }
    ids.add(server.id)
    names.add(server.serverName)
    if (!Number.isInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs <= 0) return false
    if (server.transport === 'stdio') {
      return (server.command ?? '').trim().length > 0
        && Object.keys(server.env ?? {}).every(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    }
    try {
      const url = new URL(server.url ?? '')
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false
    } catch {
      return false
    }
    const headers = new Set<string>()
    return Object.keys(server.headers ?? {}).every((name) => {
      const key = name.trim().toLowerCase()
      if (!key || headers.has(key)) return false
      headers.add(key)
      return true
    })
  })
}

function newServer(): McpServerSettings {
  const id = `mcp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24)
  return {
    id,
    enabled: true,
    serverName: `mcp_${id.slice(0, 8)}`,
    transport: 'streamable-http',
    url: '',
    headers: {},
    toolCallTimeoutMs: 60_000,
    failOnStartupError: false,
  }
}

const styles = {
  card: {
    margin: '16px 0', padding: 16, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
    background: 'var(--dsw-alias-bg-layer-2)',
  },
  title: { margin: 0, fontSize: 16, color: 'var(--dsw-alias-label-primary)' },
  description: {
    margin: '8px 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)',
  },
  row: {
    margin: '12px 0', padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-3)',
  },
  label: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, color: 'var(--dsw-alias-label-primary)',
    fontSize: 13, fontWeight: 500,
  },
  input: {
    height: 34, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7,
    background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit',
  },
  textarea: {
    minHeight: 72, padding: '8px 10px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7,
    background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit',
    resize: 'vertical',
  },
  hint: { margin: '6px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.45 },
  metadata: {
    margin: '4px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, fontFamily: 'monospace',
  },
  sectionTitle: { margin: '16px 0 8px', color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 600 },
  mapRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 8, margin: '8px 0',
    alignItems: 'center',
  },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14 },
  checkboxLabel: { display: 'flex', gap: 7, alignItems: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 },
  primaryButton: {
    border: 0, borderRadius: 7, padding: '7px 13px', color: 'var(--dsw-alias-bg-layer-3)',
    background: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7, padding: '7px 13px',
    color: 'var(--dsw-alias-label-primary)', background: 'transparent', cursor: 'pointer',
  },
  error: { margin: '10px 0 0', color: 'var(--dsw-alias-label-error)', fontSize: 12 },
  success: {
    margin: '10px 0 0', color: 'var(--dsw-alias-label-success, var(--dsw-alias-label-primary))', fontSize: 12,
  },
  notice: { margin: '10px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  empty: { margin: '12px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
  testBox: { marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)' },
  resultLine: { margin: '4px 0' },
  discovery: {
    marginTop: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden',
    color: 'var(--dsw-alias-label-primary)',
  },
  discoveryHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', fontSize: 13,
    fontWeight: 600, borderBottom: '1px solid var(--dsw-alias-border-l2)',
  },
  toolCount: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, fontWeight: 400 },
  toolItem: { borderBottom: '1px solid var(--dsw-alias-border-l2)' },
  toolRowButton: {
    display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', width: '100%', gap: 8, alignItems: 'center',
    padding: '10px 12px', border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  disclosure: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 18, lineHeight: 1 },
  toolSummary: { display: 'grid', gap: 3, minWidth: 0 },
  toolName: { color: 'var(--dsw-alias-label-primary)', fontSize: 13 },
  toolDescription: {
    overflow: 'hidden', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.4,
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  availablePill: {
    padding: '3px 7px', borderRadius: 99, background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-secondary)', fontSize: 11, whiteSpace: 'nowrap',
  },
  toolDetail: { padding: '0 12px 12px 40px', background: 'var(--dsw-alias-bg-layer-1)' },
  detailLabel: {
    margin: '10px 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)',
  },
  detailText: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.5 },
  inputFields: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, overflow: 'hidden' },
  inputField: {
    display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '8px 10px',
    borderBottom: '1px solid var(--dsw-alias-border-l2)', fontSize: 12,
  },
  requiredMark: { color: 'var(--dsw-alias-label-error)', fontStyle: 'normal' },
  fieldDescription: {
    display: 'block', marginTop: 3, color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 400,
  },
  typePill: {
    padding: '2px 7px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 99,
    color: 'var(--dsw-alias-label-secondary)', fontSize: 11, whiteSpace: 'nowrap',
  },
} as const
