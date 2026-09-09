/** Strings and money math ported 1:1 from the hand-built page. */

export type Lang = 'tr' | 'en'
export type Base = 'TRY' | 'USD' | 'EUR' | 'GBP'

export const SYMBOL: Record<Base, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
export const CYCLE_MONTHS: Record<string, number> = { weekly: 12 / 52, monthly: 1, quarterly: 3, yearly: 12 }

const STRINGS = {
  tr: {
    list: 'Abonelikler', refresh: 'Yenile', email: 'E-posta', password: 'Parola', login: 'Giriş',
    add: '+ Ekle', addShort: 'Ekle', cards: 'Kartlar', logout: 'Çıkış',
    lang: 'Dil', display: 'Görünüm',
    gross: 'Aylık brüt', cashback: 'Cashback', net: 'Aylık net', yearly: 'Yıllık net',
    f_link: 'Link', f_name: 'Ad', f_amount: 'Tutar', f_unit: 'Birim', f_cycle: 'Periyot',
    f_date: 'Tarih', f_cashbackF: 'Cashback', f_card: 'Kart', f_category: 'Kategori',
    f_status: 'Durum', f_notes: 'Not',
    c_monthly: 'Aylık', c_yearly: 'Yıllık', c_quarterly: '3 aylık', c_weekly: 'Haftalık',
    s_active: 'Aktif', s_paused: 'Duraklatıldı', s_cancelled: 'İptal',
    k_software: 'Yazılım', k_media: 'Medya', k_games: 'Oyun', k_cloud: 'Bulut',
    k_finance: 'Finans', k_health: 'Sağlık', k_learning: 'Eğitim', k_other: 'Diğer',
    save: 'Kaydet', cancel: 'Vazgeç', del: 'Sil', close: 'Kapat', new: 'Yeni',
    titleNew: 'Yeni abonelik', titleEdit: 'Düzenle',
    saving: 'Kaydediliyor…', fetching: 'Çekiliyor…', loading: 'Yükleniyor…',
    emptyList: 'Henüz kayıt yok.', emptyHint: 'ile başla.',
    loadFailed: 'Liste yüklenemedi.', retry: 'Tekrar dene',
    noCards: 'Kart yok.', cardExists: 'Bu isimde bir kart zaten var.',
    cardNameRequired: 'Kart adı gerekli.',
    prev: 'Önceki', next: 'Sonraki',
    confirmDiscard: 'Kaydedilmemiş değişiklikler silinsin mi?',
    errName: 'Ad gerekli (ya da bir Play linki ver).',
    errDate: 'Tarih gerekli.', errAmount: 'Tutar gerekli.',
    errSession: 'Oturum düştü', errLogin: 'Giriş başarısız',
    errThrottle: '(art arda denediysen 10 sn bekle)',
    fxFailed: 'Kur alınamadı — yabancı para tutarları toplama dahil edilmedi.',
    fxStale: 'güncellenemedi', fxUnconverted: 'kayıt kursuz',
  },
  en: {
    list: 'Subscriptions', refresh: 'Refresh', email: 'Email', password: 'Password', login: 'Sign in',
    add: '+ Add', addShort: 'Add', cards: 'Cards', logout: 'Sign out',
    lang: 'Language', display: 'Display',
    gross: 'Monthly gross', cashback: 'Cashback', net: 'Monthly net', yearly: 'Yearly net',
    f_link: 'Link', f_name: 'Name', f_amount: 'Amount', f_unit: 'Currency', f_cycle: 'Cycle',
    f_date: 'Date', f_cashbackF: 'Cashback', f_card: 'Card', f_category: 'Category',
    f_status: 'Status', f_notes: 'Notes',
    c_monthly: 'Monthly', c_yearly: 'Yearly', c_quarterly: 'Quarterly', c_weekly: 'Weekly',
    s_active: 'Active', s_paused: 'Paused', s_cancelled: 'Cancelled',
    k_software: 'Software', k_media: 'Media', k_games: 'Games', k_cloud: 'Cloud',
    k_finance: 'Finance', k_health: 'Health', k_learning: 'Learning', k_other: 'Other',
    save: 'Save', cancel: 'Cancel', del: 'Delete', close: 'Close', new: 'New',
    titleNew: 'New subscription', titleEdit: 'Edit',
    saving: 'Saving…', fetching: 'Fetching…', loading: 'Loading…',
    emptyList: 'Nothing here yet.', emptyHint: 'to start.',
    loadFailed: 'Could not load the list.', retry: 'Try again',
    noCards: 'No cards.', cardExists: 'A card with that name already exists.',
    cardNameRequired: 'A card name is required.',
    prev: 'Previous', next: 'Next',
    confirmDiscard: 'Discard unsaved changes?',
    errName: 'A name is required (or give a Play link).',
    errDate: 'A date is required.', errAmount: 'An amount is required.',
    errSession: 'Session expired', errLogin: 'Sign-in failed',
    errThrottle: '(wait 10s if you retried quickly)',
    fxFailed: 'No rates — foreign amounts were left out of the totals.',
    fxStale: 'not refreshed', fxUnconverted: 'record(s) without a rate',
  },
} as const

export type I18nKey = keyof (typeof STRINGS)['tr']

export function t(lang: Lang, k: string): string {
  const dict = STRINGS[lang] as Record<string, string>
  return dict[k] ?? (STRINGS.tr as Record<string, string>)[k] ?? k
}

// Category values are stored in Turkish because they are data; only the
// visible text is translated.
const CATEGORY_KEY: Record<string, string> = {
  Yazılım: 'k_software', Medya: 'k_media', Oyun: 'k_games', Bulut: 'k_cloud',
  Finans: 'k_finance', Sağlık: 'k_health', Eğitim: 'k_learning', Diğer: 'k_other',
}

export function categoryName(lang: Lang, c: string): string {
  return c && CATEGORY_KEY[c] ? t(lang, CATEGORY_KEY[c]) : c
}

export function cycleName(lang: Lang, c: string): string {
  return t(lang, 'c_' + c) === 'c_' + c ? c : t(lang, 'c_' + c)
}

export function localeOf(lang: Lang): string {
  return lang === 'tr' ? 'tr-TR' : 'en-US'
}

export function fmt(lang: Lang, n: number, digits = 0): string {
  return new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: digits }).format(n)
}

export function rate(lang: Lang, n: number): string {
  return new Intl.NumberFormat(localeOf(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// Rates are TRY per one unit of the currency.
export function toTRY(amount: number, cur: string, fx: Record<string, number> | null): number | null {
  return cur === 'TRY' ? amount : fx && fx[cur] ? amount * fx[cur] : null
}

function inBase(tryValue: number, base: Base, fx: Record<string, number> | null): number | null {
  if (base === 'TRY') return tryValue
  if (!fx || !fx[base]) return null
  return tryValue / fx[base]
}

// A TRY figure rendered in whichever currency is on display. Rows keep the
// currency they are actually charged in; only totals convert.
export function money(lang: Lang, base: Base, fx: Record<string, number> | null, tryValue: number): string {
  const v = inBase(tryValue, base, fx)
  return v === null ? '—' : `${fmt(lang, v, base === 'TRY' ? 0 : 2)} ${SYMBOL[base]}`
}
