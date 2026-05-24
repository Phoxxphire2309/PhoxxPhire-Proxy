import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { ProgressPopup } from '@renderer/components/ProgressPopup'

export function UpscaleProgress(): React.JSX.Element | null {
  const job = useUpscaleStore((state) => state.job)
  if (!job) return null
  return <ProgressPopup label="Upscaling…" done={job.done} total={job.total} />
}
