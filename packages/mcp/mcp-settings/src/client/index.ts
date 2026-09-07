import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { McpSettingsCard } from './McpSettingsCard.tsx'
import { McpSettingsCardController } from './controller.ts'
import { en, zh, type McpSettingsLocaleKey } from './locales.ts'

/** Browser locale namespace owned by this package. */
export const SETTINGS_LOCALE_NAMESPACE = 'settings.mcpSettings'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.mcpSettings': McpSettingsLocaleKey
  }
}

/** Required browser services. */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'settingsScope']

/** Register the MCP manager card in Settings → Plugins → Plugin configuration. */
export function apply(ctx: ClientContext): void {
  const controller = new McpSettingsCardController(ctx.settingsScope.bind({ namespace: 'mcp-settings' }), ctx)
  ctx.effect(() => ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, { zh, en }), 'mcp-settings: locale')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'mcp-settings',
    locale: SETTINGS_LOCALE_NAMESPACE,
    inject: () => controller.inject(),
  }, McpSettingsCard))
}
