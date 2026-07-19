import { TARGET_SELECTOR, trackKeyFromHandler } from './dom'
import {
  placedSourceAddress,
  sourceAddressFromHandler,
  type SourceAddress,
} from './kachelfolge'

export const KACHEL_REGION_SELECTOR = 'div.Kachel'

const NATIVE_SOURCE_SELECTOR = "[draggable='true'][ondragend*='dragend']"
const NATIVE_CHECK_SELECTOR = '.lia-quiz__check'
const warnedMessages = new Set<string>()

type UnknownRecord = Record<PropertyKey, unknown>
type LiaSend = (payload: unknown, ...rest: unknown[]) => unknown

export interface ContentSource {
  address: SourceAddress
  content: string
}

export interface ContentTargetState {
  address: SourceAddress | null
  content: string
}

interface KachelQuizContract {
  checkButton: HTMLElement
  correctAddresses: SourceAddress[]
  region: HTMLElement
  root: Element
  targets: HTMLElement[]
  track: unknown
  trackKey: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  )
}

function addressKey([origin, option]: SourceAddress): string {
  return String(origin) + ':' + String(option)
}

function sameAddress(
  left: SourceAddress | null,
  right: SourceAddress | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left[0] === right[0] &&
      left[1] === right[1],
  )
}


function targetIdFromHandler(handler: string | null): number | null {
  const match = handler?.match(/param\s*:\s*\{[^}]*id\s*:\s*(-?\d+)/i)
  if (!match) return null

  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}

function nativeTrackFromHandler(handler: string | null): unknown | null {
  const serialized = handler?.match(
    /track\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/,
  )?.[1]

  if (!serialized) return null

  try {
    return JSON.parse(serialized) as unknown
  } catch {
    return null
  }
}

export function normalizeTileContent(value: unknown): string {
  const plain = String(value ?? '').replace(/\u00a0/g, ' ')
  const unicode = plain.normalize ? plain.normalize('NFC') : plain

  return unicode.replace(/\s+/g, ' ').trim()
}

export function renderedTileContent(source: Element): string {
  const text = normalizeTileContent(source.textContent)
  if (text) return text

  const imageText = Array.from(source.querySelectorAll('img[alt]'))
    .map((image) => normalizeTileContent(image.getAttribute('alt')))
    .filter(Boolean)
    .join(' ')

  if (imageText) return imageText

  return normalizeTileContent(source.getAttribute('aria-label'))
}

export function sameTargetContents(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  if (expected.length !== actual.length || !expected.length) return false

  return expected.every((value, index) => {
    const expectedContent = normalizeTileContent(value)
    const actualContent = normalizeTileContent(actual[index])

    return (
      expectedContent.length > 0 &&
      actualContent.length > 0 &&
      expectedContent === actualContent
    )
  })
}

function elmListValues(value: unknown, maximum = 4096): unknown[] | null {
  const values: unknown[] = []
  const seen = new Set<unknown>()
  let cursor = value

  while (isRecord(cursor) && cursor.$ === 1) {
    if (seen.has(cursor) || values.length >= maximum) return null
    seen.add(cursor)
    values.push(cursor.a)
    cursor = cursor.b
  }

  return isRecord(cursor) && cursor.$ === 0 ? values : null
}

function flattenElmArrayTree(
  node: unknown,
  output: unknown[],
  maximum: number,
): boolean {
  if (output.length > maximum) return false

  if (
    isRecord(node) &&
    (node.$ === 0 || node.$ === 1) &&
    Array.isArray(node.a)
  ) {
    for (const child of node.a) {
      if (!flattenElmArrayTree(child, output, maximum)) return false
    }
    return true
  }

  output.push(node)
  return output.length <= maximum
}

/** Decode Elm's persistent Array without relying on its current minified path. */
function elmArrayValues(value: unknown, maximum = 4096): unknown[] | null {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.a) ||
    Number(value.a) < 0 ||
    Number(value.a) > maximum ||
    !Array.isArray(value.c) ||
    !Array.isArray(value.d)
  ) {
    return null
  }

  const expectedLength = Number(value.a)
  const values: unknown[] = []

  for (const node of value.c) {
    if (!flattenElmArrayTree(node, values, maximum)) return null
  }
  values.push(...value.d)

  return values.length === expectedLength ? values : null
}

