import { describe, expect, it } from 'vitest'
import { formatPhone } from '../utils'

describe('formatPhone', () => {
  it('rejects non-digit input', () => {
    expect(formatPhone('abc')).toBe('')
  })

  it('formats 11 digits as BR cell phone', () => {
    expect(formatPhone('11999999999')).toBe('(11) 99999-9999')
  })

  it('formats 10 digits as BR landline', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })

  it('truncates after 11 digits', () => {
    expect(formatPhone('11999999999extra')).toBe('(11) 99999-9999')
  })
})
