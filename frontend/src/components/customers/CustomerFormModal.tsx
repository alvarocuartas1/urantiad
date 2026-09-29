import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { SelectField, TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useCustomers'
import type { Customer } from '@/types/customer'
import type { DocumentType } from '@/types/document'
import { labelEntries } from '@/utils/catalog'
import { DOCUMENT_TYPE_LABELS } from '@/utils/document'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import {
  documentNumberSchema,
  documentTypeSchema,
  emailSchema,
  optionalTextSchema,
  phoneSchema,
} from '@/utils/validation'

/** Mirrors the backend rules in `app/schemas/customer.py` and `app/schemas/contact.py`. */
const customerSchema = z.object({
  document_type: documentTypeSchema,
  document_number: documentNumberSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre del cliente.')
    .max(150, 'El nombre no puede superar 150 caracteres.'),
  phone: phoneSchema,
  email: emailSchema,
  address: optionalTextSchema(255, 'La dirección'),
  is_active: z.boolean(),
})

type CustomerInput = z.input<typeof customerSchema>
type CustomerValues = z.output<typeof customerSchema>

interface CustomerFormModalProps {
  /** Customer to edit; omit to create a new one. */
  customer?: Customer
  onClose: () => void
}

export function CustomerFormModal({ customer, onClose }: CustomerFormModalProps) {
  const createMutation = useCreateCustomer()
  const updateMutation = useUpdateCustomer()
  const mutation = customer ? updateMutation : createMutation
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CustomerInput, unknown, CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      document_type: customer?.document_type ?? 'cc',
      document_number: customer?.document_number ?? '',
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      address: customer?.address ?? '',
      is_active: customer?.is_active ?? true,
    },
  })

  const onError = (error: Error) => {
    if (isApiErrorCode(error, 'CUSTOMER_DOCUMENT_TAKEN')) {
      setError('document_number', { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit(({ is_active, ...values }) => {
    if (customer) {
      updateMutation.mutate(
        { id: customer.id, data: { ...values, is_active } },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError })
    }
  })

  return (
    <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose} size="lg">
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
            autoFocus
            error={errors.document_number?.message}
            {...register('document_number')}
          />
          <div className="sm:col-span-2">
            <TextField
              label="Nombre"
              autoComplete="off"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
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
          <div className="sm:col-span-2">
            <TextField
              label="Dirección (opcional)"
              autoComplete="off"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>
        </div>
        {customer && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300"
              {...register('is_active')}
            />
            Cliente activo
          </label>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
