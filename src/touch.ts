import {
  createDragTransfer,
  dispatchNativeDragEvent,
  findTargetAtPoint,
  findTouchSource,
  findVerticalScrollContainer,
  type Point,
  type TileSourceKind,
} from './dom'

const DRAG_THRESHOLD_SQUARED = 8 ** 2
const CLICK_SUPPRESSION_MS = 800
const EDGE_SCROLL_MIN_ZONE = 36
const EDGE_SCROLL_MAX_ZONE = 72
const EDGE_SCROLL_MAX_SPEED = 16

const ROOT_DRAGGING_CLASS = 'lia-kachel-touch-dragging'
const SOURCE_ACTIVE_CLASS = 'lia-kachel-touch-source-active'
const TARGET_ACTIVE_CLASS = 'lia-kachel-touch-target-active'
const GHOST_CLASS = 'lia-kachel-touch-ghost'

type InputMode = 'pointer' | 'touch'

interface Gesture {
  inputMode: InputMode
  inputId: number
  source: HTMLElement
  sourceKind: TileSourceKind
  trackKey: string
  origin: Point
  point: Point
  dragging: boolean
  completing: boolean
  target: HTMLElement | null
  ghost: HTMLElement | null
  dataTransfer: DataTransfer | null
  scrollContainer: HTMLElement
  frameId: number | null
  lastFrameTime: number | null
}

function touchById(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index)
    if (touch?.identifier === identifier) return touch
  }

  return null
}

function pointFromTouch(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY }
}

function sanitizeGhost(ghost: HTMLElement): void {
  const elements = [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]

  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name === 'id' ||
        attribute.name === 'role' ||
        attribute.name === 'tabindex' ||
        attribute.name === 'draggable' ||
        attribute.name === 'aria-grabbed' ||
        attribute.name.startsWith('on') ||
        attribute.name.startsWith('data-kf-')
      ) {
        element.removeAttribute(attribute.name)
      }
    }

    element.removeAttribute('href')
    element.removeAttribute('contenteditable')
    element.removeAttribute('autofocus')

    if (
      element.matches(
        'button, input, select, textarea, option, optgroup, fieldset',
      )
    ) {
      element.setAttribute('disabled', '')
    }
  }

  ghost.className = GHOST_CLASS
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
}

class TouchDragController {
  private readonly document: Document
  private readonly view: Window
  private readonly removeListeners: Array<() => void> = []
  private gesture: Gesture | null = null
  private suppressClicksUntil = 0
  private suppressedClickPoint: Point | null = null
  private destroyed = false

  constructor(document: Document) {
    const view = document.defaultView

    if (!view) {
      throw new Error('Touch drag-and-drop requires a browser window.')
    }

    this.document = document
    this.view = view
  }

