/** Settings-owned MCP client instances and safe connection diagnostics. */

import type { Context } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import z from '@deepseek-ai/schemastery'
import type { McpConnectionTestResult, McpDiscoveredTool } from './types.ts'

export type { McpConnectionTestResult } from './types.ts'

export const MCP_SETTINGS_NAMESPACE = 'mcp-settings'
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const CONNECTION_TEST_TIMEOUT_MS = 15_000

export type McpTransport = 'streamable-http' | 'stdio'

interface McpServerBase {
  id: string
  enabled: boolean
  serverName: string
  toolCallTimeoutMs: number
  failOnStartupError: boolean
}

/** An MCP server reached through the Streamable HTTP transport. */
export interface StreamableHttpMcpServer extends McpServerBase {
  transport: 'streamable-http'
  url: string
  headers: Record<string, string>
}

/** An MCP server started locally and reached through its standard input/output. */
export interface StdioMcpServer extends McpServerBase {
  transport: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
}

/** One user-managed MCP connection. */
export type McpServer = StreamableHttpMcpServer | StdioMcpServer

export interface Config {
  servers: McpServer[]
}

const CommonServerSchema = {
  id: z.string().required().pattern(IDENTIFIER_PATTERN),
  enabled: z.boolean().default(true),
  serverName: z.string().required().pattern(IDENTIFIER_PATTERN),
  toolCallTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
  failOnStartupError: z.boolean().default(false),
}

const McpServerSchema = z.union([
  z.object({
    ...CommonServerSchema,
    // Default preserves configurations made by versions before transport was editable.
    transport: z.const('streamable-http').default('streamable-http'),
    url: z.string().required(),
    headers: z.dict(z.string()).default({}),
  }),
  z.object({
    ...CommonServerSchema,
    transport: z.const('stdio'),
    command: z.string().required(),
    args: z.array(z.string()).default([]),
    env: z.dict(z.string()).default({}),
    cwd: z.string().default(''),
  }),
])

export const Config: z<Config> = z.object({
  servers: z.array(McpServerSchema).default([]),
})

export const name = 'mcp-settings'
export const inject = ['tools']

/** Validate the durable configuration. */
export function validateConfig(config: Config): void {
  const ids = new Set<string>()
  const serverNames = new Set<string>()
  for (const server of config.servers) {
    if (ids.has(server.id)) throw new Error(`mcp-settings: duplicate service id "${server.id}"`)
    ids.add(server.id)
    if (serverNames.has(server.serverName)) throw new Error(`mcp-settings: duplicate tool namespace "${server.serverName}"`)
    serverNames.add(server.serverName)
    if (server.transport === 'streamable-http') validateHttpServer(server)
    else validateStdioServer(server)
  }
}

function validateHttpServer(server: StreamableHttpMcpServer): void {
  let endpoint: URL
  try { endpoint = new URL(server.url) } catch { throw new Error(`mcp-settings: "${server.serverName}" has an invalid endpoint URL`) }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error(`mcp-settings: "${server.serverName}" endpoint must use http or https`)
  }
  if (endpoint.username.length > 0 || endpoint.password.length > 0) {
    throw new Error(`mcp-settings: "${server.serverName}" endpoint must not include credentials`)
  }
  validateHeaderNames(server.serverName, server.headers)
}

function validateStdioServer(server: StdioMcpServer): void {
  if (server.command.trim().length === 0) throw new Error(`mcp-settings: "${server.serverName}" needs a command`)
  for (const key of Object.keys(server.env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`mcp-settings: "${server.serverName}" has an invalid environment variable name`)
    }
  }
}

function validateHeaderNames(serverName: string, headers: Record<string, string>): void {
  const headerNames = new Set<string>()
  for (const header of Object.keys(headers)) {
    const normalized = header.trim().toLowerCase()
    if (normalized.length === 0) throw new Error(`mcp-settings: "${serverName}" has an empty header name`)
    if (headerNames.has(normalized)) throw new Error(`mcp-settings: "${serverName}" has duplicate header "${header}"`)
    headerNames.add(normalized)
  }
}

/** Turn one managed row into the upstream MCP client's one-server config. */
export function resolveMcpClientConfig(server: McpServer): McpClientConfig {
  if (server.transport === 'stdio') {
    return {
      transport: 'stdio', serverName: server.serverName, command: server.command,
      args: server.args, env: server.env, cwd: server.cwd,
      toolCallTimeoutMs: server.toolCallTimeoutMs, failOnStartupError: server.failOnStartupError,
    }
  }
  return {
    transport: 'streamable-http', serverName: server.serverName, url: server.url, headers: { ...server.headers },
    toolCallTimeoutMs: server.toolCallTimeoutMs, failOnStartupError: server.failOnStartupError,
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpSettings: McpConnectionProbeService
  }
}

/** Host-only diagnostic endpoint. It never returns configured header values. */
export class McpConnectionProbeService extends TypertRemoteService {
  constructor(ctx: Context, private readonly source: () => Config) {
    super(ctx, 'mcpSettings')
  }

