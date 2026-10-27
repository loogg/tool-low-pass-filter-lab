import { useId, useRef, useState } from 'react'

const UNITS = [
  { id: 'hz', label: 'Hz', factor: 1 },
  { id: 'khz', label: 'kHz', factor: 1_000 },
  { id: 'mhz', label: 'MHz', factor: 1_000_000 },
]

export function NumericInput({ value, onChange, min, max, label, step = 'any', id }) {
  const generatedId = useId()
  const errorId = `${generatedId}-error`
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const cancelled = useRef(false)
  const display = Number.isFinite(value) ? String(Number(value.toPrecision(10))) : ''

  function commit() {
    setEditing(false)
    if (cancelled.current) { cancelled.current = false; return }
    const parsed = Number(draft)
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < min || parsed > max) {
      setError(`请输入 ${min} 至 ${max} 之间的数值`)
      return
    }
    setError('')
    if (draft === display) return
    onChange(parsed)
  }

  return <span className="numeric-editor">
    <input id={id} type="text" inputMode="decimal" role="spinbutton"
      aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      value={editing ? draft : display}
      onFocus={() => { setDraft(display); setEditing(true); setError('') }}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { cancelled.current = true; setError(''); event.currentTarget.blur() }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          const increment = step === 'any' ? Math.min(1, Math.max(Math.abs(value) / 10, min)) : Number(step)
          const next = Math.min(max, Math.max(min, (Number(draft) || 0) + (event.key === 'ArrowUp' ? 1 : -1) * increment))
          setDraft(String(Number(next.toPrecision(10))))
        }
      }} />
    {error ? <small id={errorId} className="input-error" role="alert">{error}</small> : null}
  </span>
}

export default function EngineeringFrequencyInput({ valueHz, minimumHz, maximumHz, ariaLabel, onChange }) {
  const [unitOverride, setUnitOverride] = useState(null)
  const preferred = valueHz >= 1e6 ? 'mhz' : valueHz >= 1e3 ? 'khz' : 'hz'
  const unit = UNITS.find((candidate) => candidate.id === (unitOverride ?? preferred))
  return <span className="engineering-frequency-input">
    <NumericInput value={valueHz / unit.factor} min={minimumHz / unit.factor} max={maximumHz / unit.factor}
      label={ariaLabel} onChange={(value) => onChange(value * unit.factor)} />
    <select value={unit.id} aria-label={`${ariaLabel}单位`} onChange={(event) => setUnitOverride(event.target.value)}>
      {UNITS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  </span>
}
