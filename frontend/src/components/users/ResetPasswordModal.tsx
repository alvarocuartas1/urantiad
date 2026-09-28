import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useResetUserPassword } from '@/hooks/useUsers'
import type { User } from '@/types/user'
import { getErrorMessage } from '@/utils/errors'
import { newPasswordSchema } from '@/utils/validation'

const schema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

type FormValues = z.infer<typeof schema>

export function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const mutation = useResetUserPassword()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(({ password }) => mutation.mutate({ id: user.id, password }))

  return (
    <Modal title="Restablecer contraseña" onClose={onClose}>
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success">
            Contraseña de {user.full_name} restablecida. Sus sesiones abiertas se cerraron.
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-sm text-slate-600">
            Usuario <strong>{user.username}</strong>. Se desbloqueará la cuenta y se cerrarán sus
            sesiones abiertas.
          </p>
          {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres."
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Restablecer
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
