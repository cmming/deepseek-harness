# dsh-mcp-settings

A DeepSeek Harness bundle that adds an MCP service manager to **Settings → Plugins → Plugin configuration**.

It manages **Streamable HTTP** and **stdio** MCP servers. Every enabled service is mounted as
one `@deepseek-ai/dsh-mcp-client` instance, so the discovered tools retain the
standard `mcp__<serverName>__<toolName>` names. Adding, editing, enabling,
disabling, or removing a service refreshes the live connection; a Harness
restart is not required.

## Install

Install the built bundle into a Web profile:

```sh
dsh plugin --profile web add ./dsh-mcp-settings-0.1.9.tgz
dsh --profile web
```

Then open Settings → Plugins → Plugin configuration → MCP services.

## Settings page fields

The service card exposes every field implemented by this package:

| Field | Behavior |
| --- | --- |
| Service id | Generated when a service is added and shown read-only, so its credential association remains stable. |
| Transport | Select Streamable HTTP or stdio. The card reveals only the fields relevant to the selection. |
| HTTP endpoint | Required HTTP(S) endpoint. URLs containing credentials are rejected. |
| stdio command | Command, one argument per line, working directory, and additional environment variables. Arguments are passed directly without shell expansion. |
| Custom request headers | Editable key/value headers, including `Authorization`. For example, add `Authorization` with value `Bearer <token>`. |
| Tool call timeout | Positive integer in milliseconds; defaults to 60000. |
| Startup failure policy | Select whether a failed first connection should fail the service instance. |
| Enabled state | Disabled services are not connected and do not contribute tools. |
| Test connection | Uses the saved Host-side configuration to make a temporary connection. On success, it shows a collapsible, tool-style list from paginated `tools/list`: count, name, description, and declared input fields/types. Header and stdio environment values are never returned in the diagnostic message. |

## Add the CM Agent endpoint

Create a service with:

| Field | Value |
| --- | --- |
| Tool namespace | `cmagent` |
| Streamable HTTP endpoint | `http://localhost:8080/mcp` |
| Custom request header | Name: `Authorization`; value: `Bearer <your CM Agent token>` |

All request headers, including `Authorization`, are stored directly in the
MCP service settings. Limit write access to this settings document accordingly.

## Deployment configuration

The UI is optional. A deployment can seed connections through its own patch:

```yaml
- insert:
    - id: mcp-settings
      name: dsh-mcp-settings
      config:
        servers:
          - id: cmagent
            enabled: true
            serverName: cmagent
            transport: streamable-http
            url: http://localhost:8080/mcp
            headers:
              Authorization: "Bearer <your CM Agent token>"
            toolCallTimeoutMs: 60000
            failOnStartupError: false
```

Header values are persisted in the service settings. The complete Authorization
value must include its scheme, for example `Bearer …`.

For a local stdio server, use this shape instead:

```yaml
          - id: local-files
            enabled: true
            serverName: files
            transport: stdio
            command: npx
            args: [--yes, "@modelcontextprotocol/server-filesystem", "C:\\workspace"]
            env: {}
            cwd: ""
            toolCallTimeoutMs: 60000
            failOnStartupError: false
```

Run **Save services** before **Test connection** so the Host tests the current
service settings and request headers.

## Build from source

This package is built against the matching DeepSeek Harness source tree:

```sh
pnpm --filter dsh-mcp-settings run build
pnpm --filter dsh-mcp-settings pack
```

Use the produced `.tgz` for installation. A prebuilt package avoids requiring
an install-time build permission when installed from Git.