function solutionIndexesFromState(
  value: unknown,
  optionCounts: readonly number[],
): number[] | null {
  const states = elmArrayValues(value)
  if (!states || states.length !== optionCounts.length) {
    return null
  }

  const indexes: number[] = []

  for (let target = 0; target < optionCounts.length; target += 1) {
    const state = states[target]
    if (!isRecord(state)) return null

    const selected = elmListValues(state.c)
    if (selected?.length !== 1) return null

    const option = Number(selected[0])
    if (
      !Number.isSafeInteger(option) ||
      option < 0 ||
      option >= optionCounts[target]
    ) {
      return null
    }

    indexes.push(option)
  }

  return indexes
}

function isOptionsState(
  value: unknown,
  optionCounts: readonly number[],
): boolean {
  const optionsByTarget = elmArrayValues(value)
  if (!optionsByTarget || optionsByTarget.length !== optionCounts.length) {
    return false
  }

  return optionCounts.every((count, target) => {
    const options = elmListValues(optionsByTarget[target])
    return options?.length === count
  })
}

/**
 * The native check listener already contains the compiled Multi-Drop model.
 * Minified property names are ignored; only the validated options/solution
 * shape is accepted. If LiaScript changes that shape, grading fails closed.
 */
export function extractCorrectOptionIndexes(
  checkButton: Element,
  optionCounts: readonly number[],
): number[] | null {
  const button = checkButton as Element & {
    elmFs?: { click?: unknown }
  }
  const click = button.elmFs?.click
  if (!isRecord(click) || !optionCounts.length) return null

  const roots = Object.getOwnPropertyNames(click)
    .map((key) => {
      try {
        return click[key]
      } catch {
        return null
      }
    })
    .filter(isRecord)

  if (!roots.length) roots.push(click)

  const seen = new Set<unknown>()
  const stack: Array<{ depth: number; value: UnknownRecord }> = roots.map(
    (value) => ({ depth: 0, value }),
  )
  const candidates = new Map<string, number[]>()
  let visited = 0

  while (stack.length && visited < 10000) {
    const entry = stack.pop()
    if (!entry || seen.has(entry.value)) continue

    seen.add(entry.value)
    visited += 1

    const children = Object.getOwnPropertyNames(entry.value)
      .map((key) => {
        try {
          return entry.value[key]
        } catch {
          return null
        }
      })
      .filter(isRecord)

    for (const child of children) {
      const indexes = solutionIndexesFromState(child, optionCounts)
      if (!indexes) continue

      const hasMatchingOptions = children.some(
        (sibling) => sibling !== child && isOptionsState(sibling, optionCounts),
      )
      if (hasMatchingOptions) candidates.set(indexes.join(','), indexes)
    }

    if (entry.depth >= 18) continue
    children.forEach((child) => {
      if (!seen.has(child)) {
        stack.push({ depth: entry.depth + 1, value: child })
      }
    })
  }

  return candidates.size === 1
    ? Array.from(candidates.values())[0]
    : null
}

export function planContentAssignments(
  correctAddresses: readonly SourceAddress[],
  sources: readonly ContentSource[],
  targets: readonly ContentTargetState[],
): Array<SourceAddress | null> | null {
  if (
    !correctAddresses.length ||
    correctAddresses.length !== targets.length
  ) {
    return null
  }

  const contentByAddress = new Map<string, string>()
  const sourcesByContent = new Map<string, SourceAddress[]>()

  sources.forEach(({ address, content }) => {
    const normalized = normalizeTileContent(content)
    if (!normalized) return

    const key = addressKey(address)
    if (contentByAddress.has(key)) return

    contentByAddress.set(key, normalized)
    const bucket = sourcesByContent.get(normalized) ?? []
    bucket.push(address)
    sourcesByContent.set(normalized, bucket)
  })

  const assignments: Array<SourceAddress | null> = targets.map(() => null)
  const used = new Set<string>()

  for (let target = 0; target < targets.length; target += 1) {
    const state = targets[target]
    if (!state.address) continue

    const actual = normalizeTileContent(state.content)
    const correctAddress = correctAddresses[target]
    const expected = contentByAddress.get(addressKey(correctAddress)) ?? ''

    if (!actual || actual !== expected) continue
    if (!contentByAddress.has(addressKey(correctAddress))) return null

    assignments[target] = correctAddress
    used.add(addressKey(correctAddress))
  }

  for (let target = 0; target < targets.length; target += 1) {
    const state = targets[target]
    if (!state.address || assignments[target]) continue

    const actual = normalizeTileContent(state.content)
    if (!actual) return null

    const preferredKey = addressKey(state.address)
    let assignment: SourceAddress | null = null

    if (
      !used.has(preferredKey) &&
      contentByAddress.get(preferredKey) === actual
    ) {
      assignment = state.address
    } else {
      assignment =
        (sourcesByContent.get(actual) ?? []).find(
          (address) => !used.has(addressKey(address)),
        ) ?? null
    }

    if (!assignment) return null
    assignments[target] = assignment
    used.add(addressKey(assignment))
  }

  return assignments
}

