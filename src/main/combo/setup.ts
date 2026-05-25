import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { ComboCardInput, ComboResult, DeckCombo } from '@shared/combo'

const FIND_MY_COMBOS_URL = 'https://backend.commanderspellbook.com/find-my-combos'
const TIMEOUT_MS = 15_000

/** A loose shape of the Commander Spellbook `find-my-combos` response we read. */
interface ApiCombo {
  id?: number | string
  description?: string
  uses?: { card?: { name?: string } }[]
  produces?: { feature?: { name?: string } }[]
}

function normalizeCombos(list: unknown): DeckCombo[] {
  if (!Array.isArray(list)) return []
  return list.map((raw: ApiCombo, index) => ({
    id: String(raw.id ?? index),
    uses: (raw.uses ?? []).map((u) => u.card?.name).filter((n): n is string => !!n),
    produces: (raw.produces ?? []).map((p) => p.feature?.name).filter((n): n is string => !!n),
    ...(raw.description ? { description: raw.description } : {})
  }))
}

/**
 * Wires the combo-finder IPC. Uses Electron's network stack (`net.fetch`) so the
 * request isn't subject to the renderer's CSP. Call after `app.whenReady()`.
 */
export function initCombos(fetchFn: typeof fetch): void {
  ipcMain.handle(
    IpcChannel.CombosFind,
    async (_event, cards: ComboCardInput[]): Promise<ComboResult> => {
      const body = {
        commanders: cards
          .filter((card) => card.commander)
          .map((card) => ({ card: card.name, quantity: card.quantity })),
        main: cards
          .filter((card) => !card.commander)
          .map((card) => ({ card: card.name, quantity: card.quantity }))
      }
      if (body.commanders.length === 0 && body.main.length === 0) {
        return { ok: true, combos: [] }
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const response = await fetchFn(FIND_MY_COMBOS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        })
        if (!response.ok) {
          return { ok: false, error: `Commander Spellbook returned HTTP ${response.status}` }
        }
        const data = (await response.json()) as { results?: { included?: unknown } }
        return { ok: true, combos: normalizeCombos(data.results?.included) }
      } catch (error) {
        const aborted = controller.signal.aborted
        return {
          ok: false,
          error: aborted
            ? 'Commander Spellbook didn’t respond in time — check your connection.'
            : error instanceof Error
              ? error.message
              : 'Could not reach Commander Spellbook.'
        }
      } finally {
        clearTimeout(timer)
      }
    }
  )
}
