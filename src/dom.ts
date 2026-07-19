export const TARGET_SELECTOR =
  "span[role='button'][onclick*='dragtarget'][ondragover*='dragenter']"

export const BANK_SOURCE_SELECTOR =
  "span[role='button'][aria-grabbed][draggable='true'][ondragstart*='dragstart'][ondragend*='dragend']"

export const PLACED_SOURCE_SELECTOR =
  `${TARGET_SELECTOR} > [draggable='true'][ondragend*='dragend']`

const PLACED_SOURCE_CHILD_SELECTOR =
  ":scope > [draggable='true'][ondragend*='dragend']"

export const TOUCH_SOURCE_SELECTOR =
  `${BANK_SOURCE_SELECTOR}, ${PLACED_SOURCE_SELECTOR}`

export type TileSourceKind = 'bank' | 'placed'
export type NativeDragEventName = 'dragstart' | 'dragover' | 'dragend'

export interface Point {
  x: number
  y: number
}

const TRACK_PATTERN = /track\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/

function eventTargetAsElement(target: EventTarget | null): Element | null {
  const node = target as Node | null

  if (!node) return null
  if (node.nodeType === 1) return node as Element

  return node.parentElement
}

export function trackKeyFromHandler(handler: string | null): string | null {
  const serializedTrack = handler?.match(TRACK_PATTERN)?.[1]

  if (!serializedTrack) return null

  try {
    return JSON.stringify(JSON.parse(serializedTrack))
  } catch {
    return null
  }
}

export function sourceKind(source: HTMLElement): TileSourceKind | null {
  if (source.matches(BANK_SOURCE_SELECTOR)) return 'bank'
  if (source.matches(PLACED_SOURCE_SELECTOR)) return 'placed'

  return null
}

export function findTouchSource(
  target: EventTarget | null,
): { element: HTMLElement; kind: TileSourceKind; trackKey: string } | null {
  const eventElement = eventTargetAsElement(target)
  const directSource =
    eventElement?.closest<HTMLElement>(TOUCH_SOURCE_SELECTOR) ?? null
  const filledTarget =
    eventElement?.closest<HTMLElement>(TARGET_SELECTOR) ?? null
  const candidate =
    directSource ??
    filledTarget?.querySelector<HTMLElement>(PLACED_SOURCE_CHILD_SELECTOR) ??
    null

  if (!candidate?.isConnected) return null

  const kind = sourceKind(candidate)
  const trackKey = trackKeyFromHandler(
    candidate.getAttribute('ondragend'),
  )

  if (!kind || !trackKey) return null

  return { element: candidate, kind, trackKey }
}

export function findTargetAtPoint(
  document: Document,
  point: Point,
  trackKey: string,
): HTMLElement | null {
  const hit = document.elementFromPoint(point.x, point.y)
  const target = hit?.closest<HTMLElement>(TARGET_SELECTOR) ?? null

  if (!target?.isConnected) return null

  const targetTrack = trackKeyFromHandler(
    target.getAttribute('ondragover'),
  )

  return targetTrack === trackKey ? target : null
}

export function findVerticalScrollContainer(
  source: HTMLElement,
): HTMLElement {
  const document = source.ownerDocument
  const view = document.defaultView

  if (view) {
    for (
      let ancestor = source.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const overflowY = view.getComputedStyle(ancestor).overflowY
      const canScroll = /^(auto|scroll|overlay)$/.test(overflowY)

      if (canScroll && ancestor.scrollHeight > ancestor.clientHeight + 1) {
        return ancestor
      }
    }
  }

  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}

export function createDragTransfer(document: Document): DataTransfer | null {
  const DataTransferConstructor = document.defaultView?.DataTransfer

  if (!DataTransferConstructor) return null

  try {
    return new DataTransferConstructor()
  } catch {
    return null
  }
}

export function dispatchNativeDragEvent(
  target: HTMLElement,
  type: NativeDragEventName,
  point: Point,
  dataTransfer: DataTransfer | null,
): boolean {
  const document = target.ownerDocument
  const view = document.defaultView
  const eventInit: DragEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    dataTransfer,
  }

  let event: Event

  try {
    if (!view?.DragEvent) throw new Error('DragEvent is unavailable')
    event = new view.DragEvent(type, eventInit)
  } catch {
    const EventConstructor = view?.Event ?? Event
    event = new EventConstructor(type, {
      bubbles: eventInit.bubbles,
      cancelable: eventInit.cancelable,
    })

    try {
      Object.defineProperties(event, {
        clientX: { configurable: true, value: point.x },
        clientY: { configurable: true, value: point.y },
        dataTransfer: { configurable: true, value: dataTransfer },
      })
    } catch {
      // LiaScript's inline handlers do not inspect these optional properties.
    }
  }

  return target.dispatchEvent(event)
}
