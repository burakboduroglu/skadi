import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { clearSession, getEmail, getToken, listCards, listSubs, loadFx, login } from './lib/api'
import type { Card, FxState, Subscription } from './lib/api'
import { CYCLE_MONTHS, SYMBOL, categoryName, cycleName, fmt, money, rate, t, toTRY } from './lib/i18n'
import type { Base, Lang } from './lib/i18n'
import SubDialog from './components/SubDialog'
import CardsDialog from './components/CardsDialog'

const PER_PAGE = 8
const BASES: Base[] = ['TRY', 'USD', 'EUR', 'GBP']

function initialLang(): Lang {
  const s = localStorage.getItem('subs_lang')
  if (s === 'tr' || s === 'en') return s
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

function initialBase(): Base {
  const s = localStorage.getItem('subs_base')
  return s === 'USD' || s === 'EUR' || s === 'GBP' ? s : 'TRY'
}

const PERSON_SVG = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-3px">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
  </svg>
)

const CARDS_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="M2 10h20" />
    <path d="M6 15h4" />
  </svg>
)

const OUT_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 17l5-5-5-5" />
    <path d="M20 12H9" />
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
  </svg>
)

const App: Component = () => {
  const [token, setToken] = createSignal(getToken())
  const [mail, setMail] = createSignal(getEmail())
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [loginErr, setLoginErr] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [lang, setLang] = createSignal<Lang>(initialLang())
  const [base, setBase] = createSignal<Base>(initialBase())
  const [page, setPage] = createSignal(1)
  const [menu, setMenu] = createSignal(false)
  const [editing, setEditing] = createSignal<Subscription | null>(null)
  const [dlgOpen, setDlgOpen] = createSignal(false)

  function openDialog(item: Subscription | null) {
    setEditing(item)
    setDlgOpen(true)
  }
  const [cardsOpen, setCardsOpen] = createSignal(false)
  const [listErr, setListErr] = createSignal('')
  let menuRef: HTMLDivElement | undefined

  const L = (k: string) => t(lang(), k)

  function bye() {
    clearSession()
    setToken('')
    setMail('')
  }

  async function onLogin(e?: Event) {
    e?.preventDefault()
    setBusy(true)
    setLoginErr('')
    try {
      await login(email(), password(), L('errThrottle'))
      setToken(getToken())
      setMail(getEmail())
      setPassword('')
    } catch (ex) {
      setLoginErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  const [subs, { refetch: refetchSubs }] = createResource(token, async () => {
    setListErr('')
    try {
      return await listSubs()
    } catch (e) {
      if (e instanceof Error && e.message === 'session expired') {
        bye()
        return [] as Subscription[]
      }
      setListErr(e instanceof Error ? e.message : String(e))
      return [] as Subscription[]
    }
  })

  const [cards, { refetch: refetchCards }] = createResource(token, async () => {
    try {
      return await listCards()
    } catch {
      return [] as Card[]
    }
  })

  const [fx, { refetch: refetchFx }] = createResource(token, loadFx)

  createEffect(() => {
    document.documentElement.lang = lang()
    document.title = 'Skadi'
  })

  onMount(() => {
    const outside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) setMenu(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('click', outside)
    document.addEventListener('keydown', esc)
    onCleanup(() => {
      document.removeEventListener('click', outside)
      document.removeEventListener('keydown', esc)
    })
    // ?add=1 deep-links straight onto the form (the external Glance widget uses it).
    if (token() && new URLSearchParams(location.search).get('add')) {
      history.replaceState(null, '', location.pathname)
      openDialog(null)
    }
  })

  const items = () => subs() ?? []
  const fxState = (): FxState => fx() ?? { rates: null, date: null, stale: false }

  // Totals are computed over every subscription, not over the visible page.
  function totals() {
    let gross = 0
    let cash = 0
    let unknown = 0
    const rates = fxState().rates
    for (const s of items()) {
      if (s.status !== 'active') continue
      const amtTRY = toTRY(s.amount, s.currency, rates)
      if (amtTRY === null) {
        unknown++
        continue
      }
      const per = CYCLE_MONTHS[s.cycle] || 1
      gross += amtTRY / per
      cash += (toTRY(s.cashback || 0, s.currency, rates) || 0) / per
    }
    return { gross, cash, unknown }
  }

  const pages = () => Math.max(1, Math.ceil(items().length / PER_PAGE))
  const visible = () => items().slice((page() - 1) * PER_PAGE, page() * PER_PAGE)
  createEffect(() => {
    if (page() > pages()) setPage(pages())
  })

  function turnPage(delta: number) {
    setPage(page() + delta)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  function retry() {
    refetchFx()
    refetchCards()
    refetchSubs()
  }

  function onLang(v: string) {
    if (v !== 'tr' && v !== 'en') return
    setLang(v)
    localStorage.setItem('subs_lang', v)
  }

  function onBase(v: string) {
    if (v !== 'TRY' && v !== 'USD' && v !== 'EUR' && v !== 'GBP') return
    setBase(v)
    localStorage.setItem('subs_base', v)
    // Totals re-render from the signal; no reload needed.
  }

  const initial = () => mail().trim().charAt(0).toUpperCase()

  function fxChips(): Array<{ c: Base; v: string }> {
    const r = fxState().rates
    const b = base()
    if (!r || !r[b]) return []
    return BASES.filter((c) => c !== b && r[c]).map((c) => ({
      c,
      v: `${rate(lang(), (r[c] as number) / (r[b] as number))} ${SYMBOL[b]}`,
    }))
  }

  return (
    <div class="shell">
      <Show
        when={token()}
        fallback={
          <div class="center-page">
            <div class="login">
              <div class="brand">
                <img src={`${import.meta.env.BASE_URL}skadi-mark.svg`} alt="" width="40" height="40" />
                <h1>Skadi</h1>
              </div>
              <label>
                {L('email')}
                <input
                  type="email"
                  autocomplete="username"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                />
              </label>
              <label>
                {L('password')}
                <input
                  type="password"
                  autocomplete="current-password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onLogin()
                  }}
                />
              </label>
              <Show when={loginErr()}>
                <p class="error">{loginErr()}</p>
              </Show>
              <button type="button" disabled={busy()} onClick={() => onLogin()}>
                {L('login')}
              </button>
            </div>
          </div>
        }
      >
          <header class="top">
            <div class="brand">
              <img src={`${import.meta.env.BASE_URL}skadi-mark.svg`} alt="" width="30" height="30" />
              <h1>Skadi</h1>
            </div>
            <div class="row">
              <button type="button" class="muted" onClick={() => openDialog(null)}>
                + New
              </button>
              <div class="avatar-wrap" ref={menuRef}>
                <button
                  type="button"
                  class="avatar"
                  aria-label={initial() || 'Account'}
                  aria-haspopup="menu"
                  aria-expanded={menu()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu(!menu())
                  }}
                >
                  {initial() || PERSON_SVG}
                </button>
                <Show when={menu()}>
                  <div
                    class="menu"
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Show when={mail()} fallback={<p class="menu-mail">superuser</p>}>
                      <p class="menu-mail">{mail()}</p>
                    </Show>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false)
                        setCardsOpen(true)
                      }}
                    >
                      {CARDS_SVG}
                      <span>{L('cards')}</span>
                    </button>
                    <button type="button" class="out" onClick={bye}>
                      {OUT_SVG}
                      <span>{L('logout')}</span>
                    </button>
                    <div class="menu-sep" />
                    <label class="menu-row">
                      <span>{L('lang')}</span>
                      <select value={lang()} onChange={(e) => onLang(e.currentTarget.value)}>
                        <option value="tr">Türkçe</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label class="menu-row">
                      <span>{L('display')}</span>
                      <select value={base()} onChange={(e) => onBase(e.currentTarget.value)}>
                        {BASES.map((c) => (
                          <option value={c}>
                            {SYMBOL[c]} {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </Show>
              </div>
            </div>
          </header>

          <div class="stats">
            <div class="card stat">
              <span>{L('gross')}</span>
              <b>{money(lang(), base(), fxState().rates, totals().gross)}</b>
            </div>
            <div class="card stat">
              <span>{L('cashback')}</span>
              <b style="color:var(--pos)">{totals().cash ? `−${money(lang(), base(), fxState().rates, totals().cash)}` : '—'}</b>
            </div>
            <div class="card stat">
              <span>{L('net')}</span>
              <b>{money(lang(), base(), fxState().rates, totals().gross - totals().cash)}</b>
            </div>
            <div class="card stat">
              <span>{L('yearly')}</span>
              <b>{money(lang(), base(), fxState().rates, (totals().gross - totals().cash) * 12)}</b>
            </div>
          </div>

          <div class="panel fxbar">
            <Show when={fxState().rates} fallback={<span class="warn">{L('fxFailed')}</span>}>
              <For each={fxChips()}>
                {(chip) => (
                  <span class="fx">
                    <span class="sym">{SYMBOL[chip.c]}</span>
                    <span class="dot">•</span>
                    <span class="val">{chip.v}</span>
                  </span>
                )}
              </For>
              <span class="meta">
                <Show when={fxState().stale}>
                  <span class="warn">{L('fxStale')}</span>
                </Show>
                <Show when={fxState().date || totals().unknown}>
                  {[fxState().date, totals().unknown ? `${totals().unknown} ${L('fxUnconverted')}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Show>
              </span>
            </Show>
          </div>

          <div class="dash-head">
            <h2>{L('list')}</h2>
            <button type="button" class="ghost" onClick={retry}>
              {L('refresh')}
            </button>
          </div>
          <div class="panel">
            <Show when={subs.loading && !items().length}>
              <div class="spin-wrap" role="status" aria-label="Loading">
                <span class="spin" />
              </div>
            </Show>
            <Show when={listErr()}>
              <p class="empty">
                {L('loadFailed')}
                <br />
                <b>{listErr()}</b>
                <br />
                <br />
                <button type="button" onClick={retry}>
                  {L('retry')}
                </button>
              </p>
            </Show>
            <Show when={!subs.loading && !listErr() && !items().length}>
              <div class="empty-wrap">
                <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <ellipse cx="36" cy="44" rx="20" ry="7" />
                  <ellipse cx="36" cy="32" rx="14" ry="6" />
                  <path d="M36 26v-8" />
                  <circle cx="36" cy="12" r="4" />
                </svg>
                <p>{L('emptyList')}</p>
                <button type="button" class="ghost" onClick={() => openDialog(null)}>
                  {L('add')}
                </button>
              </div>
            </Show>
            <For each={visible()}>
              {(s) => {
                const parts = [
                  cycleName(lang(), s.cycle),
                  s.next_charge ? s.next_charge.substring(0, 10) : null,
                  s.payment_method,
                  categoryName(lang(), s.category),
                ].filter(Boolean)
                return (
                  <div class="sub" classList={{ off: s.status !== 'active' }} onClick={() => openDialog(s)}>
                    <Show when={s.logo_url} fallback={<img alt="" />}>
                      <img
                        src={s.logo_url}
                        alt=""
                        loading="lazy"
                        onError={(e) => e.currentTarget.removeAttribute('src')}
                      />
                    </Show>
                    <div class="meta">
                      <b>{s.name}</b>
                      <small>{parts.join(' · ')}</small>
                    </div>
                    <div class="amt">
                      <b>
                        {fmt(lang(), s.amount)} {s.currency}
                      </b>
                      <Show when={s.cashback}>
                        <small>−{fmt(lang(), s.cashback)} cashback</small>
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>

          <Show when={pages() > 1}>
            <div class="pager">
              <button type="button" aria-label={L('prev')} disabled={page() <= 1} onClick={() => turnPage(-1)}>
                ‹
              </button>
              <span>
                {page()} / {pages()}
              </span>
              <button type="button" aria-label={L('next')} disabled={page() >= pages()} onClick={() => turnPage(1)}>
                ›
              </button>
            </div>
          </Show>
      </Show>

      <Show when={dlgOpen()}>
        <SubDialog
          initial={editing()}
          cards={cards() ?? []}
          lang={lang()}
          onClose={() => setDlgOpen(false)}
          onSaved={() => refetchSubs()}
        />
      </Show>

      <Show when={cardsOpen()}>
        <CardsDialog
          cards={cards() ?? []}
          usedBy={(name) => items().filter((i) => i.payment_method === name).length}
          lang={lang()}
          onClose={() => setCardsOpen(false)}
          onChanged={() => refetchCards()}
        />
      </Show>
    </div>
  )
}

export default App
