import { describe, expect, test } from 'bun:test'
import { money, toTRY } from './i18n'

describe('currency conversion', () => {
  const rates = { TRY: 1, USD: 40, EUR: 44, GBP: 52 }

  test('converts foreign currencies to TRY', () => {
    expect(toTRY(10, 'USD', rates)).toBe(400)
    expect(toTRY(10, 'TRY', rates)).toBe(10)
  })

  test('returns null when a rate is unavailable', () => {
    expect(toTRY(10, 'JPY', rates)).toBeNull()
    expect(toTRY(10, 'USD', null)).toBeNull()
  })

  test('renders totals in the selected display currency', () => {
    expect(money('en', 'USD', rates, 400)).toBe('10 $')
    expect(money('tr', 'TRY', rates, 400)).toBe('400 ₺')
    expect(money('en', 'EUR', null, 400)).toBe('—')
  })
})
