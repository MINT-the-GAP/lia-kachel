import stylesheet from 'bundle-text:../styles.css'

export const KACHEL_STYLE_ID = 'lia-kachel-styles'

/** Installs the build-pinned stylesheet without a MIME-sensitive link request. */
export function installKachelStyles(
  ownerDocument: Document = document,
): HTMLStyleElement | null {
  const existing =
    typeof ownerDocument.getElementById === 'function'
      ? ownerDocument.getElementById(KACHEL_STYLE_ID)
      : null

  if (existing) return existing as HTMLStyleElement

  const parent = ownerDocument.head ?? ownerDocument.documentElement
  if (!parent || typeof ownerDocument.createElement !== 'function') return null

  const style = ownerDocument.createElement('style')
  style.id = KACHEL_STYLE_ID
  style.setAttribute('data-lia-kachel-styles', '')
  style.textContent = stylesheet
  parent.appendChild(style)
  return style
}
