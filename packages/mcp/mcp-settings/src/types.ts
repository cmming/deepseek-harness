/** Browser-safe details discovered from one MCP `tools/list` item. */
export interface McpDiscoveredTool {
  name: string
  description?: string
  /** The tool's declared JSON Schema input object, without runtime values. */
  inputSchema: Record<string, unknown>
}

/** Browser-safe result of a Host-side temporary connection and `tools/list` discovery. */
export interface McpConnectionTestResult {
  ok: boolean
  durationMs: number
  toolNames: string[]
  tools: McpDiscoveredTool[]
  error?: string
}
