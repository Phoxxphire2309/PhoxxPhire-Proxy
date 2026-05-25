import { create } from 'zustand'

interface TextProxyState {
  /** Card ids set to print as a rendered text proxy instead of a scan. */
  proxies: Record<string, true>
  toggle: (cardId: string) => void
  isProxy: (cardId: string) => boolean
}

/** Tracks which cards print as text proxies (oracle data, no scan). */
export const useTextProxyStore = create<TextProxyState>((set, get) => ({
  proxies: {},
  toggle: (cardId) =>
    set((state) => {
      const proxies = { ...state.proxies }
      if (proxies[cardId]) delete proxies[cardId]
      else proxies[cardId] = true
      return { proxies }
    }),
  isProxy: (cardId) => get().proxies[cardId] === true
}))
