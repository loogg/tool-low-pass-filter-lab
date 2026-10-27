import { useState } from 'react'
import { NumericInput } from './EngineeringFrequencyInput.jsx'
import { timeUnitFor } from '../lib/responseAnalysis.js'

const UNITS = [
  { id: 's', label: 's', factor: 1 }, { id: 'ms', label: 'ms', factor: 1e-3 },
  { id: 'us', label: 'μs', factor: 1e-6 }, { id: 'ns', label: 'ns', factor: 1e-9 },
  { id: 'ps', label: 'ps', factor: 1e-12 },
]

export default function EngineeringTimeInput({ valueSeconds, minimumSeconds, maximumSeconds, ariaLabel, onChange }) {
  const [override, setOverride] = useState(null)
  const unit = UNITS.find((item) => item.id === (override ?? timeUnitFor(valueSeconds).id))
  return <span className="engineering-frequency-input engineering-time-input">
    <NumericInput value={valueSeconds / unit.factor} min={minimumSeconds / unit.factor} max={maximumSeconds / unit.factor}
      label={ariaLabel} onChange={(value) => onChange(value * unit.factor)} />
    <select value={unit.id} aria-label={`${ariaLabel}单位`} onChange={(event) => setOverride(event.target.value)}>
      {UNITS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  </span>
}
