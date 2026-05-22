/// <reference types="vite/client" />

import type { PhoxxApi } from '@shared/ipc'

declare global {
  interface Window {
    phoxx: PhoxxApi
  }
}
