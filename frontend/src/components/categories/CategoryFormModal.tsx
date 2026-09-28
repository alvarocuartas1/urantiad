import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreateCategory, useUpdateCategory } from '@/hooks/useCategories'
import type { Category } from '@/types/catalog'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'

/** Mirrors the backend rules in `app/schemas/category.py`. */
const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre.')
    .max(100, 'El nombre no puede superar 100 caracteres.'),
  description: z
    .string()
    .trim()
    .max(255, 'La descripción no puede superar 255 caracteres.')
    .transform((value) => value || null),
  is_active: z.boolean(),
})

type CategoryInput = z.input<typeof categorySchema>
type CategoryValues = z.output<typeof categorySchema>

interface CategoryFormModalProps {
  /** Category to edit; omit to create a new one. */
  category?: Category
  onClose: () => void
}

export function CategoryFormModal({ category, onClose }: CategoryFormModalProps) {
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const mutation = category ? updateMutation : createMutation
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CategoryInput, unknown, CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      is_active: category?.is_active ?? true,
    },
  })

  const onError = (error: Error) => {
    if (isApiErrorCode(error, 'CATEGORY_NAME_TAKEN')) {
      setError('name', { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit(({ is_active, ...values }) => {
    if (category) {
      updateMutation.mutate(
        { id: category.id, data: { ...values, is_active } },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError })
    }
  })

  return (
    <Modal title={category ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !errors.name && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Descripción (opcional)"
          autoComplete="off"
          error={errors.description?.message}
          {...register('description')}
        />
        {category && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300"
              {...register('is_active')}
            />
            Categoría activa
          </label>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
