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
dsh plugin --profile web add ./dsh-mcp-settings-0.1.8.tgz
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
| Authorization and credential reference | Authorization is write-only. The credential reference can be selected or changed, and a stored value can be cleared without being revealed. |
| Custom request headers | Editable key/value headers. `Authorization` is rejected so secrets remain in the credentials provider. |
| Tool call timeout | Positive integer in milliseconds; defaults to 60000. |
| Startup failure policy | Select whether a failed first connection should fail the service instance. |
| Enabled state | Disabled services are not connected and do not contribute tools. |
| Test connection | Uses the saved Host-side configuration and stored credentials to make a temporary connection. On success, it shows a collapsible, tool-style list from paginated `tools/list`: count, name, description, and declared input fields/types. Values configured as credentials, headers, or stdio environment values are never returned in the diagnostic message. |

## Add the CM Agent endpoint

Create a service with:

| Field | Value |
| --- | --- |
| Tool namespace | `cmagent` |
| Streamable HTTP endpoint | `http://localhost:8080/mcp` |
| Authorization header | `Bearer <your CM Agent token>` |

The authorization value is write-only in the UI. It is stored through the
Harness credentials provider (normally `$DSH_HOME/.credentials.yaml`), while
the settings document stores only a reference such as
`DSH_MCP_<service-id>_AUTHORIZATION`. It is never written to this package,
`cordis.patch.yml`, or the browser settings response.

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
            authorizationRef: CM_AGENT_MCP_AUTHORIZATION
            headers: {}
            toolCallTimeoutMs: 60000
            failOnStartupError: false
```

Supply the value for `CM_AGENT_MCP_AUTHORIZATION` through the Harness
credentials provider. The complete header value must include its scheme, for
example `Bearer …`.

Only non-sensitive headers belong in `headers`. The plugin rejects an
`Authorization` entry there so access tokens cannot accidentally enter the
settings document.

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

Run **Save services** before **Test connection**. This ensures a new write-only
Authorization value is stored by the credential provider before the Host starts
the temporary test connection.

## Build from source

This package is built against the matching DeepSeek Harness source tree:

```sh
pnpm --filter dsh-mcp-settings run build
pnpm --filter dsh-mcp-settings pack
```

Use the produced `.tgz` for installation. A prebuilt package avoids requiring
an install-time build permission when installed from Git.