function inputPayload(
  track: unknown,
  cmd: string,
  id: number,
  value: unknown,
): UnknownRecord {
  return {
    reply: true,
    service: 'input',
    track,
    message: {
      cmd,
      param: {
        id,
        value,
      },
    },
  }
}

function reportProblem(key: string, message: string): void {
  const warning = '[lia-Kachel .Kachel ' + key + '] ' + message
  if (warnedMessages.has(warning)) return

  warnedMessages.add(warning)
  console.error(warning)
}

class KachelRegionController {
  private readonly ownerDocument: Document
  private readonly view: Window & typeof globalThis
  private readonly contracts = new Map<Element, KachelQuizContract>()
  private readonly contractsByButton = new WeakMap<HTMLElement, KachelQuizContract>()
  private readonly solutions = new WeakMap<HTMLElement, Map<string, SourceAddress[]>>()
  private readonly processingRoots = new Set<Element>()
  private readonly reentryButtons = new WeakSet<HTMLElement>()
  private readonly pendingRegions = new Set<HTMLElement>()
  private readonly timeouts: number[] = []
  private observer: MutationObserver | null = null
  private frame: number | null = null
  private stopped = false

  constructor(ownerDocument: Document) {
    const view = ownerDocument.defaultView
    if (!view) throw new Error('.Kachel regions require a browser window.')

    this.ownerDocument = ownerDocument
    this.view = view
  }

  start(): () => void {
    this.refreshAll()
    this.installObserver()
    this.ownerDocument.addEventListener('click', this.onCheckClick, true)

    if (typeof this.view.setTimeout === 'function') {
      ;[0, 50, 250, 1000].forEach((delay) => {
        this.timeouts.push(
          this.view.setTimeout(() => {
            if (this.stopped) return
            this.refreshAll()
          }, delay),
        )
      })
    }

    return () => this.destroy()
  }

  refreshAll(): void {
    if (typeof this.ownerDocument.querySelectorAll !== 'function') return

    this.ownerDocument
      .querySelectorAll<HTMLElement>(KACHEL_REGION_SELECTOR)
      .forEach((region) => this.refreshRegion(region))

    for (const [root, contract] of this.contracts) {
      if (!contract.root.isConnected || !contract.region.isConnected) {
        this.contracts.delete(root)
        this.processingRoots.delete(root)
      }
    }
  }

