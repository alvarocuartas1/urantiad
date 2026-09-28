import {
  ApiError,
  apiRequest,
  refreshSession,
  setAccessToken,
  setSessionListener,
} from './apiClient'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const session = {
  access_token: 'new-token',
  token_type: 'bearer',
  expires_in: 900,
  user: { id: 1, username: 'admin', full_name: 'Admin', role: {}, permissions: [] },
}
const unauthorized = { detail: 'Sesión inválida.', code: 'TOKEN_INVALID' }

function authHeader(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit
  return (init.headers as Record<string, string>).Authorization
}

describe('apiClient', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const listener = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    listener.mockReset()
    setAccessToken('old-token')
    setSessionListener(listener)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setSessionListener(null)
  })

  it('refreshes the session once and retries the request after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, unauthorized))
      .mockResolvedValueOnce(jsonResponse(200, session))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    const result = await apiRequest<{ ok: boolean }>('/users')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/refresh')
    expect(authHeader(fetchMock.mock.calls[2] ?? [])).toBe('Bearer new-token')
    expect(listener).toHaveBeenCalledWith(session.user)
  })

  it('ends the session when the refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, unauthorized))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Expiró.', code: 'SESSION_EXPIRED' }))

    await expect(apiRequest('/users')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(listener).toHaveBeenCalledWith(null)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not refresh when retryOnUnauthorized is false (e.g. wrong login)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        detail: 'Usuario o contraseña incorrectos.',
        code: 'INVALID_CREDENTIALS',
      }),
    )

    const request = apiRequest('/auth/login', { method: 'POST', retryOnUnauthorized: false })

    await expect(request).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares a single refresh request between concurrent callers', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, session)))

    await Promise.all([refreshSession(), refreshSession()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('converts network failures into a clear error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(apiRequest('/health')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servidor.',
    })
  })
})
