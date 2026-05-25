import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IpcChannel, type UpdateInfo } from '@shared/ipc'

const OWNER = 'Phoxxphire2309'
const REPO = 'PhoxxPhire-Proxy'
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`
const CHECK_TIMEOUT_MS = 8000

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

/** Splits a "1.2.3" version into numbers; non-numeric parts become 0. */
function parseVersion(value: string): number[] {
  return value
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

/** True when `latest` is a strictly higher semver than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/**
 * Registers an IPC check that compares the latest published GitHub release to
 * the running version. Unlike electron-updater's auto-install (which needs code
 * signing on macOS), this only reports availability so the renderer can show a
 * "download" banner — it works on every platform, signed or not.
 */
export function initUpdateCheck(fetchFn: typeof fetch): void {
  ipcMain.handle(IpcChannel.UpdateCheck, async (): Promise<UpdateInfo | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    try {
      const response = await fetchFn(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': `PhoxxPhireProxyMaker/${app.getVersion()}`,
            Accept: 'application/vnd.github+json'
          }
        }
      )
      if (!response.ok) return null
      const data = (await response.json()) as { tag_name?: string; html_url?: string }
      const latest = (data.tag_name ?? '').replace(/^v/, '')
      if (!latest || !isNewerVersion(latest, app.getVersion())) return null
      return { version: latest, url: data.html_url ?? RELEASES_PAGE }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })
}
