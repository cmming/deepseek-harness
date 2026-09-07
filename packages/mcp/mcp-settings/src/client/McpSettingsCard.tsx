import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { McpSettingsCardFace, McpSettingsCardState, McpServerSettings } from './controller.ts'

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
  const [message, setMessage] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setDraft(state.servers)
    setAuthorization({})
  }, [state.revision])

  const valid = useMemo(() => isValid(draft), [draft])
  if (!state.available) return null
  const disabled = !state.writable || saving

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
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14 },
  checkboxLabel: { display: 'flex', gap: 7, alignItems: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 },
  primaryButton: { border: 0, borderRadius: 7, padding: '7px 13px', color: 'var(--dsw-alias-bg-layer-3)', background: 'var(--dsw-alias-label-primary)', cursor: 'pointer' },
  secondaryButton: { border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 7, padding: '7px 13px', color: 'var(--dsw-alias-label-primary)', background: 'transparent', cursor: 'pointer' },
  error: { margin: '10px 0 0', color: 'var(--dsw-alias-label-error)', fontSize: 12 },
  notice: { margin: '10px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  empty: { margin: '12px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 },
} as const
