import { create } from 'zustand'

export interface ConfirmOption {
  /** Value returned by `confirm()` when this option is chosen. */
  id: string
  label: string
  /** Highlights the option as the recommended/primary action. */
  primary?: boolean
}

export interface ConfirmRequest {
  title: string
  message?: string
  options: ConfirmOption[]
}

interface ConfirmState {
  request: ConfirmRequest | null
  resolve: ((id: string | null) => void) | null
  /** Opens a modal and resolves with the chosen option id, or null if dismissed. */
  confirm: (request: ConfirmRequest) => Promise<string | null>
  /** Answers the open request (null = dismissed). */
  respond: (id: string | null) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolve: null,
  confirm: (request) =>
    new Promise<string | null>((resolve) => {
      // Reject any in-flight prompt before showing the new one.
      get().resolve?.(null)
      set({ request, resolve })
    }),
  respond: (id) => {
    get().resolve?.(id)
    set({ request: null, resolve: null })
  }
}))

/** Convenience wrapper to prompt and await a choice from anywhere. */
export function confirm(request: ConfirmRequest): Promise<string | null> {
  return useConfirmStore.getState().confirm(request)
}
