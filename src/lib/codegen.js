import { alphaForMethod } from './filterMath.js'
import { formatCFloatLiteral } from './format.js'

export function generateFilterCode({ cutoffHz, sampleRateHz, method, precision = 'double', initialOutput = 0 }) {
  const alpha = alphaForMethod(cutoffHz, sampleRateHz, method)
  const literal = (value) => precision === 'float' ? formatCFloatLiteral(value) : (value === 0 ? '0.0' : value.toPrecision(17))
  return `/* LPF LAB — fixed-rate, current-input EMA. C99. */
/* fc = ${cutoffHz} Hz; fs = ${sampleRateHz} Hz */
/* ${method === 'zoh' ? 'Matched exponential pole; no extra ZOH input delay.' : 'Backward Euler; current input x[n].'} */
/* Call once per ADC sample. Band-limit the analog input before ADC. */

typedef struct {
    ${precision} y;
    ${precision} alpha;
} lpf1_t;

static inline void lpf1_init(lpf1_t *f)
{
    f->alpha = ${literal(alpha)};
    f->y = ${literal(initialOutput)}; /* y[-1] before the first update */
}

static inline ${precision} lpf1_update(lpf1_t *f, ${precision} x)
{
    f->y += f->alpha * (x - f->y);
    return f->y; /* y[n], after consuming x[n] */
}
`
}
