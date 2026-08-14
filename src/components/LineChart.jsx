import { useId, useMemo, useState } from 'react'

const VIEWBOX_WIDTH = 760
const VIEWBOX_HEIGHT = 320
const MARGIN = { top: 24, right: 24, bottom: 52, left: 68 }

function createLinearTicks([minimum, maximum], count = 5) {
  return Array.from({ length: count }, (_, index) => minimum + ((maximum - minimum) * index) / (count - 1))
}

function nearestPoint(data, targetX) {
  if (!data?.length) return null
  let nearest = data[0]
  let distance = Math.abs(nearest.x - targetX)
  for (let index = 1; index < data.length; index += 1) {
    const nextDistance = Math.abs(data[index].x - targetX)
    if (nextDistance < distance) {
      nearest = data[index]
      distance = nextDistance
    }
  }
  return nearest
}

export default function LineChart({
  series,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  xScale = 'linear',
  formatX = (value) => String(value),
  formatY = (value) => String(value),
  ariaLabel,
  referenceLines = [],
  playing = false,
  showPlayhead = false,
}) {
  const clipId = useId().replaceAll(':', '')
  const [hoverX, setHoverX] = useState(null)
  const plotWidth = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom
  const safeXMinimum = xScale === 'log' ? Math.log10(xDomain[0]) : xDomain[0]
  const safeXMaximum = xScale === 'log' ? Math.log10(xDomain[1]) : xDomain[1]

  const scaleX = (value) => {
    const normalizedValue = xScale === 'log' ? Math.log10(Math.max(value, xDomain[0])) : value
    return MARGIN.left + ((normalizedValue - safeXMinimum) / (safeXMaximum - safeXMinimum)) * plotWidth
  }

  const inverseScaleX = (pixel) => {
    const ratio = (pixel - MARGIN.left) / plotWidth
    const normalized = safeXMinimum + ratio * (safeXMaximum - safeXMinimum)
    return xScale === 'log' ? 10 ** normalized : normalized
  }

  const scaleY = (value) =>
    MARGIN.top + (1 - (value - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight

  const computedXTicks = xTicks ?? createLinearTicks(xDomain)
  const computedYTicks = yTicks ?? createLinearTicks(yDomain)

  const paths = useMemo(
    () =>
      series.map((item) => ({
        ...item,
        path: item.data
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.x).toFixed(2)} ${scaleY(point.y).toFixed(2)}`)
          .join(' '),
      })),
    // scale functions are fully determined by these primitive inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, xDomain[0], xDomain[1], yDomain[0], yDomain[1], xScale],
  )

  const hoverValues = hoverX === null
    ? []
    : series.map((item) => ({ ...item, point: nearestPoint(item.data, hoverX) }))
  const hoverPixel = hoverX === null ? null : scaleX(hoverX)
  const tooltipOnLeft = hoverPixel !== null && hoverPixel > VIEWBOX_WIDTH * 0.66

  function handlePointerMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const localX = ((event.clientX - bounds.left) / bounds.width) * VIEWBOX_WIDTH
    const clampedPixel = Math.min(MARGIN.left + plotWidth, Math.max(MARGIN.left, localX))
    setHoverX(inverseScaleX(clampedPixel))
  }

  return (
    <div className="line-chart-shell">
      <svg
        className="line-chart"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverX(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} rx="10" />
          </clipPath>
        </defs>

        <rect
          className="chart-plot-bg"
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          rx="10"
        />

        {computedYTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              className="chart-grid-line"
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
            />
            <text className="chart-axis-label" x={MARGIN.left - 12} y={scaleY(tick) + 4} textAnchor="end">
              {formatY(tick)}
            </text>
          </g>
        ))}

        {computedXTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line
              className="chart-grid-line"
              x1={scaleX(tick)}
              x2={scaleX(tick)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
            <text
              className="chart-axis-label"
              x={scaleX(tick)}
              y={MARGIN.top + plotHeight + 28}
              textAnchor="middle"
            >
              {formatX(tick)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {referenceLines.map((line) => (
            <line
              key={`${line.axis}-${line.value}-${line.label ?? ''}`}
              className="chart-reference-line"
              x1={line.axis === 'y' ? MARGIN.left : scaleX(line.value)}
              x2={line.axis === 'y' ? MARGIN.left + plotWidth : scaleX(line.value)}
              y1={line.axis === 'y' ? scaleY(line.value) : MARGIN.top}
              y2={line.axis === 'y' ? scaleY(line.value) : MARGIN.top + plotHeight}
              style={{ '--reference-color': line.color ?? '#f5a85b' }}
            />
          ))}

          {paths.map((item) => (
            <path
              key={item.label}
              d={item.path}
              className="chart-series-line"
              style={{
                '--series-color': item.color,
                strokeDasharray: item.dash ?? 'none',
              }}
            />
          ))}

          {hoverPixel !== null ? (
            <line
              className="chart-hover-line"
              x1={hoverPixel}
              x2={hoverPixel}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
          ) : null}
        </g>

        {referenceLines.map((line) =>
          line.label ? (
            <text
              key={`label-${line.axis}-${line.value}`}
              className="chart-reference-label"
              x={line.axis === 'y' ? MARGIN.left + plotWidth - 8 : scaleX(line.value) + 8}
              y={line.axis === 'y' ? scaleY(line.value) - 8 : MARGIN.top + 16}
              textAnchor={line.axis === 'y' ? 'end' : 'start'}
            >
              {line.label}
            </text>
          ) : null,
        )}

        {hoverPixel !== null ? (
          <g
            className="chart-tooltip"
            transform={`translate(${tooltipOnLeft ? hoverPixel - 194 : hoverPixel + 12}, ${MARGIN.top + 10})`}
          >
            <rect width="182" height={34 + hoverValues.length * 23} rx="10" />
            <text x="12" y="20" className="chart-tooltip-title">
              x · {formatX(hoverX)}
            </text>
            {hoverValues.map((item, index) => (
              <g key={item.label} transform={`translate(12, ${39 + index * 23})`}>
                <circle cx="4" cy="-4" r="4" fill={item.color} />
                <text x="16" y="0" className="chart-tooltip-value">
                  {item.label} · {formatY(item.point?.y)}
                </text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>

      {showPlayhead ? (
        <span className={`chart-playhead ${playing ? 'is-playing' : 'is-paused'}`} aria-hidden="true" />
      ) : null}

      <div className="chart-legend" aria-hidden="true">
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ '--legend-color': item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
