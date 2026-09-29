import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { refreshStockQueries } from './stockQueries'

describe('refreshStockQueries', () => {
  it('refetches stock queries on screen and drops the rest, leaving others alone', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onScreen = vi.fn().mockResolvedValue({ stock: '10.00' })
    queryClient.setQueryData(['products', { page: 1 }], { stock: '34.00' })
    queryClient.setQueryData(['products', { page: 2 }], { stock: '34.00' })
    queryClient.setQueryData(['inventory', 'movements'], [])
    queryClient.setQueryData(['purchases', 'list'], [])
    // Only page 1 has an observer, as if its list were on screen.
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey: ['products', { page: 1 }],
      queryFn: onScreen,
    }).subscribe(() => undefined)
    onScreen.mockClear()

    await refreshStockQueries(queryClient)

    expect(onScreen).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['products', { page: 1 }])).toEqual({ stock: '10.00' })
    expect(queryClient.getQueryData(['products', { page: 2 }])).toBeUndefined()
    expect(queryClient.getQueryData(['inventory', 'movements'])).toBeUndefined()
    expect(queryClient.getQueryData(['purchases', 'list'])).toEqual([])
    unsubscribe()
  })
})