  @Remote
  async testConnection(id: string): Promise<McpConnectionTestResult> {
    const started = performance.now()
    const server = this.source().servers.find(candidate => candidate.id === id)
    if (server === undefined) return testFailure(started, 'The MCP service no longer exists.')
    let resolved: McpClientConfig | undefined
    try {
      validateConfig({ servers: [server] })
      resolved = resolveMcpClientConfig(server)
      const client = new Client({ name: 'dsh-mcp-settings-test', version: '0.1.0' }, { capabilities: {} })
      try {
        await withTimeout(client.connect(createProbeTransport(resolved)), CONNECTION_TEST_TIMEOUT_MS)
        const tools = await withTimeout(listTools(client), CONNECTION_TEST_TIMEOUT_MS)
        return { ok: true, durationMs: elapsed(started), toolNames: tools.map(tool => tool.name), tools }
      } finally {
        await client.close().catch(() => {})
      }
    } catch (error) {
      return testFailure(started, safeTestError(error, server, resolved))
    }
  }
}

function createProbeTransport(config: McpClientConfig): Transport {
  if (config.transport === 'stdio') {
    return new StdioClientTransport({
      command: config.command, args: config.args,
      env: { ...scrubbedParentEnv(), ...config.env }, cwd: config.cwd,
    })
  }
  return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } }) as Transport
}

async function listTools(client: Client): Promise<McpDiscoveredTool[]> {
  const tools = new Map<string, McpDiscoveredTool>()
  let cursor: string | undefined
  do {
    const response = await client.request(
      { method: 'tools/list', ...cursor === undefined ? {} : { params: { cursor } } },
      ListToolsResultSchema,
    )
    for (const tool of response.tools) {
      tools.set(tool.name, {
        name: tool.name,
        ...(typeof tool.description === 'string' && tool.description.length > 0 ? { description: tool.description } : {}),
        inputSchema: objectValue(tool.inputSchema),
      })
    }
    cursor = response.nextCursor
  } while (cursor !== undefined)
  return [...tools.values()].sort((left, right) => left.name.localeCompare(right.name))
}

/** MCP input schemas are descriptive metadata; keep only object-shaped values on the browser wire. */
function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timed = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => { reject(new Error(`Connection test timed out after ${timeoutMs} ms.`)) }, timeoutMs)
  })
  return Promise.race([operation, timed]).finally(() => { if (timeout !== undefined) clearTimeout(timeout) })
}

function elapsed(started: number): number { return Math.max(0, Math.round(performance.now() - started)) }
function testFailure(started: number, error: string): McpConnectionTestResult {
  return { ok: false, durationMs: elapsed(started), toolNames: [], tools: [], error }
}

/** Remove configured values from diagnostics before sending them over the browser wire. */
function safeTestError(error: unknown, server: McpServer, resolved?: McpClientConfig): string {
  let message = error instanceof Error ? error.message : String(error)
  const privateValues = server.transport === 'stdio'
    ? [server.command, ...server.args, ...Object.values(server.env)]
    : [server.url, ...Object.values(server.headers), ...(resolved?.transport === 'streamable-http' ? Object.values(resolved.headers) : [])]
  for (const value of privateValues) {
    if (value.length > 0) message = message.replaceAll(value, '***')
  }
  return (message.trim() || 'The MCP server rejected the connection.').slice(0, 500)
}

/** Serialize replacement so settings and credential events cannot overlap connections. */
class McpConnectionManager {
  private fibers: Array<ReturnType<Context['plugin']>> = []
  private tail: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(private readonly ctx: Context, private readonly source: () => Config) {}

  refresh(): void {
    this.tail = this.tail.then(() => this.replace()).catch((error: unknown) => {
      this.ctx.logger.error('mcp-settings: could not apply MCP service changes')
      this.ctx.logger.error(error)
    })
  }

  async dispose(): Promise<void> {
    this.stopped = true
    await this.tail
    await this.stopCurrent()
  }

  private async replace(): Promise<void> {
    if (this.isStopped()) return
    const config = this.source()
    validateConfig(config)
    await this.stopCurrent()
    if (this.stopped) return
    const next: Array<ReturnType<Context['plugin']>> = []
    try {
      for (const server of config.servers) {
        if (!server.enabled) continue
        const fiber = this.ctx.plugin(McpClient, resolveMcpClientConfig(server))
        next.push(fiber)
        await fiber
      }
      this.fibers = next
    } catch (error) {
      await Promise.all(next.map(async (fiber) => { await fiber.dispose() }))
      throw error
    }
  }

  private async stopCurrent(): Promise<void> {
    const current = this.fibers
    this.fibers = []
    await Promise.all(current.map(async (fiber) => { await fiber.dispose() }))
  }

  private isStopped(): boolean { return this.stopped }
}

/** Register settings, live MCP fibers, and the Host-only test endpoint. */
export function apply(ctx: Context, config: Config): void {
  validateConfig(config)
  let source = () => config
  const manager = new McpConnectionManager(ctx, () => source())
  ctx.plugin(McpConnectionProbeService, () => source())
  manager.refresh()

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, MCP_SETTINGS_NAMESPACE, Config, config, {
      validate: validateConfig,
      setSource: (current) => { source = current },
      onChange: () => { manager.refresh() },
    })
  })

  ctx.effect(() => () => manager.dispose(), 'mcp-settings: connection manager')
}
