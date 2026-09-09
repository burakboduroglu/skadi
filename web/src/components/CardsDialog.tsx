import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Component } from 'solid-js'
import { addCard, deleteCard } from '../lib/api'
import type { Card } from '../lib/api'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

const CardsDialog: Component<{
  cards: Card[]
  usedBy: (name: string) => number
  lang: Lang
  onClose: () => void
  onChanged: () => void
}> = (props) => {
  const L = (k: string) => t(props.lang, k)
  const [name, setName] = createSignal('')
  const [err, setErr] = createSignal('')
  let dlg: HTMLDialogElement | undefined

  onMount(() => dlg?.showModal())
  onCleanup(() => {
    try {
      dlg?.close()
    } catch {
      /* already closed */
    }
  })

  async function onAdd() {
    const v = name().trim()
    if (!v) return setErr(L('cardNameRequired'))
    setErr('')
    try {
      await addCard(v)
      setName('')
      props.onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(/unique|validation/i.test(msg) ? L('cardExists') : msg)
    }
  }

  async function onDelete(card: Card) {
    // Removing a card leaves it on the subscriptions that already carry it:
    // the field is text, and silently blanking a payment method would lose data.
    const used = props.usedBy(card.name)
    const warn = used ? `\n\n${used} ${L('cardUsed')}` : ''
    if (!confirm(`"${card.name}" ${L('confirmDelete')}${warn}`)) return
    try {
      await deleteCard(card.id)
      props.onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <dialog ref={dlg} onCancel={() => props.onClose()}>
      <div class="dlg-body">
        <h1>{L('cards')}</h1>
        <div class="panel">
          <Show when={props.cards.length} fallback={<p class="empty">{L('noCards')}</p>}>
            <For each={props.cards}>
              {(c) => (
                <div class="sub">
                  <div class="meta">
                    <b>{c.name}</b>
                  </div>
                  <button type="button" class="danger" onClick={() => onDelete(c)}>
                    {L('del')}
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
        <div class="field" style="margin-top:.75rem">
          <label>{L('new')}</label>
          <div style="display:flex;gap:.5rem">
            <input
              style="flex:1;min-width:0"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAdd()
              }}
            />
            <button type="button" onClick={onAdd}>
              {L('addShort')}
            </button>
          </div>
        </div>
        <Show when={err()}>
          <p class="error">{err()}</p>
        </Show>
      </div>
      <div class="dlg-foot">
        <button type="button" class="ghost" onClick={() => props.onClose()}>
          {L('close')}
        </button>
      </div>
    </dialog>
  )
}

export default CardsDialog
