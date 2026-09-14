/** Minimal PocketBase REST client — no SDK (micro). Keys match the old page. */

const TOKEN_KEY = 'subs_token'
const EMAIL_KEY = 'subs_email'

export type Subscription = {
  id: string
  name: string
  amount: number
  currency: string
  cashback: number
  cycle: string
  next_charge: string
  status: string
  category: string
  payment_method: string
  vendor_url: string
  notes: string
  logo_url: string
}

export type Card = { id: string; name: string }

export type FxState = {
  rates: Record<string, number> | null
  date: string | null
  stale: boolean
}

export const FIELDS = [
  'name', 'amount', 'currency', 'cashback', 'cycle', 'next_charge',
  'status', 'category', 'payment_method', 'vendor_url', 'notes',
] as const

export type SubInput = Record<(typeof FIELDS)[number], string | number>
function baseUrl(): string {
  const fromEnv = import.meta.env.VITE_PB_URL as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getEmail(): string {
  return localStorage.getItem(EMAIL_KEY) || ''
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** Fired on window when PocketBase rejects the stored token; App returns to login. */
export const SESSION_EXPIRED = 'skadi:session-expired'

const ACCESS_RELOAD_KEY = 'skadi_access_reload'

/**
 * fetch that survives Cloudflare Access. An expired Access session answers API
 * calls with a cross-origin redirect to the Access login, which fetch cannot
 * follow; reloading lets the browser run that login. The pending promise never
 * settles so callers show no error toast in the moment before the reload.
 */
async function edgeFetch(url: string, opts: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...opts, redirect: 'manual' })
  if (res.type === 'opaqueredirect') {
    // Reload once; if Access still redirects right after, stop instead of looping.
    const last = Number(sessionStorage.getItem(ACCESS_RELOAD_KEY) || 0)
    if (Date.now() - last < 30_000) throw new Error('Cloudflare Access session expired. Reload the page to sign in again.')
    sessionStorage.setItem(ACCESS_RELOAD_KEY, String(Date.now()))
    location.reload()
    return new Promise<Response>(() => {})
  }
  return res
}

export async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await edgeFetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: getToken(), ...(opts.headers || {}) },
  })
  // PocketBase treats a missing or expired token as a guest: superuser-only
  // collections answer 403 and auth-required routes 401. Both mean log in again,
  // wherever the call came from (list, dialog, cards, rates).
  if (res.status === 401 || res.status === 403) {
    clearSession()
    window.dispatchEvent(new Event(SESSION_EXPIRED))
    throw new Error('session expired')
  }
  const body = res.status === 204 ? null : await res.json()
  if (!res.ok) throw new Error((body as { message?: string })?.message || `HTTP ${res.status}`)
  return body as T
}

export async function login(email: string, password: string, throttleHint: string): Promise<void> {
  const res = await edgeFetch(`${baseUrl()}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email.trim(), password }),
  })
  const body = (await res.json()) as { token?: string; message?: string }
  // The edge rate-limits /api/collections/_superusers* at 5 requests per 10s,
  // so a burst of retries looks like a credential failure. Say so.
  if (!res.ok) throw new Error(`${body.message || 'login failed'} ${throttleHint}`)
  localStorage.setItem(TOKEN_KEY, body.token || '')
  // Kept only to draw the avatar's initial; the token is what authenticates.
  localStorage.setItem(EMAIL_KEY, email.trim())
}

export function subsUrl(path = ''): string {
  return `${baseUrl()}/api/collections/subscriptions/records${path}`
}

export function cardsUrl(path = ''): string {
  return `${baseUrl()}/api/collections/cards/records${path}`
}

export function ratesUrl(): string {
  return `${baseUrl()}/api/subs/rates`
}

export async function listSubs(): Promise<Subscription[]> {
  const body = await api<{ items: Subscription[] }>(`${subsUrl()}?perPage=500&sort=status,next_charge`)
  return body.items
}

export async function saveSub(input: SubInput, id?: string): Promise<void> {
  await api(id ? `${subsUrl()}/${id}` : subsUrl(), {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteSub(id: string): Promise<void> {
  await api(`${subsUrl()}/${id}`, { method: 'DELETE' })
}

export async function listCards(): Promise<Card[]> {
  const body = await api<{ items: Card[] }>(`${cardsUrl()}?perPage=200&sort=name`)
  return body.items
}

export async function addCard(name: string): Promise<void> {
  await api(cardsUrl(), { method: 'POST', body: JSON.stringify({ name }) })
}

export async function deleteCard(id: string): Promise<void> {
  await api(`${cardsUrl()}/${id}`, { method: 'DELETE' })
}

// Rates come from our own /api/subs/rates, not from the browser reaching an FX
// API directly: Yahoo sends no CORS headers, and a second source would let this
// page and the dashboard disagree about the same total.
export async function loadFx(): Promise<FxState> {
  try {
    const body = await api<{ rates: Record<string, number>; date: string | null; stale: boolean }>(ratesUrl())
    return { rates: body.rates, date: body.date || null, stale: !!body.stale }
  } catch {
    return { rates: null, date: null, stale: true }
  }
}
