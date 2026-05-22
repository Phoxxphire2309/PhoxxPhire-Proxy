import { autoUpdater } from 'electron-updater'

/**
 * Checks for updates in packaged builds. This is inert until releases are
 * published to the configured provider (see `publish` in electron-builder.yml)
 * and the app is code-signed; in development it does nothing.
 */
export function initAutoUpdate(isDev: boolean): void {
  if (isDev) return
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Offline, or no published release yet — safe to ignore.
  })
}
