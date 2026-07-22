import { TARGET_SELECTOR } from './dom'
import { placedSourceAddress } from './kachelfolge'

export const PROGRESSIVE_MARKER_SELECTOR =
  "[data-lia-kachelfolge-mode='progressive']"
export const PROGRESSIVE_VISIBLE_ATTRIBUTE =
  'data-lia-kachelfolge-visible'

/**
 * Keeps exactly one empty target available without disclosing the total target
 * count. A restored or moved tile is never hidden.
 */
export function progressiveVisibility(
  filledTargets: readonly boolean[],
): boolean[] {
  let emptyTargetShown = false

  return filledTargets.map((filled) => {
    if (filled) return true
    if (emptyTargetShown) return false

    emptyTargetShown = true
    return true
  })
}

export function progressiveVisibleCount(
  filledTargets: readonly boolean[],
): number {
  return progressiveVisibility(filledTargets).filter(Boolean).length
}

export function refreshProgressiveMarker(marker: Element): number {
  const targets = Array.from(
    marker.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
  )
  const filledTargets = targets.map(
    (target) => placedSourceAddress(target) !== null,
  )
  const visibleTargets = progressiveVisibility(filledTargets)

  targets.forEach((target, index) => {
    if (visibleTargets[index]) {
      target.setAttribute(PROGRESSIVE_VISIBLE_ATTRIBUTE, 'true')
    } else {
      target.removeAttribute(PROGRESSIVE_VISIBLE_ATTRIBUTE)
    }
  })

  return visibleTargets.filter(Boolean).length
}

function collectProgressiveMarkers(
  node: Node,
  markers: Set<Element>,
  includeDescendants = false,
): void {
  const element =
    node.nodeType === 1 ? (node as Element) : node.parentElement

  if (!element) return

  if (element.matches(PROGRESSIVE_MARKER_SELECTOR)) markers.add(element)

  const containingMarker = element.closest(PROGRESSIVE_MARKER_SELECTOR)
  if (containingMarker) markers.add(containingMarker)

  if (includeDescendants) {
    element
      .querySelectorAll(PROGRESSIVE_MARKER_SELECTOR)
      .forEach((marker) => markers.add(marker))
  }
}

export function refreshProgressiveKachelfolgen(
  ownerDocument: Document = document,
): void {
  if (typeof ownerDocument.querySelectorAll !== 'function') return

  ownerDocument
    .querySelectorAll(PROGRESSIVE_MARKER_SELECTOR)
    .forEach((marker) => refreshProgressiveMarker(marker))
}

/**
 * LiaScript re-renders native target children after every placement, removal
 * and restoration. Observing those native mutations is sufficient to derive
 * visibility; no drag, click, keyboard or touch path is intercepted here.
 */
export function installProgressiveKachelfolgen(
  ownerDocument: Document = document,
): () => void {
  refreshProgressiveKachelfolgen(ownerDocument)

  const MutationObserverConstructor =
    ownerDocument.defaultView?.MutationObserver
  const root = ownerDocument.documentElement

  if (!MutationObserverConstructor || !root) return () => undefined

  const view = ownerDocument.defaultView
  const pendingMarkers = new Set<Element>()
  let scheduledFrame: number | null = null
  let stopped = false
  const refreshAfterNativeUpdate = () => {
    if (stopped || scheduledFrame !== null) return

    if (!view?.requestAnimationFrame) {
      const markers = Array.from(pendingMarkers)
      pendingMarkers.clear()
      markers.forEach((marker) => {
        if (marker.isConnected) refreshProgressiveMarker(marker)
      })
      return
    }

    scheduledFrame = view.requestAnimationFrame(() => {
      scheduledFrame = null
      const markers = Array.from(pendingMarkers)
      pendingMarkers.clear()
      markers.forEach((marker) => {
        if (marker.isConnected) refreshProgressiveMarker(marker)
      })
    })
  }
  const observer = new MutationObserverConstructor((records) => {
    records.forEach((record) => {
      collectProgressiveMarkers(record.target, pendingMarkers)
      record.addedNodes.forEach((node) => {
        collectProgressiveMarkers(node, pendingMarkers, true)
      })
    })

    if (!pendingMarkers.size) return

    // Moving a native tile can produce several mutations. Reconcile once at
    // the next paint boundary so an intermediate double-occupied DOM cannot
    // expose an additional target for a single frame.
    refreshAfterNativeUpdate()
  })

  observer.observe(root, {
    attributeFilter: [
      'draggable',
      'onclick',
      'ondragend',
      'ondragover',
      'role',
    ],
    attributes: true,
    childList: true,
    subtree: true,
  })

  return () => {
    stopped = true

    if (scheduledFrame !== null && view?.cancelAnimationFrame) {
      view.cancelAnimationFrame(scheduledFrame)
    }

    pendingMarkers.clear()
    observer.disconnect()
  }
}
