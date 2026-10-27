import { useId } from 'react'
import { Info } from 'lucide-react'
import { NumericInput } from './EngineeringFrequencyInput.jsx'

export function Metrics({ items, compact = false }) {
  return <dl className={`metrics ${compact ? 'is-compact' : ''}`}>
    {items.map(({ label, value, detail }) => <div key={label}><dt>{label}</dt><dd>{value}</dd>{detail ? <small>{detail}</small> : null}</div>)}
  </dl>
}

export function Notice({ children, warning = false }) {
  return <div className={`notice ${warning ? 'is-warning' : ''}`}><Info size={17} aria-hidden="true" /><div>{children}</div></div>
}

export function NumberField({ label, value, min, max, onChange, unit, step = 'any', hint }) {
  const id = useId()
  return <div className="number-field"><label htmlFor={id}>{label}</label>
    <div className="number-field-input"><NumericInput id={id} value={value} min={min} max={max} label={label} onChange={onChange} step={step} />{unit ? <span>{unit}</span> : null}</div>
    {hint ? <small>{hint}</small> : null}
  </div>
}

export function Segments({ label, value, onChange, items }) {
  return <div className="segments" role="group" aria-label={label}>
    {items.map((item) => <button key={item.id} type="button" aria-pressed={value === item.id}
      className={value === item.id ? 'is-active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>
}
