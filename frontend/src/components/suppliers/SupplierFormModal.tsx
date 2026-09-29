import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { SelectField, TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers'
import type { DocumentType, Supplier } from '@/types/supplier'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { DOCUMENT_TYPE_LABELS } from '@/utils/supplier'

/** Optional text: an empty value is sent as `null`. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .transform((value) => value || null)
}

/** Mirrors the backend rules in `app/schemas/supplier.py`. */
const supplierSchema = z.object({
  document_type: z.enum(['nit', 'cc', 'ce', 'passport', 'other']),
  // Stored without dots or spaces, as the backend does: "900.123.456-7" → "900123456-7".
  document_number: z
    .string()
    .transform((value) => value.replace(/[.\s]/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .min(1, 'Ingrese el número de documento.')
        .max(30, 'El documento no puede superar 30 caracteres.')
        .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Use solo letras, números y guion.'),
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre o razón social.')
    .max(150, 'El nombre no puede superar 150 caracteres.'),
  contact_name: optionalText(100, 'El contacto'),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono no puede superar 30 caracteres.')
    .regex(/^[0-9+() -]*$/, 'Use solo números, espacios y los signos + - ( ).')
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255, 'El correo no puede superar 255 caracteres.')
    .refine((value) => !value || z.email().safeParse(value).success, 'Ingrese un correo válido.')
    .transform((value) => value || null),
  address: optionalText(255, 'La dirección'),
  city: optionalText(100, 'La ciudad'),
  notes: optionalText(500, 'Las observaciones'),
  is_active: z.boolean(),
})

type SupplierInput = z.input<typeof supplierSchema>
type SupplierValues = z.output<typeof supplierSchema>

interface SupplierFormModalProps {
  /** Supplier to edit; omit to create a new one. */
  supplier?: Supplier
  onClose: () => void
}

export function SupplierFormModal({ supplier, onClose }: SupplierFormModalProps) {
  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()
  const mutation = supplier ? updateMutation : createMutation
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SupplierInput, unknown, SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      document_type: supplier?.document_type ?? 'nit',
      document_number: supplier?.document_number ?? '',
      name: supplier?.name ?? '',
      contact_name: supplier?.contact_name ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      city: supplier?.city ?? '',
      notes: supplier?.notes ?? '',
      is_active: supplier?.is_active ?? true,
    },
  })

  const onError = (error: Error) => {
    if (isApiErrorCode(error, 'SUPPLIER_DOCUMENT_TAKEN')) {
      setError('document_number', { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit(({ is_active, ...values }) => {
    if (supplier) {
      updateMutation.mutate(
        { id: supplier.id, data: { ...values, is_active } },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError })
    }
  })

  return (
    <Modal title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !errors.document_number && (
          <Alert>{getErrorMessage(mutation.error)}</Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Tipo de documento"
            error={errors.document_type?.message}
            {...register('document_type')}
          >
            {labelEntries<DocumentType>(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Número de documento"
            autoComplete="off"
            hint="Con dígito de verificación si es NIT (900123456-7)."
            error={errors.document_number?.message}
            {...register('document_number')}
          />
          <div className="sm:col-span-2">
            <TextField
              label="Nombre o razón social"
              autoComplete="off"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
          <TextField
            label="Persona de contacto (opcional)"
            autoComplete="off"
            error={errors.contact_name?.message}
            {...register('contact_name')}
          />
          <TextField
            label="Teléfono (opcional)"
            type="tel"
            autoComplete="off"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Correo (opcional)"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Ciudad (opcional)"
            autoComplete="off"
            error={errors.city?.message}
            {...register('city')}
          />
          <div className="sm:col-span-2">
            <TextField
              label="Dirección (opcional)"
              autoComplete="off"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>
          <div className="sm:col-span-2">
            <TextField
              label="Observaciones (opcional)"
              autoComplete="off"
              error={errors.notes?.message}
              {...register('notes')}
            />
          </div>
        </div>
        {supplier && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300"
              {...register('is_active')}
            />
            Proveedor activo
          </label>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
