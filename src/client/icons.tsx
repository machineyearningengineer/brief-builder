// Line icons drawn on a 24px grid, stroked in the current text colour.
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const PhotoIcon = () => (
  <svg {...base}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></svg>
)
export const SendIcon = () => (
  <svg {...base}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>
)
export const InfoIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
)
export const CloseIcon = () => (
  <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const BackIcon = () => (
  <svg {...base}><path d="m15 5-7 7 7 7" /></svg>
)
export const SunMoonIcon = () => (
  <svg {...base}><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" /></svg>
)
export const PinIcon = () => (
  <svg {...base}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
)
export const InboxIcon = () => (
  <svg {...base}><path d="M4 13 6.5 5h11L20 13" /><path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5h-4.5a3.5 3.5 0 0 1-7 0Z" /></svg>
)
export const ChatIcon = () => (
  <svg {...base}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /></svg>
)
