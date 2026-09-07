import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { McpSettingsCardFace, McpServerSettings } from './controller.ts'

/** Props emitted by the settings-slot renderer for this card. */
export type McpSettingsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.mcpSettings'>
  & InjectFace<McpSettingsCardFace>

/** Render one self-contained MCP service manager. */
export function McpSettingsCard(props: McpSettingsCardProps) {
  const state = props.useMcpSettingsCard(snapshot => snapshot)
  const [draft, setDraft] = useState<readonly McpServerSettings[]>(state.servers)
  const [authorization, setAuthorization] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [clearingAuthorization, setClearingAuthorization] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setDraft(state.servers)
    setAuthorization({})
  }, [state.revision])

  const valid = useMemo(() => isValid(draft), [draft])
  if (!state.available) return null
  const disabled = !state.writable || saving || clearingAuthorization !== undefined

  const update = (id: string, change: Partial<McpServerSettings>) => {
    setDraft(current => current.map(server => server.id === id ? { ...server, ...change } : server))
    setMessage(undefined)
    setFailed(false)
  }
  const remove = (id: string) => {
    setDraft(current => current.filter(server => server.id !== id))
    setAuthorization(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setMessage(undefined)
    setFailed(false)
  }
  const add = () => {
    setDraft(current => [...current, newServer()])
    setMessage(undefined)
    setFailed(false)
  }
  const addHeader = (server: McpServerSettings) => {
    const headers = { ...(server.headers ?? {}) }
    let index = 1
    let name = 'X-Custom-Header'
    while (Object.keys(headers).some(key => key.toLowerCase() === name.toLowerCase())) name = `X-Custom-Header-${index++}`
    headers[name] = ''
    update(server.id, { headers })
  }
  const updateHeader = (server: McpServerSettings, position: number, field: 'name' | 'value', value: string) => {
    const entries = Object.entries(server.headers ?? {})
    const entry = entries[position]
    if (entry === undefined) return
    const [name, current] = entry
    entries[position] = field === 'name' ? [value, current] : [name, value]
    update(server.id, { headers: Object.fromEntries(entries) })
  }
  const removeHeader = (server: McpServerSettings, position: number) => {
    const entries = Object.entries(server.headers ?? {})
    entries.splice(position, 1)
    update(server.id, { headers: Object.fromEntries(entries) })
  }
  const clearAuthorization = async (server: McpServerSettings) => {
    if (server.authorizationRef === undefined || clearingAuthorization !== undefined) return
    setClearingAuthorization(server.id)
    setMessage(undefined)
    setFailed(false)
    try {
      await props.clearAuthorization(server.authorizationRef)
      setAuthorization(current => {
        const next = { ...current }
        delete next[server.id]
        return next
      })
      setMessage(props.t('authorizationCleared'))
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setClearingAuthorization(undefined)
    }
  }
  const updateCredentialReference = (server: McpServerSettings, value: string) => {
    const authorizationRef = value.trim()
    setDraft(current => current.map((item) => {
      if (item.id !== server.id) return item
      if (authorizationRef.length === 0) {
        const { authorizationRef: _removed, ...withoutReference } = item
        return withoutReference
      }
      return { ...item, authorizationRef }
    }))
    setMessage(undefined)
    setFailed(false)
  }
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setMessage(undefined)
    setFailed(false)
    try {
      await props.saveServices(draft, authorization)
      setAuthorization({})
      setMessage(props.t('saved'))
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={styles.card}>
      <h3 style={styles.title}>{props.t('title')}</h3>
      <p style={styles.description}>{props.t('description')}</p>
      {!state.writable ? <p style={styles.notice}>{props.t('readOnly')}</p> : null}
      {draft.length === 0 ? <p style={styles.empty}>{props.t('empty')}</p> : null}
      {draft.map((server) => (
        <div key={server.id} style={styles.row}>
          <p style={styles.metadata}>{props.t('serviceId')}: {server.id}</p>
          <p style={styles.metadata}>{props.t('transport')}: Streamable HTTP</p>
          <label style={styles.label}>
            {props.t('serviceName')}
            <input
              style={styles.input}
              value={server.serverName}
              disabled={disabled}
              onChange={event => { update(server.id, { serverName: event.target.value }) }}
              placeholder="cmagent"
            />
          </label>
          <p style={styles.hint}>{props.t('namespace')}</p>
          <label style={styles.label}>
            {props.t('endpoint')}
            <input
              style={styles.input}
              type="url"
              value={server.url}
              disabled={disabled}
              onChange={event => { update(server.id, { url: event.target.value }) }}
              placeholder="http://localhost:8080/mcp"
            />
          </label>
          <label style={styles.label}>
            {props.t('authorization')}
            <input
              style={styles.input}
              type="password"
              autoComplete="off"
              value={authorization[server.id] ?? ''}
              disabled={disabled}
              onChange={event => { setAuthorization(current => ({ ...current, [server.id]: event.target.value })) }}
              placeholder={state.credentials[server.id] === true ? '••••••••' : 'Bearer …'}
            />
          </label>
          <p style={styles.hint}>
            {state.credentials[server.id] === true ? props.t('authorizationSet') : props.t('authorizationUnset')}
            {' · '}{props.t('authorizationHint')}
          </p>
          <label style={styles.label}>
            {props.t('credentialReference')}
            <input
              style={styles.input}
              value={server.authorizationRef ?? ''}
              disabled={disabled}
              onChange={event => { updateCredentialReference(server, event.target.value) }}
              placeholder="DSH_MCP_SERVICE_AUTHORIZATION"
            />
          </label>
          <p style={styles.hint}>{props.t('credentialReferenceHint')}</p>
          <button
            type="button"
            style={styles.secondaryButton}
            disabled={disabled || clearingAuthorization !== undefined || server.authorizationRef === undefined || state.credentials[server.id] !== true}
            onClick={() => { void clearAuthorization(server) }}
          >
            {clearingAuthorization === server.id ? props.t('clearingAuthorization') : props.t('clearAuthorization')}
          </button>
          <p style={styles.sectionTitle}>{props.t('customHeaders')}</p>
          {Object.entries(server.headers ?? {}).map(([name, value], position) => (
            <div key={`${name}-${position}`} style={styles.headerRow}>
              <input
                style={styles.input}
                value={name}
                disabled={disabled}
                onChange={event => { updateHeader(server, position, 'name', event.target.value) }}
                placeholder={props.t('headerName')}
              />
              <input
                style={styles.input}
                value={value}
                disabled={disabled}
                onChange={event => { updateHeader(server, position, 'value', event.target.value) }}
                placeholder={props.t('headerValue')}
              />
              <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={() => { removeHeader(server, position) }}>
                {props.t('removeHeader')}
              </button>
            </div>
          ))}
          <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={() => { addHeader(server) }}>
            {props.t('addHeader')}
          </button>
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
              onChange={event => { update(server.id, { toolCallTimeoutMs: Number(event.target.value) }) }}
            />
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={server.failOnStartupError}
              disabled={disabled}
              onChange={event => { update(server.id, { failOnStartupError: event.target.checked }) }}
            />
            {props.t('failOnStartupError')}
          </label>
          <div style={styles.controls}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={server.enabled}
                disabled={disabled}
                onChange={event => { update(server.id, { enabled: event.target.checked }) }}
              />
              {props.t('enabled')}
            </label>
            <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={() => { remove(server.id) }}>
              {props.t('remove')}
            </button>
          </div>
        </div>
      ))}
      <div style={styles.footer}>
        <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={add}>{props.t('add')}</button>
        <button type="button" style={styles.primaryButton} disabled={disabled || !valid} onClick={() => { void save() }}>
          {saving ? props.t('saving') : props.t('save')}
        </button>
      </div>
      {!valid ? <p style={styles.error}>{props.t('invalid')}</p> : null}
      {message !== undefined ? <p style={failed ? styles.error : styles.notice} role="status">{message}</p> : null}
      <p style={styles.hint}>{props.t('connectionHint')}</p>
    </section>
  )
}

