import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { DownloadedFile } from '@/services/apiClient'
import { saveFile } from '@/utils/download'
import { getErrorMessage } from '@/utils/errors'

/** Downloads the report on screen as CSV (every group, not just the current page). */
export function ExportButton({ onExport }: { onExport: () => Promise<DownloadedFile> }) {
  const exporting = useMutation({ mutationFn: onExport, onSuccess: (file) => saveFile(file) })
  return (
    <>
      <Button variant="secondary" loading={exporting.isPending} onClick={() => exporting.mutate()}>
        {!exporting.isPending && <Download aria-hidden="true" className="size-4" />}
        Exportar CSV
      </Button>
      {exporting.isError && (
        <div className="basis-full">
          <Alert>{getErrorMessage(exporting.error)}</Alert>
        </div>
      )}
    </>
  )
}
