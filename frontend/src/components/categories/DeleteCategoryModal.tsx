import { Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useDeleteCategory } from '@/hooks/useCategories'
import type { Category } from '@/types/catalog'
import { getErrorMessage } from '@/utils/errors'

interface DeleteCategoryModalProps {
  category: Category
  onClose: () => void
}

/** Only categories without products can be deleted; the API explains otherwise (409). */
export function DeleteCategoryModal({ category, onClose }: DeleteCategoryModalProps) {
  const mutation = useDeleteCategory()

  return (
    <Modal title="Eliminar categoría" onClose={onClose}>
      <div className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          ¿Eliminar la categoría <strong>{category.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            onClick={() => mutation.mutate(category.id, { onSuccess: onClose })}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
