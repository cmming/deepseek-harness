/** Hand-authored Host manifest for the one diagnostic Remote endpoint. */
import { z } from 'zod'

const idSchema = z.string()
const toolSchema = z.object({
  name: z.string(), description: z.string().optional(), inputSchema: z.record(z.string(), z.unknown()),
})
const resultSchema = z.object({
  ok: z.boolean(), durationMs: z.number(), toolNames: z.array(z.string()), tools: z.array(toolSchema), error: z.string().optional(),
})

/** Loader-readable strict contract for `mcpSettings.testConnection`. */
export const TYPERT = {
  package: 'dsh-mcp-settings',
  face: 'host',
  schemas: [],
  invocations: [{
    id: 'dsh-mcp-settings#mcpSettings/testConnection',
    service: 'mcpSettings', namespace: 'mcpSettings', method: 'testConnection',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'id', wire: 'id', source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-mcp-settings#mcpSettings/testConnection:id', schema: idSchema },
    }],
    result: {
      mode: 'strict', typeSymbol: 'dsh-mcp-settings/types#McpConnectionTestResult', schema: resultSchema,
    },
    sourceLocation: { file: 'packages/mcp/mcp-settings/src/index.ts', line: 182, column: 9 },
  }],
  model: {
    services: [{
      description: 'Host-only diagnostic endpoint. It never returns configured header values.',
      summary: 'Host-only diagnostic endpoint.', tags: [],
      jsDoc: '/** Host-only diagnostic endpoint. It never returns configured header values. */',
      key: 'mcpSettings', exportName: 'McpConnectionProbeService',
      members: [{ kind: 'method', name: 'testConnection', signature: '@Remote async testConnection(id: string): Promise<McpConnectionTestResult>' }],
      types: [{ name: 'McpConnectionTestResult', declaration: 'export interface McpConnectionTestResult { ok: boolean; durationMs: number; toolNames: string[]; tools: McpDiscoveredTool[]; error?: string; }' }],
    }],
    events: [], objects: [],
  },
}