  start(): () => void {
    if ('PointerEvent' in this.view) {
      this.listen(this.document, 'pointerdown', this.onPointerDown, true)
      this.listen(this.document, 'pointermove', this.onPointerMove, true)
      this.listen(this.document, 'pointerup', this.onPointerUp, true)
      this.listen(this.document, 'pointercancel', this.onPointerCancel, true)
    } else {
      this.listen(this.document, 'touchstart', this.onTouchStart, {
        capture: true,
        passive: true,
      })
      this.listen(this.document, 'touchmove', this.onTouchMove, {
        capture: true,
        passive: false,
      })
      this.listen(this.document, 'touchend', this.onTouchEnd, {
        capture: true,
        passive: false,
      })
      this.listen(this.document, 'touchcancel', this.onTouchCancel, true)
    }

    this.listen(this.document, 'click', this.onClick, true)
    this.listen(this.document, 'keydown', this.onKeyDown, true)
    this.listen(this.document, 'visibilitychange', this.onVisibilityChange)
    this.listen(this.view, 'blur', this.onSystemCancel)
    this.listen(this.view, 'hashchange', this.onSystemCancel)
    this.listen(this.view, 'pagehide', this.onSystemCancel)

    return () => this.destroy()
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options)
    this.removeListeners.push(() =>
      target.removeEventListener(type, listener, options),
    )
  }

  private destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.cancelGesture()

    for (const removeListener of this.removeListeners.splice(0)) {
      removeListener()
    }
  }

  private readonly onPointerDown = (event: Event): void => {
    const pointerEvent = event as PointerEvent
    const isTouchPointer =
      pointerEvent.pointerType === 'touch' || pointerEvent.pointerType === 'pen'

    if (!this.gesture) this.clearClickSuppression()
    if (!isTouchPointer) return

    if (
      this.gesture &&
      (this.gesture.inputMode !== 'pointer' ||
        this.gesture.inputId !== pointerEvent.pointerId)
    ) {
      this.cancelGesture()
      return
    }

    if (
      this.gesture ||
      !pointerEvent.isPrimary ||
      pointerEvent.button !== 0
    ) {
      return
    }

    const source = findTouchSource(pointerEvent.target)
    if (!source) return

    this.armGesture(
      'pointer',
      pointerEvent.pointerId,
      source.element,
      source.kind,
      source.trackKey,
      { x: pointerEvent.clientX, y: pointerEvent.clientY },
    )
  }

  private readonly onPointerMove = (event: Event): void => {
    const pointerEvent = event as PointerEvent
    const gesture = this.gesture

    if (
      !gesture ||
      gesture.inputMode !== 'pointer' ||
      gesture.inputId !== pointerEvent.pointerId ||
      gesture.completing
    ) {
      return
    }

    const isDragging = this.moveGesture({
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
    })

    if (isDragging && pointerEvent.cancelable) {
      pointerEvent.preventDefault()
    }
  }

  private readonly onPointerUp = (event: Event): void => {
    const pointerEvent = event as PointerEvent
    const gesture = this.gesture

    if (
      !gesture ||
      gesture.inputMode !== 'pointer' ||
      gesture.inputId !== pointerEvent.pointerId ||
      gesture.completing
    ) {
      return
    }

    const wasDragging = gesture.dragging
    this.finishGesture({
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
    })

    if (wasDragging && pointerEvent.cancelable) {
      pointerEvent.preventDefault()
    }
  }

  private readonly onPointerCancel = (event: Event): void => {
    const pointerEvent = event as PointerEvent
    const gesture = this.gesture

    if (
      gesture?.inputMode === 'pointer' &&
      gesture.inputId === pointerEvent.pointerId
    ) {
      this.cancelGesture()
    }
  }

  private readonly onTouchStart = (event: Event): void => {
    const touchEvent = event as TouchEvent

    if (!this.gesture) this.clearClickSuppression()

    if (touchEvent.touches.length > 1) {
      this.cancelGesture()
      return
    }

    if (this.gesture) return

    const touch = touchEvent.changedTouches.item(0)
    const source = findTouchSource(touchEvent.target)

    if (!touch || !source) return

    this.armGesture(
      'touch',
      touch.identifier,
      source.element,
      source.kind,
      source.trackKey,
      pointFromTouch(touch),
    )
  }

  private readonly onTouchMove = (event: Event): void => {
    const touchEvent = event as TouchEvent
    const gesture = this.gesture

    if (!gesture || gesture.inputMode !== 'touch' || gesture.completing) return

    if (touchEvent.touches.length > 1) {
      this.cancelGesture()
      return
    }

    const touch = touchById(touchEvent.touches, gesture.inputId)
    if (!touch) return

    const isDragging = this.moveGesture(pointFromTouch(touch))

    if (isDragging && touchEvent.cancelable) {
      touchEvent.preventDefault()
    }
  }

  private readonly onTouchEnd = (event: Event): void => {
    const touchEvent = event as TouchEvent
    const gesture = this.gesture

    if (!gesture || gesture.inputMode !== 'touch' || gesture.completing) return

    const touch = touchById(touchEvent.changedTouches, gesture.inputId)
    if (!touch) return

    const wasDragging = gesture.dragging
    this.finishGesture(pointFromTouch(touch))

    if (wasDragging && touchEvent.cancelable) {
      touchEvent.preventDefault()
    }
  }

  private readonly onTouchCancel = (event: Event): void => {
    const touchEvent = event as TouchEvent
    const gesture = this.gesture

    if (
      gesture?.inputMode === 'touch' &&
      touchById(touchEvent.changedTouches, gesture.inputId)
    ) {
      this.cancelGesture()
    }
  }

  private readonly onClick = (event: Event): void => {
    const mouseEvent = event as MouseEvent
    const point = this.suppressedClickPoint
    const isNearReleasePoint =
      point !== null &&
      Math.hypot(mouseEvent.clientX - point.x, mouseEvent.clientY - point.y) <=
        36

    if (
      mouseEvent.detail !== 0 &&
      this.now() <= this.suppressClicksUntil &&
      isNearReleasePoint
    ) {
      this.clearClickSuppression()
      mouseEvent.preventDefault()
      mouseEvent.stopImmediatePropagation()
    }
  }

  private readonly onKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent

    if (keyboardEvent.key === 'Escape' && this.gesture) {
      keyboardEvent.preventDefault()
      this.cancelGesture()
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'hidden') {
      this.cancelGesture()
    }
  }

  private readonly onSystemCancel = (): void => {
    this.cancelGesture()
  }

  private armGesture(
    inputMode: InputMode,
    inputId: number,
    source: HTMLElement,
    sourceKind: TileSourceKind,
    trackKey: string,
    point: Point,
  ): void {
    this.gesture = {
      inputMode,
      inputId,
      source,
      sourceKind,
      trackKey,
      origin: point,
      point,
      dragging: false,
      completing: false,
      target: null,
      ghost: null,
      dataTransfer: null,
      scrollContainer: findVerticalScrollContainer(source),
      frameId: null,
      lastFrameTime: null,
    }
  }

  private moveGesture(point: Point): boolean {
    const gesture = this.gesture
    if (!gesture) return false

    gesture.point = point

    if (!gesture.dragging) {
      const deltaX = point.x - gesture.origin.x
      const deltaY = point.y - gesture.origin.y
      const distanceSquared = deltaX ** 2 + deltaY ** 2

      if (distanceSquared < DRAG_THRESHOLD_SQUARED) return false
      if (!this.beginDrag(gesture)) return false
    }

    this.queueFrame(gesture)
    return true
  }

  private beginDrag(gesture: Gesture): boolean {
    if (!gesture.source.isConnected) {
      this.cleanupGesture(gesture)
      return false
    }

    gesture.dragging = true
    gesture.dataTransfer = createDragTransfer(this.document)
    gesture.ghost = this.createGhost(gesture.source, gesture.sourceKind)

    this.document.documentElement.classList.add(ROOT_DRAGGING_CLASS)
    gesture.source.classList.add(SOURCE_ACTIVE_CLASS)

    if (gesture.sourceKind === 'bank') {
      dispatchNativeDragEvent(
        gesture.source,
        'dragstart',
        gesture.point,
        gesture.dataTransfer,
      )
    }

    return true
  }

  private createGhost(
    source: HTMLElement,
    sourceKind: TileSourceKind,
  ): HTMLElement {
    const ghost = source.cloneNode(true) as HTMLElement
    const sourceRect = source.getBoundingClientRect()
    const paintSource =
      sourceKind === 'placed' ? (source.parentElement ?? source) : source
    const paintStyle = this.view.getComputedStyle(paintSource)

    sanitizeGhost(ghost)
    ghost.style.setProperty('--lia-kachel-ghost-color', paintStyle.color)
    ghost.style.setProperty(
      '--lia-kachel-ghost-background',
      paintStyle.backgroundColor,
    )
    ghost.style.width = `${Math.ceil(sourceRect.width)}px`
    ghost.style.minHeight = `${Math.ceil(sourceRect.height)}px`

    this.document.body.append(ghost)
    return ghost
  }

  private queueFrame(gesture: Gesture): void {
    if (gesture.frameId !== null) return

    gesture.frameId = this.view.requestAnimationFrame((timestamp) => {
      gesture.frameId = null

      if (this.gesture !== gesture || gesture.completing) return
      if (!gesture.source.isConnected) {
        this.cancelGesture()
        return
      }

      this.positionGhost(gesture)
      this.updateVisualTarget(gesture)

      if (this.autoScroll(gesture, timestamp)) {
        this.queueFrame(gesture)
      }
    })
  }

  private positionGhost(gesture: Gesture): void {
    const ghost = gesture.ghost
    if (!ghost) return

    const gap = 18
    const width = ghost.offsetWidth
    const height = ghost.offsetHeight
    const maxX = Math.max(8, this.view.innerWidth - width - 8)
    const x = Math.min(Math.max(8, gesture.point.x + gap), maxX)
    const aboveFinger = gesture.point.y - height - gap
    const belowFinger = gesture.point.y + gap
    const y =
      aboveFinger >= 8
        ? aboveFinger
        : Math.min(
            belowFinger,
            Math.max(8, this.view.innerHeight - height - 8),
          )

    ghost.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
      y,
    )}px, 0)`
  }

  private updateVisualTarget(gesture: Gesture): void {
    const target = findTargetAtPoint(
      this.document,
      gesture.point,
      gesture.trackKey,
    )

    if (target === gesture.target) return

    gesture.target?.classList.remove(TARGET_ACTIVE_CLASS)
    gesture.target = target
    gesture.target?.classList.add(TARGET_ACTIVE_CLASS)
  }

  private autoScroll(gesture: Gesture, timestamp: number): boolean {
    const container = gesture.scrollContainer
    const isDocumentScroller =
      container === this.document.scrollingElement ||
      container === this.document.documentElement ||
      container === this.document.body
    const bounds = isDocumentScroller
      ? { top: 0, bottom: this.view.innerHeight }
      : container.getBoundingClientRect()
    const visibleTop = Math.max(0, bounds.top)
    const visibleBottom = Math.min(this.view.innerHeight, bounds.bottom)
    const visibleHeight = visibleBottom - visibleTop

    if (visibleHeight <= 0) {
      gesture.lastFrameTime = null
      return false
    }

    const edgeZone = Math.min(
      EDGE_SCROLL_MAX_ZONE,
      Math.max(EDGE_SCROLL_MIN_ZONE, visibleHeight * 0.18),
    )
    const topEdge = visibleTop + edgeZone
    const bottomEdge = visibleBottom - edgeZone
    let speed = 0

    if (gesture.point.y < topEdge) {
      speed =
        -EDGE_SCROLL_MAX_SPEED *
        Math.min(1, (topEdge - gesture.point.y) / edgeZone)
    } else if (gesture.point.y > bottomEdge) {
      speed =
        EDGE_SCROLL_MAX_SPEED *
        Math.min(1, (gesture.point.y - bottomEdge) / edgeZone)
    }

    if (Math.abs(speed) < 0.5) {
      gesture.lastFrameTime = null
      return false
    }

    const frameDuration =
      gesture.lastFrameTime === null
        ? 1000 / 60
        : Math.min(32, Math.max(0, timestamp - gesture.lastFrameTime))
    gesture.lastFrameTime = timestamp
    const previousScrollTop = container.scrollTop
    container.scrollTop += speed * (frameDuration / (1000 / 60))
    const didScroll = container.scrollTop !== previousScrollTop

    if (!didScroll) gesture.lastFrameTime = null
    return didScroll
  }

  private finishGesture(point: Point): void {
    const gesture = this.gesture
    if (!gesture) return

    gesture.point = point

    if (!gesture.dragging) {
      this.cleanupGesture(gesture)
      return
    }

    gesture.completing = true
    this.suppressNextClickAt(gesture.point)

    if (gesture.frameId !== null) {
      this.view.cancelAnimationFrame(gesture.frameId)
      gesture.frameId = null
    }

    this.positionGhost(gesture)
    this.updateVisualTarget(gesture)

    if (gesture.target) {
      dispatchNativeDragEvent(
        gesture.target,
        'dragover',
        gesture.point,
        gesture.dataTransfer,
      )

      gesture.frameId = this.view.requestAnimationFrame(() => {
        gesture.frameId = null
        this.completeDrop(gesture)
      })
      return
    }

    this.completeDrop(gesture)
  }

  private completeDrop(gesture: Gesture): void {
    if (this.gesture !== gesture) return

    dispatchNativeDragEvent(
      gesture.source,
      'dragend',
      gesture.point,
      gesture.dataTransfer,
    )
    this.cleanupGesture(gesture)
  }

  private cancelGesture(): void {
    const gesture = this.gesture
    if (!gesture) return

    if (gesture.completing) {
      this.completeDrop(gesture)
      return
    }

    if (gesture.dragging) {
      this.suppressNextClickAt(gesture.point)

      if (gesture.sourceKind === 'bank') {
        dispatchNativeDragEvent(
          gesture.source,
          'dragend',
          gesture.point,
          gesture.dataTransfer,
        )
      }
    }

    this.cleanupGesture(gesture)
  }

  private cleanupGesture(gesture: Gesture): void {
    if (gesture.frameId !== null) {
      this.view.cancelAnimationFrame(gesture.frameId)
    }

    gesture.source.classList.remove(SOURCE_ACTIVE_CLASS)
    gesture.target?.classList.remove(TARGET_ACTIVE_CLASS)
    gesture.ghost?.remove()
    this.document.documentElement.classList.remove(ROOT_DRAGGING_CLASS)

    if (this.gesture === gesture) {
      this.gesture = null
    }
  }

  private now(): number {
    return this.view.performance?.now() ?? Date.now()
  }

  private suppressNextClickAt(point: Point): void {
    this.suppressClicksUntil = this.now() + CLICK_SUPPRESSION_MS
    this.suppressedClickPoint = { ...point }
  }

  private clearClickSuppression(): void {
    this.suppressClicksUntil = 0
    this.suppressedClickPoint = null
  }
}

export function installTouchDragAndDrop(
  document: Document = window.document,
): () => void {
  return new TouchDragController(document).start()
}