  private refreshRegion(region: HTMLElement): void {
    const groupedTargets = new Map<Element, HTMLElement[]>()

    region.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach((target) => {
      if (target.closest(KACHEL_REGION_SELECTOR) !== region) return

      const root = target.closest('p')?.parentElement ?? null
      if (!root || !region.contains(root)) return

      const targets = groupedTargets.get(root) ?? []
      targets.push(target)
      groupedTargets.set(root, targets)
    })

    groupedTargets.forEach((unsortedTargets, root) => {
      const trackKeys = new Set(
        unsortedTargets
          .map((target) =>
            trackKeyFromHandler(target.getAttribute('ondragover')),
          )
          .filter((key): key is string => Boolean(key)),
      )
      if (trackKeys.size !== 1) {
        reportProblem('region', 'Ein Quizcontainer enth\u00e4lt uneindeutige Tracks.')
        return
      }
      const trackKey = Array.from(trackKeys)[0]
      const targetsById = new Map<number, HTMLElement>()

      unsortedTargets.forEach((target) => {
        const id = targetIdFromHandler(target.getAttribute('ondragover'))
        if (id !== null && !targetsById.has(id)) targetsById.set(id, target)
      })

      const targets = Array.from(targetsById.entries())
        .sort(([left], [right]) => left - right)
        .map(([, target]) => target)

      if (
        !targets.length ||
        targets.some((target, id) =>
          targetIdFromHandler(target.getAttribute('ondragover')) !== id,
        )
      ) {
        reportProblem(
          trackKey,
          'Die nativen Targets konnten nicht eindeutig geordnet werden.',
        )
        return
      }

      const checkButton = root.querySelector<HTMLElement>(NATIVE_CHECK_SELECTOR)
      if (!checkButton) {
        reportProblem(trackKey, 'Der native Prüfen-Button wurde nicht gefunden.')
        return
      }

      const track = nativeTrackFromHandler(
        targets[0].getAttribute('ondragover'),
      )
      if (!track) return

      let regionSolutions = this.solutions.get(region)
      if (!regionSolutions) {
        regionSolutions = new Map<string, SourceAddress[]>()
        this.solutions.set(region, regionSolutions)
      }
      const cachedAddresses = regionSolutions.get(trackKey) ?? null

      const sources = this.sourcesFor(root, trackKey)
      const optionCounts = targets.map(() => 0)

      sources.forEach(({ address }) => {
        if (address[0] < 0 || address[0] >= optionCounts.length) return
        optionCounts[address[0]] = Math.max(
          optionCounts[address[0]],
          address[1] + 1,
        )
      })

      if (optionCounts.some((count) => count < 1) && !cachedAddresses) {
        reportProblem(trackKey, 'Nicht alle nativen Quelloptionen wurden gefunden.')
        return
      }

      const correctOptions = optionCounts.every((count) => count > 0)
        ? extractCorrectOptionIndexes(checkButton, optionCounts)
        : null

      if (!correctOptions && !cachedAddresses) {
        reportProblem(
          trackKey,
          'Die native Multi-Drop-Lösung ist nicht verfügbar; die Standardauswertung bleibt aktiv.',
        )
        return
      }

      const correctAddresses: SourceAddress[] = correctOptions
        ? correctOptions.map((option, target) => [target, option] as const)
        : [...(cachedAddresses ?? [])]
      if (correctAddresses.length !== targets.length) {
        reportProblem(trackKey, 'Die gespeicherte native L\u00f6sung passt nicht zu den Targets.')
        return
      }
      const available = new Set(sources.map(({ address }) => addressKey(address)))

      if (
        correctOptions &&
        correctAddresses.some(
          (address) => !available.has(addressKey(address)),
        )
      ) {
        reportProblem(trackKey, 'Eine native richtige Quelloption fehlt im Quiz.')
        return
      }

      if (correctOptions) {
        regionSolutions.set(trackKey, [...correctAddresses])
      }

      const contract: KachelQuizContract = {
        checkButton,
        correctAddresses,
        region,
        root,
        targets,
        track,
        trackKey,
      }

      this.contracts.set(root, contract)
      this.contractsByButton.set(checkButton, contract)
    })
  }

  private targetsFor(contract: KachelQuizContract): HTMLElement[] {
    const candidates = Array.from(
      contract.region.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
    ).filter(
      (target) =>
        target.closest(KACHEL_REGION_SELECTOR) === contract.region &&
        trackKeyFromHandler(target.getAttribute('ondragover')) ===
          contract.trackKey,
    )
    const targetsById = new Map<number, HTMLElement>()

    candidates.forEach((target) => {
      const id = targetIdFromHandler(target.getAttribute('ondragover'))
      if (id !== null && !targetsById.has(id)) targetsById.set(id, target)
    })

    const targets = Array.from(targetsById.entries())
      .sort(([left], [right]) => left - right)
      .map(([, target]) => target)

    return candidates.length === contract.correctAddresses.length &&
      targets.length === contract.correctAddresses.length &&
      targets.every(
        (target, id) =>
          targetIdFromHandler(target.getAttribute('ondragover')) === id,
      )
      ? targets
      : []
  }

  private rootFor(contract: KachelQuizContract): Element | null {
    const targets = this.targetsFor(contract)
    const root = targets[0]?.closest('p')?.parentElement ?? null

    return root && targets.every((target) => root.contains(target))
      ? root
      : null
  }

