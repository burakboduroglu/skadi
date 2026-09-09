import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { createStore } from 'solid-js/store'
import { saveSub, deleteSub } from '../lib/api'
import type { Card, SubInput, Subscription } from '../lib/api'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

// Category values are stored in Turkish because they are data (migration).
const CATEGORIES = ['Yazılım', 'Medya', 'Oyun', 'Bulut', 'Finans', 'Sağlık', 'Eğitim', 'Diğer']
const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly']
const STATUSES = ['active', 'paused', 'cancelled']
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP']

function defaults(item: Subscription | null): Record<string, string> {
  const get = (f: string) => {
    let v = item ? ((item as unknown as Record<string, unknown>)[f] ?? '') : ''
    if (f === 'next_charge' && v) v = String(v).substring(0, 10)
    return String(v)
  }
  const d: Record<string, string> = {}
  for (const f of ['name', 'amount', 'currency', 'cashback', 'cycle', 'next_charge', 'status', 'category', 'payment_method', 'vendor_url', 'notes']) {
    d[f] = get(f)
  }
  if (!item) {
    d.status = 'active'
    d.cycle = 'monthly'
    d.currency = 'TRY'
  }
  return d
}

// Only a direct image can be previewed here; a page URL is resolved server
// side on save, so there is nothing honest to show for it yet.
function isImage(url: string): boolean {
  return /\.(png|jpe?g|webp|svg|gif|avif)(\?|#|$)/i.test(url) && !/File:/i.test(url)
}

const SubDialog: Component<{
  initial: Subscription | null
  cards: Card[]
  lang: Lang
  onClose: () => void
  onSaved: () => void
}> = (props) => {
  const L = (k: string) => t(props.lang, k)
  const [form, setForm] = createStore<Record<string, string>>(defaults(props.initial))
  const [err, setErr] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [logo, setLogo] = createSignal(props.initial?.logo_url || '')
  let dlg: HTMLDialogElement | undefined

  onMount(() => dlg?.showModal())
  onCleanup(() => {
    try {
      dlg?.close()
    } catch {
      /* already closed */
    }
  })

  const set =
    (k: string) =>
    (e: Event & { currentTarget: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) =>
      setForm(k, e.currentTarget.value)

  function onVendor(e: Event & { currentTarget: HTMLInputElement }) {
    const url = e.currentTarget.value
    setForm('vendor_url', url)
    // Live preview, so a pasted image URL is confirmed before saving.
    if (isImage(url.trim())) setLogo(url.trim())
  }

  // The select is built from the collection, so a card renamed in one place
  // cannot linger as a stale spelling in the other — except a value saved
  // before the card list existed, which still has to be selectable.
  const cardOptions = () => {
    const names = props.cards.map((c) => c.name)
    const keep = form.payment_method
    return keep && !names.includes(keep) ? [...names, keep] : names
  }

  // Nors Editor'daki snapshot deseni: Esc/kapat aynı yoldan geçer, form
  // doluysa confirm() sorulur.
  const snapshot = () => JSON.stringify(form)
  const base = snapshot()

  function tryClose() {
    if (snapshot() === base || confirm(L('confirmDiscard'))) props.onClose()
  }


  async function onSave() {
    setErr('')
    const data: SubInput = {
      name: form.name,
      amount: form.amount,
      currency: form.currency,
      cashback: form.cashback,
      cycle: form.cycle,
      next_charge: form.next_charge,
      status: form.status,
      category: form.category,
      payment_method: form.payment_method,
      vendor_url: form.vendor_url,
      notes: form.notes,
    }
    const amount = parseFloat(String(data.amount) || '0')
    const cashback = parseFloat(String(data.cashback) || '0')
    // Name may be blank when a Play link can supply it; the server fills it in.
    const playLink = form.vendor_url.includes('play.google.com')
    if (!data.name && !playLink) return setErr(L('errName'))
    if (!data.next_charge) return setErr(L('errDate'))
    if (!amount) return setErr(L('errAmount'))

    setBusy(true)
    try {
      await saveSub({ ...data, amount, cashback }, props.initial?.id)
      props.onSaved()
      props.onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    const item = props.initial
    if (!item || !confirm(`"${item.name}" ${L('confirmDelete')}`)) return
    try {
      await deleteSub(item.id)
      props.onSaved()
      props.onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const saveLabel = () => {
    if (!busy()) return L('save')
    const playLink = form.vendor_url.includes('play.google.com')
    return L(playLink && !form.name ? 'fetching' : 'saving')
  }

  return (
    <dialog
      ref={dlg}
      onCancel={(e) => {
        e.preventDefault()
        tryClose()
      }}
    >
      <div class="dlg-body">
        <h1>{L(props.initial ? 'titleEdit' : 'titleNew')}</h1>
        <div class="grid">
          <div class="field">
            <label>{L('f_link')}</label>
            <input inputmode="url" value={form.vendor_url} onInput={onVendor} />
          </div>
          <div class="field">
            <label>{L('f_name')}</label>
            <input value={form.name} onInput={set('name')} />
          </div>
          <div class="field">
            <label>{L('f_amount')}</label>
            <input type="number" inputmode="decimal" step="0.01" min="0" value={form.amount} onInput={set('amount')} />
          </div>
          <div class="field">
            <label>{L('f_unit')}</label>
            <select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L('f_cycle')}</label>
            <select value={form.cycle} onChange={set('cycle')}>
              {CYCLES.map((c) => (
                <option value={c}>{L('c_' + c)}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L('f_date')}</label>
            <input type="date" value={form.next_charge} onInput={set('next_charge')} />
          </div>
          <div class="field">
            <label>{L('f_cashbackF')}</label>
            <input type="number" inputmode="decimal" step="0.01" min="0" value={form.cashback} onInput={set('cashback')} />
          </div>
          <div class="field">
            <label>{L('f_card')}</label>
            <select value={form.payment_method} onChange={set('payment_method')}>
              <option value="">—</option>
              {cardOptions().map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L('f_category')}</label>
            <select value={form.category} onChange={set('category')}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L('f_status')}</label>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option value={s}>{L('s_' + s)}</option>
              ))}
            </select>
          </div>
        </div>
        <div class="field">
          <label>{L('f_notes')}</label>
          <textarea rows="2" value={form.notes} onInput={set('notes')} />
        </div>
        <Show when={logo()}>
          <div class="logo-preview">
            <img src={logo()} alt="" />
          </div>
        </Show>
        <Show when={err()}>
          <p class="error">{err()}</p>
        </Show>
      </div>
      <div class="dlg-foot">
        <Show when={props.initial}>
          <button type="button" class="danger" onClick={onDelete}>
            {L('del')}
          </button>
        </Show>
        <button type="button" class="ghost" onClick={tryClose}>
          {L('cancel')}
        </button>
        <button type="button" disabled={busy()} onClick={onSave}>
          {saveLabel()}
        </button>
      </div>
    </dialog>
  )
}

export default SubDialog
