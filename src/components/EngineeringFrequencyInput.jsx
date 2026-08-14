import { useMemo, useState } from 'react'
import { clamp } from '../lib/filterMath.js'

const UNITS = [
  { id: 'hz', label: 'Hz', factor: 1 },
  { id: 'khz', label: 'kHz', factor: 1_000 },
  { id: 'mhz', label: 'MHz', factor: 1_000_000 },
]

function preferredUnit(valueHz) {
  if (Math.abs(valueHz) >= 1_000_000) return 'mhz'
  if (Math.abs(valueHz) >= 1_000) return 'khz'
  return 'hz'
}

function displayNumber(value) {
  if (!Number.isFinite(value)) return 0
  return Number(value.toPrecision(8))
}

function FrequencyEditor({
  valueHz,
  onChange,
  minimumHz,
  maximumHz,
  ariaLabel,
  compact = false,
  initialUnitId,
}) {
  const [unitId, setUnitId] = useState(initialUnitId)
  const unit = useMemo(
    () => UNITS.find((candidate) => candidate.id === unitId) ?? UNITS[0],
    [unitId],
  )
  const displayValue = valueHz / unit.factor

  function commit(nextDisplayValue) {
    if (!Number.isFinite(nextDisplayValue)) return
    onChange(clamp(nextDisplayValue * unit.factor, minimumHz, maximumHz))
  }

  return (
    <span className={`engineering-frequency-input ${compact ? 'is-compact' : ''}`}>
      <input
        type="number"
        value={displayNumber(displayValue)}
        min={minimumHz / unit.factor}
        max={maximumHz / unit.factor}
        step="any"
        aria-label={ariaLabel}
        onChange={(event) => commit(Number(event.target.value))}
      />
      <select
        value={unit.id}
        aria-label={`${ariaLabel}单位`}
        onChange={(event) => setUnitId(event.target.value)}
      >
        {UNITS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
        ))}
      </select>
    </span>
  )
}

export default function EngineeringFrequencyInput(props) {
  const initialUnitId = preferredUnit(props.valueHz)
  return <FrequencyEditor key={initialUnitId} {...props} initialUnitId={initialUnitId} />
}