  private sourcesFor(
    root: Element,
    trackKey: string,
    region?: HTMLElement,
  ): ContentSource[] {
    const sources = new Map<string, ContentSource>()

    root
      .querySelectorAll<HTMLElement>(NATIVE_SOURCE_SELECTOR)
      .forEach((source) => {
        if (region && source.closest(KACHEL_REGION_SELECTOR) !== region) return

        const handler = source.getAttribute('ondragend')
        if (trackKeyFromHandler(handler) !== trackKey) return

        const address = sourceAddressFromHandler(handler)
        const content = renderedTileContent(source)
        if (!address || !content) return

        const key = addressKey(address)
        if (!sources.has(key)) sources.set(key, { address, content })
      })

    return Array.from(sources.values())
  }

  private statesFor(contract: KachelQuizContract): ContentTargetState[] {
    return this.targetsFor(contract).map((target) => {
      const address = placedSourceAddress(target)
      const placed = Array.from(target.children).find((child) =>
        sourceAddressFromHandler(child.getAttribute('ondragend')),
      )

      return {
        address,
        content: placed ? renderedTileContent(placed) : '',
      }
    })
  }

  private runtimeSend(): { owner: UnknownRecord; send: LiaSend } | null {
    const runtime = this.view as unknown as UnknownRecord
    const lia = runtime.LIA

    return isRecord(lia) && typeof lia.send === 'function'
      ? { owner: lia, send: lia.send as LiaSend }
      : null
  }

  private readonly onCheckClick = (event: Event): void => {
    const node = event.target as Node | null
    const eventElement =
      node?.nodeType === 1 ? (node as Element) : node?.parentElement ?? null
    const button =
      eventElement?.closest<HTMLElement>(NATIVE_CHECK_SELECTOR) ?? null
    const region =
      button?.closest<HTMLElement>(KACHEL_REGION_SELECTOR) ?? null

    if (!button || !region) return

    if (this.reentryButtons.has(button)) {
      this.reentryButtons.delete(button)
      return
    }

    let contract = this.contractsByButton.get(button)
    if (!contract || contract.region !== region || !contract.root.isConnected) {
      this.refreshRegion(region)
      contract = this.contractsByButton.get(button)
    }

    // Unknown or changed LiaScript internals fail open to the native identity
    // check. No learner input is touched in that case.
    if (!contract) return

    if (this.processingRoots.has(contract.root)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    const sources = this.sourcesFor(
      contract.region,
      contract.trackKey,
      contract.region,
    )
    const states = this.statesFor(contract)
    const assignments = planContentAssignments(
      contract.correctAddresses,
      sources,
      states,
    )

    if (!assignments) return

    const needsNormalization = assignments.some(
      (address, target) => {
        const current = states[target].address
        return !((address === null && current === null) || sameAddress(address, current))
      },
    )
    if (!needsNormalization) return

    const runtime = this.runtimeSend()
    if (!runtime) {
      reportProblem(
        contract.trackKey,
        'Die LiaScript-Eingabeschnittstelle ist nicht verf\u00fcgbar; die Standardauswertung bleibt aktiv.',
      )
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    this.processingRoots.add(contract.root)

    void this.normalizeAssignments(
      contract,
      states,
      assignments,
      runtime,
    )
      .catch((error) => {
        reportProblem(
          contract.trackKey,
          'Inhaltszuordnung fehlgeschlagen: ' + String(error),
        )
      })
      .finally(() => {
        this.clickNativeCheck(contract)
        this.processingRoots.delete(contract.root)
      })
  }

  private sendInput(
    runtime: { owner: UnknownRecord; send: LiaSend },
    contract: KachelQuizContract,
    cmd: string,
    id: number,
    value: unknown,
  ): void {
    runtime.send.call(
      runtime.owner,
      inputPayload(contract.track, cmd, id, value),
    )
  }

  private async waitFor(
    predicate: () => boolean,
    description: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (predicate()) return

      await new Promise<void>((resolve) => {
        if (typeof this.view.setTimeout === 'function') {
          this.view.setTimeout(resolve, 16)
        } else if (this.view.requestAnimationFrame) {
          this.view.requestAnimationFrame(() => resolve())
        } else resolve()
      })
    }

    throw new Error(description)
  }

  private async normalizeAssignments(
    contract: KachelQuizContract,
    current: readonly ContentTargetState[],
    assignments: readonly (SourceAddress | null)[],
    runtime: { owner: UnknownRecord; send: LiaSend },
  ): Promise<void> {
    const initialTargets = this.targetsFor(contract)
    if (initialTargets.length !== assignments.length) {
      throw new Error('Die nativen Targets sind w\u00e4hrend der Auswertung nicht verf\u00fcgbar.')
    }

    initialTargets.forEach((_, target) => {
      this.sendInput(runtime, contract, 'dragenter', target, false)
    })

    const cleared = new Set<string>()
    for (const { address } of current) {
      if (!address || cleared.has(addressKey(address))) continue
      cleared.add(addressKey(address))

      this.sendInput(runtime, contract, 'dragend', address[0], [...address])
      await this.waitFor(
        () => {
          const targets = this.targetsFor(contract)
          return (
            targets.length === assignments.length &&
            targets.every(
            (target) => !sameAddress(placedSourceAddress(target), address),
            )
          )
        },
        'Eine belegte Kachel konnte nicht gel\u00f6st werden.',
      )
    }

    for (let target = 0; target < assignments.length; target += 1) {
      const address = assignments[target]
      if (!address) continue

      this.sendInput(runtime, contract, 'dragenter', target, true)
      this.sendInput(runtime, contract, 'dragend', address[0], [...address])
      await this.waitFor(
        () => {
          const targets = this.targetsFor(contract)
          return (
            targets.length === assignments.length &&
            sameAddress(placedSourceAddress(targets[target]), address)
          )
        },
        `Kachel ${String(target + 1)} konnte nicht zugeordnet werden.`,
      )
    }
  }

  private clickNativeCheck(contract: KachelQuizContract): void {
    const button =
      this.rootFor(contract)?.querySelector<HTMLElement>(NATIVE_CHECK_SELECTOR) ??
      null

    if (!button) {
      reportProblem(
        contract.trackKey,
        'Der native Pr\u00fcfen-Button ist vor der Auswertung verschwunden.',
      )
      return
    }

    this.reentryButtons.add(button)
    button.click()
  }

  private installObserver(): void {
    const MutationObserverConstructor = this.view.MutationObserver
    const root = this.ownerDocument.documentElement
    if (!MutationObserverConstructor || !root) return

    const observer = new MutationObserverConstructor((records) => {
      records.forEach((record) => {
        const mutationElement =
          record.target.nodeType === 1
            ? (record.target as Element)
            : record.target.parentElement
        const containingRegion =
          mutationElement?.closest<HTMLElement>(KACHEL_REGION_SELECTOR) ?? null

        if (containingRegion) this.pendingRegions.add(containingRegion)

        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return
          const element = node as Element

          if (element.matches(KACHEL_REGION_SELECTOR)) {
            this.pendingRegions.add(element as HTMLElement)
          }

          element
            .querySelectorAll<HTMLElement>(KACHEL_REGION_SELECTOR)
            .forEach((region) => this.pendingRegions.add(region))
        })
      })

      if (this.pendingRegions.size) this.scheduleRefresh()
    })

