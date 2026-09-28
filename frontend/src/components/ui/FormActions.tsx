import { Button } from './Button'

interface FormActionsProps {
  onClose: () => void
  loading: boolean
  submitLabel?: string
}

/** Cancel / submit buttons at the bottom of a modal form. */
export function FormActions({ onClose, loading, submitLabel = 'Guardar' }: FormActionsProps) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" loading={loading}>
        {submitLabel}
      </Button>
    </div>
  )
}
