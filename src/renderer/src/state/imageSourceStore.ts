import { useCallback } from 'react'
import { create } from 'zustand'
import { faceImageUrl, type ImageQuality } from '@shared/scryfall'
import { mpcfillFaceKey, mpcfillImageUrl, type MpcfillSelection } from '@shared/mpcfill'

interface ImageSourceState {
  /**
   * Chosen MPCFill image per card face, keyed by `mpcfillFaceKey`. The pick *is*
   * the per-card source: a face with a pick renders from MPCFill, a face without
   * one falls back to its Scryfall scan. So a deck can freely mix both sources.
   */
  selections: Record<string, MpcfillSelection>
  /** Switch one card face to a chosen MPCFill image. */
  selectMpcfill: (cardId: string, faceIndex: number, selection: MpcfillSelection) => void
  /** Switch one card face back to its Scryfall scan. */
  clearMpcfill: (cardId: string, faceIndex: number) => void
  /** Switch every card back to Scryfall. */
  clearAll: () => void
  restore: (selections: Record<string, MpcfillSelection>) => void
}

export const useImageSourceStore = create<ImageSourceState>((set) => ({
  selections: {},
  selectMpcfill: (cardId, faceIndex, selection) =>
    set((state) => ({
      selections: { ...state.selections, [mpcfillFaceKey(cardId, faceIndex)]: selection }
    })),
  clearMpcfill: (cardId, faceIndex) =>
    set((state) => {
      const next = { ...state.selections }
      delete next[mpcfillFaceKey(cardId, faceIndex)]
      return { selections: next }
    }),
  clearAll: () => set({ selections: {} }),
  restore: (selections) => set({ selections })
}))

/** The chosen MPCFill image for a face, or undefined when it uses Scryfall. */
export function useMpcfillSelection(
  cardId: string,
  faceIndex: number
): MpcfillSelection | undefined {
  return useImageSourceStore((state) => state.selections[mpcfillFaceKey(cardId, faceIndex)])
}

type FaceImageResolver = (
  cardId: string,
  faceIndex: number,
  quality?: ImageQuality,
  version?: number | string
) => string

/**
 * Returns a resolver for a card face's image URL based on its per-card source:
 * a face with a chosen MPCFill image points at that Google Drive file; otherwise
 * it falls back to the Scryfall card image. Subscribing to the store means render
 * sites re-render when a card's pick changes.
 */
export function useFaceImageResolver(): FaceImageResolver {
  const selections = useImageSourceStore((state) => state.selections)
  return useCallback<FaceImageResolver>(
    (cardId, faceIndex, quality = 'upscaled', version) => {
      const selection = selections[mpcfillFaceKey(cardId, faceIndex)]
      if (selection) return mpcfillImageUrl(selection.identifier, quality, version)
      return faceImageUrl(cardId, faceIndex, quality, version)
    },
    [selections]
  )
}
