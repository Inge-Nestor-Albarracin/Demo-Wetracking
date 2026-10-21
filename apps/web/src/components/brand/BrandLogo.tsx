import { useId } from 'react'
import {
  LOGO_HEIGHT_FULL,
  LOGO_HEIGHT_MINIMAL,
  LOGO_WIDTH,
  MARK_BOTTOM,
  MARK_DOT,
  MARK_E,
  MARK_TOP,
  MARK_W,
  MARK_WIDTH,
  TAGLINE,
  WORDMARK,
} from './logoPaths'

// Brand manual, p. 9: "original" with tag-line (> 80 px wide), "mínima"
// without tag-line (smaller sizes) and the "We" mark alone (icons, 30–48 px).
// Tone, p. 6–7: "positive" on light backgrounds (black text), "negative" on
// the brand blues (white text). The mark keeps its colours in both.
type Variant = 'full' | 'minimal' | 'mark'
type Tone = 'positive' | 'negative'

export function BrandLogo({
  variant = 'full',
  tone = 'positive',
  className,
  title = 'WeTracking · Soluciones Integrales',
}: {
  variant?: Variant
  tone?: Tone
  className?: string
  title?: string
}) {
  const gradient = `we-e-${useId().replace(/:/g, '')}`
  const text = tone === 'positive' ? '#000000' : '#ffffff'
  const viewBox =
    variant === 'mark'
      ? `0 ${MARK_TOP} ${MARK_WIDTH} ${MARK_BOTTOM - MARK_TOP}`
      : `0 0 ${LOGO_WIDTH} ${variant === 'full' ? LOGO_HEIGHT_FULL : LOGO_HEIGHT_MINIMAL}`
  return (
    <svg className={className} viewBox={viewBox} role="img" aria-label={title} focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#00A5D7" />
          <stop offset="1" stopColor="#1184E6" />
        </linearGradient>
      </defs>
      <path fill="#00FFD7" d={MARK_W} />
      <path fill={`url(#${gradient})`} d={MARK_E} />
      <path fill="#1184E6" d={MARK_DOT} />
      {variant !== 'mark' ? <path fill={text} d={WORDMARK} /> : null}
      {variant === 'full' ? <path fill={text} d={TAGLINE} /> : null}
    </svg>
  )
}
