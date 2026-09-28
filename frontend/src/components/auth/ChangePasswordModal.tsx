import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { changeOwnPassword } from '@/services/auth'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { newPasswordSchema } from '@/utils/validation'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Ingrese su contraseña actual.'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      changeOwnPassword(values.currentPassword, values.newPassword),
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values, {
      onError: (error) => {
        if (isApiErrorCode(error, 'INVALID_CURRENT_PASSWORD')) {
          setError('currentPassword', { message: getErrorMessage(error) })
        }
      },
    }),
  )

  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose}>
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success">
            Contraseña actualizada. Las sesiones abiertas en otros equipos se cerraron.
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {mutation.isError && !errors.currentPassword && (
            <Alert>{getErrorMessage(mutation.error)}</Alert>
          )}
          <TextField
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres."
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            label="Confirmar nueva contraseña"
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
              Guardar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
