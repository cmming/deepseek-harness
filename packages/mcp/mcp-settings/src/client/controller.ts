import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from './remote.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** The minimal observable interface required by the settings card hook. */
interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export type McpTransport = 'streamable-http' | 'stdio'

/** Browser-safe projection of one Host-managed MCP server. */
export interface McpServerSettings {
  id: string
  enabled: boolean
  serverName: string
  transport: McpTransport
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolCallTimeoutMs: number
  failOnStartupError: boolean
}

export interface McpConnectionTestResult {
  ok: boolean
  durationMs: number
  toolNames: string[]
  tools: McpDiscoveredTool[]
  error?: string
}

export interface McpDiscoveredTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

interface McpSettingsSection { servers: McpServerSettings[] }

export interface McpSettingsCardState {
  available: boolean
  writable: boolean
  revision: number
  servers: readonly McpServerSettings[]
}

export interface McpSettingsCardFace {
  hooks: { mcpSettingsCard: ObservableSnapshot<McpSettingsCardState> }
  saveServices(servers: readonly McpServerSettings[]): Promise<void>
  testConnection(id: string): Promise<McpConnectionTestResult>
}

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

/** Browser owner that bridges settings and the Host diagnostic Remote endpoint. */
export class McpSettingsCardController {
  private readonly store = new Snapshot<McpSettingsCardState>({
    available: false, writable: false, revision: 0, servers: [],
  })

  constructor(private readonly scope: SettingsScope<McpSettingsSection>, private readonly ctx: ClientContext) {
    scope.subscribe(() => { this.adopt() })
    this.adopt()
  }

  inject(): McpSettingsCardFace {
    return {
      hooks: { mcpSettingsCard: this.store },
      saveServices: async (servers) => { await this.save(servers) },
      testConnection: async id => await this.testConnection(id),
    }
  }

  private adopt(): void {
    const snapshot = this.scope.getSnapshot()
    const servers = snapshot.value?.servers ?? []
    this.store.set({
      available: snapshot.status === 'ready', writable: snapshot.writable, revision: snapshot.revision ?? 0,
      servers: servers.map(copyServer),
    })
  }

  private async save(input: readonly McpServerSettings[]): Promise<void> {
    const servers = input.map(copyServer)
    validateClientServers(servers)
    await this.scope.set('servers', servers)
    this.adopt()
  }

  private async testConnection(id: string): Promise<McpConnectionTestResult> {
    const response = await this.ctx.remote.mcpSettings.testConnection(id)
    if (!response.ok) throw new Error(response.error.message)
    return response.value
  }

}

function copyServer(server: McpServerSettings): McpServerSettings {
  // Versions before transport was editable stored HTTP rows without this field.
  // The Host schema supplies the same default; mirror it before the UI edits or
  // serializes a row so a successful schema normalization is never treated as a rejection.
  const transport: McpTransport = server.transport === 'stdio' ? 'stdio' : 'streamable-http'
  return {
    id: server.id, enabled: server.enabled, serverName: server.serverName, transport,
    ...(server.url === undefined ? {} : { url: server.url }),
    ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
    ...(server.command === undefined ? {} : { command: server.command }),
    ...(server.args === undefined ? {} : { args: [...server.args] }),
    ...(server.env === undefined ? {} : { env: { ...server.env } }),
    ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
    toolCallTimeoutMs: server.toolCallTimeoutMs, failOnStartupError: server.failOnStartupError,
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
    if (!Number.isInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs <= 0) {
      throw new Error('Each tool call timeout must be a positive whole number.')
    }
    if (server.transport === 'streamable-http') validateHttpServer(server)
    else validateStdioServer(server)
  }
}

function validateHttpServer(server: McpServerSettings): void {
  let endpoint: URL
  try { endpoint = new URL(server.url ?? '') } catch { throw new Error('Each MCP endpoint must be a valid URL.') }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('Each MCP endpoint must use http or https.')
  if (endpoint.username.length > 0 || endpoint.password.length > 0) throw new Error('MCP endpoint URLs must not include credentials.')
  const headerNames = new Set<string>()
  for (const header of Object.keys(server.headers ?? {})) {
    const normalized = header.trim().toLowerCase()
    if (normalized.length === 0) throw new Error('Custom header names cannot be empty.')
    if (headerNames.has(normalized)) throw new Error('Custom header names must be unique.')
    headerNames.add(normalized)
  }
}

function validateStdioServer(server: McpServerSettings): void {
  if ((server.command ?? '').trim().length === 0) throw new Error('A stdio MCP service needs a command.')
  for (const name of Object.keys(server.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Environment variable names must be valid identifiers.')
  }
}
