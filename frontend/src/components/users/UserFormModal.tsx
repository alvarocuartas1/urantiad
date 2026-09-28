import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { SelectField, TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useCreateUser, useRoles, useUpdateUser } from '@/hooks/useUsers'
import type { User } from '@/types/user'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { fullNameSchema, newPasswordSchema, usernameSchema } from '@/utils/validation'

const roleIdSchema = z.coerce.number<string>().int().positive('Seleccione un rol.')

const createSchema = z.object({
  username: usernameSchema,
  full_name: fullNameSchema,
  password: newPasswordSchema,
  role_id: roleIdSchema,
})

const editSchema = z.object({
  full_name: fullNameSchema,
  role_id: roleIdSchema,
  is_active: z.boolean(),
})

type CreateInput = z.input<typeof createSchema>
type CreateValues = z.output<typeof createSchema>
type EditInput = z.input<typeof editSchema>
type EditValues = z.output<typeof editSchema>

function RoleOptions() {
  const { data: roles = [] } = useRoles()
  return (
    <>
      <option value="">Seleccione…</option>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </>
  )
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const mutation = useCreateUser()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateInput, unknown, CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: '', full_name: '', password: '', role_id: '' },
  })

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values, {
      onSuccess: onClose,
      onError: (error) => {
        if (isApiErrorCode(error, 'USERNAME_TAKEN')) {
          setError('username', { message: getErrorMessage(error) })
        }
      },
    }),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mutation.isError && !errors.username && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      <TextField
        label="Usuario"
        autoCapitalize="none"
        autoComplete="off"
        hint="Minúsculas, números, punto, guion o guion bajo."
        error={errors.username?.message}
        {...register('username')}
      />
      <TextField
        label="Nombre completo"
        autoComplete="off"
        error={errors.full_name?.message}
        {...register('full_name')}
      />
      <TextField
        label="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres."
        error={errors.password?.message}
        {...register('password')}
      />
      <SelectField label="Rol" error={errors.role_id?.message} {...register('role_id')}>
        <RoleOptions />
      </SelectField>
      <FormActions onClose={onClose} loading={mutation.isPending} />
    </form>
  )
}

function EditUserForm({ user, onClose }: { user: User; onClose: () => void }) {
  const { user: currentUser } = useAuth()
  const isSelf = currentUser?.id === user.id
  const mutation = useUpdateUser()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditInput, unknown, EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      full_name: user.full_name,
      role_id: String(user.role.id),
      is_active: user.is_active,
    },
  })

  const onSubmit = handleSubmit((values) => {
    // Users cannot change their own role or status, so only the name is sent.
    const data = isSelf ? { full_name: values.full_name } : values
    mutation.mutate({ id: user.id, data }, { onSuccess: onClose })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      <TextField label="Usuario" value={user.username} disabled readOnly />
      <TextField
        label="Nombre completo"
        autoComplete="off"
        error={errors.full_name?.message}
        {...register('full_name')}
      />
      {isSelf ? (
        <>
          <TextField label="Rol" value={user.role.name} disabled readOnly />
          <p className="text-xs text-slate-500">No puede cambiar su propio rol ni desactivarse.</p>
        </>
      ) : (
        <>
          <SelectField label="Rol" error={errors.role_id?.message} {...register('role_id')}>
            <RoleOptions />
          </SelectField>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300"
              {...register('is_active')}
            />
            Usuario activo
          </label>
        </>
      )}
      <FormActions onClose={onClose} loading={mutation.isPending} />
    </form>
  )
}

interface UserFormModalProps {
  /** User to edit; omit to create a new one. */
  user?: User
  onClose: () => void
}

export function UserFormModal({ user, onClose }: UserFormModalProps) {
  return (
    <Modal title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      {user ? <EditUserForm user={user} onClose={onClose} /> : <CreateUserForm onClose={onClose} />}
    </Modal>
  )
}
