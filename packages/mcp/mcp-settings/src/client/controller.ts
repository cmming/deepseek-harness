import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-ui-slots'

/** Browser-safe projection of one Host-managed MCP server. */
export interface McpServerSettings {
  id: string
  enabled: boolean
  serverName: string
  url: string
  /** Non-sensitive deployment headers retained when the UI saves a service. */
  headers?: Record<string, string>
  authorizationRef?: string
  toolCallTimeoutMs: number
  failOnStartupError: boolean
}

interface McpSettingsSection {
  servers: McpServerSettings[]
}

/** State consumed by the React settings card. */
export interface McpSettingsCardState {
  available: boolean
  writable: boolean
  revision: number
  servers: readonly McpServerSettings[]
  credentials: Readonly<Record<string, boolean>>
}

/** Injected face passed from the slot registration to the card component. */
export interface McpSettingsCardFace {
  hooks: { mcpSettingsCard: ObservableSnapshot<McpSettingsCardState> }
  saveServices(servers: readonly McpServerSettings[], authorizations: Readonly<Record<string, string>>): Promise<void>
}

/** Lightweight subscription source; the renderer supplies the React selector hook. */
class Snapshot<T> implements ObservableSnapshot<T> {
  private readonly listeners = new Set<() => void>()
  constructor(private value: T) {}
  getSnapshot(): T { return this.value }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  set(value: T): void {
    this.value = value
    for (const listener of [...this.listeners]) listener()
  }
}

/** Browser owner that bridges one settings scope and the credential Remote API. */
export class McpSettingsCardController {
  private readonly store = new Snapshot<McpSettingsCardState>({
    available: false,
    writable: false,
    revision: 0,
    servers: [],
    credentials: {},
  })

  constructor(
    private readonly scope: SettingsScope<McpSettingsSection>,
    private readonly ctx: ClientContext,
  ) {
    scope.subscribe(() => { void this.adopt() })
    void this.adopt()
  }

  /** Slot-facing controller API. */
  inject(): McpSettingsCardFace {
    return {
      hooks: { mcpSettingsCard: this.store },
      saveServices: async (servers, authorizations) => { await this.save(servers, authorizations) },
    }
  }

  private async adopt(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const section = snapshot.value
    const servers = section?.servers ?? []
    const credentials = await this.describeCredentials(servers)
    this.store.set({
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      revision: snapshot.revision ?? 0,
      servers: servers.map(copyServer),
      credentials,
    })
  }

  private async save(
    input: readonly McpServerSettings[],
    authorizations: Readonly<Record<string, string>>,
  ): Promise<void> {
    const servers = input.map(copyServer)
    validateClientServers(servers)
    await this.scope.set('servers', servers)
    const stored = this.scope.getSnapshot().value?.servers
    if (!sameServers(stored, servers)) throw new Error('Harness did not accept the MCP service changes.')
    for (const server of servers) {
      const value = authorizations[server.id]?.trim()
      if (value === undefined || value.length === 0 || server.authorizationRef === undefined) continue
      const response = await this.ctx.remote.credentials.set(server.authorizationRef, value)
      if (!response.ok) throw new Error(response.error.message)
    }
    await this.adopt()
  }

  private async describeCredentials(servers: readonly McpServerSettings[]): Promise<Record<string, boolean>> {
    const refs = [...new Set(servers.flatMap(server => server.authorizationRef === undefined ? [] : [server.authorizationRef]))]
    if (refs.length === 0) return {}
    const response = await this.ctx.remote.credentials.describe(refs)
    if (!response.ok) return {}
    const result: Record<string, boolean> = {}
    for (const server of servers) {
      if (server.authorizationRef !== undefined) result[server.id] = response.value[server.authorizationRef]?.configured === true
    }
    return result
  }
}

function copyServer(server: McpServerSettings): McpServerSettings {
  return {
    id: server.id,
    enabled: server.enabled,
    serverName: server.serverName,
    url: server.url,
    ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
    ...(server.authorizationRef === undefined ? {} : { authorizationRef: server.authorizationRef }),
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
}

function validateClientServers(servers: readonly McpServerSettings[]): void {
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const server of servers) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.id) || ids.has(server.id)) throw new Error('Each service requires a unique internal id.')
    ids.add(server.id)
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.serverName) || names.has(server.serverName)) {
      throw new Error('Each service requires a unique tool namespace.')
    }
    names.add(server.serverName)
    let endpoint: URL
    try { endpoint = new URL(server.url) } catch { throw new Error('Each MCP endpoint must be a valid URL.') }
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('Each MCP endpoint must use http or https.')
  }
}

function sameServers(left: readonly McpServerSettings[] | undefined, right: readonly McpServerSettings[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
