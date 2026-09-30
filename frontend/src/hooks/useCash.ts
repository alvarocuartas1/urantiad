import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  closeCashSession,
  createCashMovement,
  createCashRegister,
  getCashSession,
  getCashSessionSalesSummary,
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
  CashSessionClose,
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

export function useCashRegisters(params: CashRegisterListParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...registersKey, params],
    queryFn: () => listCashRegisters(params),
    placeholderData: keepPreviousData,
    enabled,
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

export function useCashSession(id: number, initialSession?: CashSession) {
  return useQuery({
    queryKey: [...cashKey, 'session', id],
    queryFn: () => getCashSession(id),
    placeholderData: initialSession,
  })
}

export function useCashSessionSalesSummary(sessionId: number) {
  return useQuery({
    queryKey: [...cashKey, 'sales-summary', sessionId],
    queryFn: () => getCashSessionSalesSummary(sessionId),
  })
}

/** Reload the user's open session: e.g. a sale found it closed in another tab. */
export function refreshCurrentCashSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: currentSessionKey })
}

/** A supervisor may close another user's session, so the current one is cleared only when it
 * is the closed session. If the expected cash changed meanwhile, every cash query reloads to
 * show the new figures. */
export function useCloseCashSession(sessionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CashSessionClose) => closeCashSession(sessionId, data),
    onSuccess: (session) => {
      if (queryClient.getQueryData<CashSession | null>(currentSessionKey)?.id === session.id) {
        queryClient.setQueryData(currentSessionKey, null)
      }
      queryClient.setQueryData([...cashKey, 'session', session.id], session)
      return queryClient.invalidateQueries({
        queryKey: cashKey,
        predicate: (query) =>
          query.queryKey[1] !== currentSessionKey[1] && query.queryKey[1] !== 'session',
      })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: cashKey }),
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