    observer.observe(root, { childList: true, subtree: true })
    this.observer = observer
  }

  private scheduleRefresh(): void {
    if (this.frame !== null) return

    if (!this.view.requestAnimationFrame) {
      const regions = Array.from(this.pendingRegions)
      this.pendingRegions.clear()
      regions.forEach((region) => {
        if (region.isConnected) this.refreshRegion(region)
      })
      return
    }

    this.frame = this.view.requestAnimationFrame(() => {
      this.frame = null
      const regions = Array.from(this.pendingRegions)
      this.pendingRegions.clear()
      regions.forEach((region) => {
        if (region.isConnected) this.refreshRegion(region)
      })
    })
  }

  private destroy(): void {
    if (this.stopped) return
    this.stopped = true

    if (typeof this.view.clearTimeout === 'function') {
      this.timeouts.forEach((timeout) => this.view.clearTimeout(timeout))
    }
    this.timeouts.splice(0)

    if (this.frame !== null && this.view.cancelAnimationFrame) {
      this.view.cancelAnimationFrame(this.frame)
    }

    this.pendingRegions.clear()
    this.processingRoots.clear()
    this.observer?.disconnect()
    this.ownerDocument.removeEventListener('click', this.onCheckClick, true)
  }
}

export function installKachelRegions(
  ownerDocument: Document = document,
): () => void {
  return new KachelRegionController(ownerDocument).start()
}