function isValid(servers: readonly McpServerSettings[]): boolean {
  const names = new Set<string>()
  for (const server of servers) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.serverName) || names.has(server.serverName)) return false
    names.add(server.serverName)
    try {
      const endpoint = new URL(server.url)
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') return false
    } catch {
      return false
    }
    if (server.authorizationRef !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(server.authorizationRef)) return false
    if (!Number.isInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs <= 0) return false
    const headerNames = new Set<string>()
    for (const header of Object.keys(server.headers ?? {})) {
      const normalized = header.trim().toLowerCase()
      if (normalized.length === 0 || normalized === 'authorization' || headerNames.has(normalized)) return false
      headerNames.add(normalized)
    }
  }
  return true
}

function newServer(): McpServerSettings {
  const id = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '').slice(0, 24)
    : `mcp${Date.now().toString(36)}`
  return {
    id,
    enabled: true,
    serverName: `mcp_${id.slice(0, 8)}`,
    url: '',
    headers: {},
    authorizationRef: `DSH_MCP_${id.toUpperCase()}_AUTHORIZATION`,
    toolCallTimeoutMs: 60_000,
    failOnStartupError: false,
  }
}

const styles = {
  card: { margin: '16px 0', padding: 16, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2)' },
  title: { margin: 0, fontSize: 16, color: 'var(--dsw-alias-label-primary)' },
  description: { margin: '8px 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
  row: { margin: '12px 0', padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-3)' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 500 },
  input: { height: 34, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' },
  hint: { margin: '6px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.45 },
  metadata: { margin: '4px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, fontFamily: 'monospace' },
  sectionTitle: { margin: '16px 0 8px', color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 600 },
  headerRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 8, margin: '8px 0', alignItems: 'center' },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14 },
  checkboxLabel: { display: 'flex', gap: 7, alignItems: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 7, padding: '7px 13px', color: 'var(--dsw-alias-bg-layer-3)', background: 'var(--dsw-alias-label-primary)', cursor: 'pointer' },
  secondaryButton: { border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7, padding: '7px 13px', color: 'var(--dsw-alias-label-primary)', background: 'transparent', cursor: 'pointer' },
  error: { margin: '10px 0 0', color: 'var(--dsw-alias-label-error)', fontSize: 12 },
  notice: { margin: '10px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  empty: { margin: '12px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
} as const
