# dsh-mcp-settings

A DeepSeek Harness bundle that adds an MCP service manager to **Settings → Plugins → Plugin configuration**.

It manages **Streamable HTTP** MCP servers. Every enabled service is mounted as
one `@deepseek-ai/dsh-mcp-client` instance, so the discovered tools retain the
standard `mcp__<serverName>__<toolName>` names. Adding, editing, enabling,
disabling, or removing a service refreshes the live connection; a Harness
restart is not required.

## Install

Install the built bundle into a Web profile:

```sh
dsh plugin --profile web add ./dsh-mcp-settings-0.1.1.tgz
dsh --profile web
```

Then open Settings → Plugins → Plugin configuration → MCP services.

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

## Build from source

This package is built against the matching DeepSeek Harness source tree:

```sh
pnpm --filter dsh-mcp-settings run build
pnpm --filter dsh-mcp-settings pack
```

Use the produced `.tgz` for installation. A prebuilt package avoids requiring
an install-time build permission when installed from Git.
