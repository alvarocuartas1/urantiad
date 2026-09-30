import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, listRoles, listUsers, resetUserPassword, updateUser } from '@/services/users'
import type { UserCreate, UserListParams, UserUpdate } from '@/types/user'

const usersKey = ['users'] as const

export function useUsers(params: UserListParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...usersKey, params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: listRoles, staleTime: Infinity })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UserCreate) => createUser(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserUpdate }) => updateUser(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetUserPassword(id, password),
  })
}
