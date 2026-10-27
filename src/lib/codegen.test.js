import { describe, expect, it } from 'vitest'
import { generateFilterCode } from './codegen.js'
import { alphaZoh } from './filterMath.js'

describe('generated C implementation contract', () => {
  it('round-trips the double coefficient even at the smallest supported ratio', () => {
    const options = { cutoffHz: 0.001, sampleRateHz: 200_000_000, method: 'zoh' }
    const code = generateFilterCode(options)
    const literal = code.match(/f->alpha = ([^;]+);/)[1]
    expect(Number(literal)).toBe(alphaZoh(options.cutoffHz, options.sampleRateHz))
    expect(code).toContain('double y;')
    expect(code).toContain('f->y = 0.0; /* y[-1]')
    expect(code).toContain('f->y += f->alpha * (x - f->y);')
    expect(code).not.toContain('initialized')
  })

  it('keeps a nonzero float coefficient and an explicit custom initial state', () => {
    const code = generateFilterCode({ cutoffHz: 0.001, sampleRateHz: 200_000_000,
      method: 'backward-euler', precision: 'float', initialOutput: -2 })
    expect(code).toContain('float y;')
    expect(code).toContain('f->y = -2.0f;')
    const literal = code.match(/f->alpha = ([^;]+);/)[1]
    expect(Math.fround(Number(literal.slice(0, -1)))).toBeGreaterThan(0)
  })
})
