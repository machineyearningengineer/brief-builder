// A label that explains itself on hover, keyboard focus or tap: no click-through, no modal.
import type { ReactNode } from 'react'
import { useId } from 'react'

export function Tip({ children, tip, align = 'start' }: { children: ReactNode; tip: ReactNode; align?: 'start' | 'end' }) {
  const id = useId()
  return (
    <span className={`tip ${align}`} tabIndex={0} aria-describedby={id}>
      {children}
      <span className="tip-mark" aria-hidden="true">?</span>
      <span className="tip-body" role="tooltip" id={id}>{tip}</span>
    </span>
  )
}
