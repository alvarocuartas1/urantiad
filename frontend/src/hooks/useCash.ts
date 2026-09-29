import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  createCashMovement,
  createCashRegister,
  getCurrentCashSession,
  listCashMovements,
  listCashRegisters,
  listCashSessions,
  openCashSession,
  updateCashRegister,
} from '@/services/cash'
import type {
  CashMovementCreate,
  CashRegisterCreate,
  CashRegisterListParams,
  CashRegisterUpdate,
  CashSession,
  CashSessionListParams,
  CashSessionOpen,
} from '@/types/cash'
import { isApiErrorCode } from '@/utils/errors'

// Registers show who has them open, so opening a session refreshes them too.
const cashKey = ['cash'] as const
const registersKey = [...cashKey, 'registers'] as const
const currentSessionKey = [...cashKey, 'current-session'] as const

/** Store the session returned by a mutation and refresh the other cash queries (registers,
 * history, movements) without refetching the session itself. */
function applySessionChange(queryClient: QueryClient, session: CashSession) {
  queryClient.setQueryData(currentSessionKey, session)
  return queryClient.invalidateQueries({
    queryKey: cashKey,
    predicate: (query) => query.queryKey[1] !== currentSessionKey[1],
  })
}

export function useCashRegisters(params: CashRegisterListParams) {
  return useQuery({
    queryKey: [...registersKey, params],
    queryFn: () => listCashRegisters(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateCashRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CashRegisterCreate) => createCashRegister(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registersKey }),
  })
}

export function useUpdateCashRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CashRegisterUpdate }) =>
      updateCashRegister(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registersKey }),
  })
}

export function useCurrentCashSession() {
  return useQuery({ queryKey: currentSessionKey, queryFn: getCurrentCashSession })
}

export function useOpenCashSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CashSessionOpen) => openCashSession(data),
    onSuccess: (session) => applySessionChange(queryClient, session),
    onError: (error) => {
      // Opened meanwhile (e.g. in another tab): reloading shows that session instead.
      if (isApiErrorCode(error, 'USER_HAS_OPEN_SESSION')) {
        return queryClient.invalidateQueries({ queryKey: currentSessionKey })
      }
      // The register was taken or deactivated: refresh the list to show it.
      return queryClient.invalidateQueries({ queryKey: registersKey })
    },
  })
}

export function useCashSessions(params: CashSessionListParams) {
  return useQuery({
    queryKey: [...cashKey, 'sessions', params],
    queryFn: () => listCashSessions(params),
    placeholderData: keepPreviousData,
  })
}

export function useCashMovements(sessionId: number, params: { page: number; size: number }) {
  return useQuery({
    queryKey: [...cashKey, 'movements', sessionId, params],
    queryFn: () => listCashMovements(sessionId, params),
    placeholderData: keepPreviousData,
  })
}

/** The response carries the updated session, so its summary is shown without refetching. */
export function useCreateCashMovement(sessionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CashMovementCreate) => createCashMovement(sessionId, data),
    onSuccess: ({ session }) => applySessionChange(queryClient, session),
  })
}
