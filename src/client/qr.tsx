// A QR code drawn as SVG squares in the current text colour, so it works in day and night.
import qrcode from 'qrcode-generator'

export function Qr({ value, size = 180, label }: { value: string; size?: number; label: string }) {
  if (!value) return null
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  const margin = 2
  const cells: React.ReactNode[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(<rect key={`${r}-${c}`} x={c + margin} y={r + margin} width="1.02" height="1.02" />)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n + margin * 2} ${n + margin * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="var(--surface)" />
      <g fill="var(--ink)">{cells}</g>
    </svg>
  )
}
