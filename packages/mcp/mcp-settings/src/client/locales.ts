/** Copy owned by the MCP settings card. */
export type McpSettingsLocaleKey =
  | 'title' | 'description' | 'add' | 'empty' | 'serviceName' | 'namespace'
  | 'endpoint' | 'authorization' | 'authorizationHint' | 'authorizationSet'
  | 'authorizationUnset' | 'enabled' | 'remove' | 'save' | 'saving'
  | 'saved' | 'readOnly' | 'invalid' | 'connectionHint'

export const en: Record<McpSettingsLocaleKey, string> = {
  title: 'MCP services',
  description: 'Manage Streamable HTTP MCP connections and their model-facing tool namespaces.',
  add: 'Add MCP service',
  empty: 'No MCP services are configured.',
  serviceName: 'Tool namespace',
  namespace: 'Use letters, numbers, hyphens, or underscores. Tools become mcp__<namespace>__<tool>.',
  endpoint: 'Streamable HTTP endpoint',
  authorization: 'Authorization header',
  authorizationHint: 'Write-only. Enter the complete value, for example “Bearer …”. Leave blank to keep the current value.',
  authorizationSet: 'Authorization is configured',
  authorizationUnset: 'No Authorization value is configured',
  enabled: 'Enable this service',
  remove: 'Remove',
  save: 'Save services',
  saving: 'Saving…',
  saved: 'Saved. The matching MCP connections are being refreshed.',
  readOnly: 'This deployment stores settings read-only.',
  invalid: 'Each service needs a unique namespace and a valid http(s) endpoint.',
  connectionHint: 'Saving reconnects enabled services and re-discovers their tools. Connection failures remain visible in the Harness log.',
}

export const zh: Record<McpSettingsLocaleKey, string> = {
  title: 'MCP 服务',
  description: '管理 Streamable HTTP MCP 连接及其面向模型的工具命名空间。',
  add: '添加 MCP 服务',
  empty: '尚未配置 MCP 服务。',
  serviceName: '工具命名空间',
  namespace: '仅可使用字母、数字、连字符或下划线。工具名为 mcp__<命名空间>__<工具名>。',
  endpoint: 'Streamable HTTP 地址',
  authorization: 'Authorization 请求头',
  authorizationHint: '只写入凭据存储。请输入完整值，例如“Bearer …”；留空表示保留当前值。',
  authorizationSet: '已配置 Authorization',
  authorizationUnset: '尚未配置 Authorization',
  enabled: '启用此服务',
  remove: '删除',
  save: '保存服务',
  saving: '保存中…',
  saved: '已保存，正在刷新对应 MCP 连接和工具列表。',
  readOnly: '当前部署的设置为只读。',
  invalid: '每项服务都需要唯一的命名空间，以及有效的 http(s) 地址。',
  connectionHint: '保存后会重连已启用服务并重新发现工具；连接失败会记录在 Harness 日志中。',
}
