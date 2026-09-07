/** Browser contribution matching the Host `mcpSettings.testConnection` contract. */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'

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

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface McpSettingsRemoteNamespace {
    testConnection: (id: string) => Promise<RemoteResult<McpConnectionTestResult>>
  }
  interface TypertRemoteNamespaceMap {
    mcpSettings: McpSettingsRemoteNamespace
  }
  interface TypertRemoteMap {
    'mcpSettings/testConnection': (id: string) => Promise<RemoteResult<McpConnectionTestResult>>
  }
}

const idSchema = z.string()
const toolSchema = z.object({
  name: z.string(), description: z.string().optional(), inputSchema: z.record(z.string(), z.unknown()),
})
const resultSchema = z.object({
  ok: z.boolean(), durationMs: z.number(), toolNames: z.array(z.string()), tools: z.array(toolSchema), error: z.string().optional(),
})

export const mcpSettingsRemote: TypertRemoteContribution = {
  package: 'dsh-mcp-settings',
  descriptors: [{
    id: 'dsh-mcp-settings#mcpSettings/testConnection', service: 'mcpSettings', namespace: 'mcpSettings', method: 'testConnection',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-mcp-settings#mcpSettings/testConnection:id', schema: idSchema } }],
    result: { mode: 'strict', typeSymbol: 'dsh-mcp-settings/types#McpConnectionTestResult', schema: resultSchema },
  }],
}
