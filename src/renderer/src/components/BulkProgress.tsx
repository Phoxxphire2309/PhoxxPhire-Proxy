import { useDeckStore } from '@renderer/state/deckStore'
import { ProgressPopup } from '@renderer/components/ProgressPopup'

export function BulkProgress(): React.JSX.Element | null {
  const job = useDeckStore((state) => state.bulkJob)
  if (!job) return null
  return <ProgressPopup label="Switching printings…" done={job.done} total={job.total} />
}
