import { describe, expect, it } from 'vitest'
import {
  formatCFloatLiteral,
  formatEngineeringRate,
  formatFrequency,
  formatInteger,
  formatSeconds,
} from './format.js'

describe('engineering display formatting', () => {
  it('uses Hz, kHz, and MHz at engineering boundaries', () => {
    expect(formatFrequency(50)).toBe('50 Hz')
    expect(formatFrequency(48_000)).toBe('48 kHz')
    expect(formatFrequency(100_000_000)).toBe('100 MHz')
  })

  it('uses nanoseconds for high-rate sampling periods', () => {
    expect(formatSeconds(1 / 100_000_000)).toBe('10 ns')
  })

  it('keeps large counts compact but exact where each form is useful', () => {
    expect(formatInteger(8_001)).toBe('8,001')
    expect(formatEngineeringRate(300_000_000, 'ops/s')).toBe('300 Mops/s')
  })

  it('preserves very small MCU coefficients as valid non-zero C float literals', () => {
    expect(formatCFloatLiteral(3.141592653540445e-11)).toBe('3.14159265e-11f')
    expect(formatCFloatLiteral(0.14536400084676657)).toBe('0.145364001f')
    expect(formatCFloatLiteral(1)).toBe('1.0f')
  })
})
