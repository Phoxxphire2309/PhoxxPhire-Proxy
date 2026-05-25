import { useEffect, useState } from 'react'
import type { UpdateInfo } from '@shared/ipc'

// Remember the version a user dismissed so we don't nag for the same release.
const DISMISS_KEY = 'phoxx.dismissedUpdate'

/**
 * A slim, dismissible "new version available" bar. Checks GitHub Releases on
 * launch (via the main process) and links to the download — works on every
 * platform regardless of code signing, unlike auto-install updates.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    let active = true
    void window.phoxx.checkForUpdate().then((result) => {
      if (!active || !result) return
      if (localStorage.getItem(DISMISS_KEY) === result.version) return
      setInfo(result)
    })
    return () => {
      active = false
    }
  }, [])

  if (!info) return null

  const dismiss = (): void => {
    localStorage.setItem(DISMISS_KEY, info.version)
    setInfo(null)
  }

  return (
    <div className="updatebar" role="status">
      <span className="updatebar__text">Version {info.version} is available</span>
      <a className="updatebar__link" href={info.url} target="_blank" rel="noreferrer">
        Download
      </a>
      <button className="updatebar__close" type="button" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
