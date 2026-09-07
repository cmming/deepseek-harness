/**
 * Settings-owned collection of Streamable HTTP MCP client instances.
 *
 * Each saved server becomes one child `@deepseek-ai/dsh-mcp-client` fiber.
 * The collection itself has a durable settings namespace, while Authorization
 * values remain in the credentials provider and never enter that namespace.
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

/** Settings namespace shared by the Host and browser halves. */
export const MCP_SETTINGS_NAMESPACE = 'mcp-settings'

/** The default call limit used for a server added in the Settings UI. */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** One user-managed Streamable HTTP MCP connection. */
export interface McpServer {
  /** Stable row id; changing it would lose the associated credential reference. */
  id: string
  /** Whether this connection should currently register its tools. */
  enabled: boolean
  /** Stable MCP tool namespace, yielding `mcp__<serverName>__<tool>`. */
  serverName: string
  /** Streamable HTTP MCP endpoint. */
  url: string
  /** Non-sensitive headers. Authorization must use {@link authorizationRef}. */
  headers: Record<string, string>
  /** Credential reference holding the complete Authorization header value. */
  authorizationRef?: string
  /** Maximum duration of one tool call. */
  toolCallTimeoutMs: number
  /** Make a failed initial connection reject the instance instead of retrying. */
  failOnStartupError: boolean
}

/** Plugin configuration: the editable list of MCP services. */
export interface Config {
  servers: McpServer[]
}

const McpServerSchema: z<McpServer> = z.object({
  id: z.string().required().pattern(IDENTIFIER_PATTERN),
  enabled: z.boolean().default(true),
  serverName: z.string().required().pattern(IDENTIFIER_PATTERN),
  url: z.string().required(),
  headers: z.dict(z.string()).default({}),
  authorizationRef: z.string(),
  toolCallTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
  failOnStartupError: z.boolean().default(false),
})

/** Schema used by the Settings service and direct `cordis.yml` loading. */
export const Config: z<Config> = z.object({
  servers: z.array(McpServerSchema).default([]),
})

/** Cordis plugin identity. */
export const name = 'mcp-settings'

/** MCP instances need the model-facing tool registry before they start. */
export const inject = ['tools']

/**
 * Validate semantics Schemastery cannot express: every service owns one
 * namespace, endpoints are HTTP(S), credentials name valid references, and
 * Authorization can never accidentally be persisted as a regular header.
 */
export function validateConfig(config: Config): void {
  const ids = new Set<string>()
  const serverNames = new Set<string>()
  for (const server of config.servers) {
    if (ids.has(server.id)) throw new Error(`mcp-settings: duplicate service id "${server.id}"`)
    ids.add(server.id)
    if (serverNames.has(server.serverName)) {
      throw new Error(`mcp-settings: duplicate tool namespace "${server.serverName}"`)
    }
    serverNames.add(server.serverName)
    let endpoint: URL
    try {
      endpoint = new URL(server.url)
    } catch {
      throw new Error(`mcp-settings: "${server.serverName}" has an invalid endpoint URL`)
    }
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error(`mcp-settings: "${server.serverName}" endpoint must use http or https`)
    }
    if (server.authorizationRef !== undefined && !isCredentialRefName(server.authorizationRef)) {
      throw new Error(`mcp-settings: "${server.serverName}" has an invalid Authorization credential reference`)
    }
    const headerNames = new Set<string>()
    for (const header of Object.keys(server.headers)) {
      const normalized = header.trim().toLowerCase()
      if (normalized.length === 0) {
        throw new Error(`mcp-settings: "${server.serverName}" has an empty header name`)
      }
      if (normalized === 'authorization') {
        throw new Error(`mcp-settings: store Authorization for "${server.serverName}" in its credential field, not headers`)
      }
      if (headerNames.has(normalized)) {
        throw new Error(`mcp-settings: "${server.serverName}" has duplicate header "${header}"`)
      }
      headerNames.add(normalized)
    }
  }
}

/** Turn one managed row into the upstream MCP client's one-server config. */
export async function resolveMcpClientConfig(ctx: Context, server: McpServer): Promise<McpClientConfig> {
  const headers = { ...server.headers }
  if (server.authorizationRef !== undefined) {
    const credentials = ctx.get('credentials')
    const resolved = credentials === undefined ? undefined : await credentials.resolve(credentialRef(server.authorizationRef))
    if (resolved !== undefined) headers.Authorization = resolved.value
  }
  return {
    transport: 'streamable-http',
    serverName: server.serverName,
    url: server.url,
    headers,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
}

/** Serialize replacement so settings and credential events cannot overlap connections. */
class McpConnectionManager {
  private fibers: Array<ReturnType<Context['plugin']>> = []
  private tail: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(private readonly ctx: Context, private readonly source: () => Config) {}

  /** Queue a full replacement of the child MCP fibers. */
  refresh(): void {
    this.tail = this.tail.then(() => this.replace()).catch((error: unknown) => {
      this.ctx.logger.error('mcp-settings: could not apply MCP service changes')
      this.ctx.logger.error(error)
    })
  }

  /** Stop every current child and wait for a scheduled change to settle. */
  async dispose(): Promise<void> {
    this.stopped = true
    await this.tail
    await this.stopCurrent()
  }

  private async replace(): Promise<void> {
    if (this.stopped) return
    const config = this.source()
    validateConfig(config)
    await this.stopCurrent()
    if (this.stopped) return
    const next: Array<ReturnType<Context['plugin']>> = []
    try {
      for (const server of config.servers) {
        if (!server.enabled) continue
        const fiber = this.ctx.plugin(McpClient, await resolveMcpClientConfig(this.ctx, server))
        next.push(fiber)
        await fiber
      }
      this.fibers = next
    } catch (error) {
      await Promise.all(next.map(async fiber => { await fiber.dispose() }))
      throw error
    }
  }

  private async stopCurrent(): Promise<void> {
    const current = this.fibers
    this.fibers = []
    await Promise.all(current.map(async fiber => { await fiber.dispose() }))
  }
}

/**
 * Register the managed settings section and keep the live MCP fibers aligned
 * with it. Updating either the server list or a referenced Authorization
 * credential re-creates the affected upstream clients, so tool discovery is
 * refreshed without restarting DeepSeek Harness.
 */
export function apply(ctx: Context, config: Config): void {
  validateConfig(config)
  let source = () => config
  const manager = new McpConnectionManager(ctx, () => source())
  manager.refresh()

  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.settings.installSection(ctx, MCP_SETTINGS_NAMESPACE, Config, config, {
      validate: validateConfig,
      setSource: current => { source = current },
      onChange: () => { manager.refresh() },
    })
  })

  ctx.on('credentials/reference-updated', (ref) => {
    if (source().servers.some(server => server.authorizationRef === ref)) manager.refresh()
  })
  ctx.effect(() => () => manager.dispose(), 'mcp-settings: connection manager')
}
