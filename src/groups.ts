import { extractCorrectOptionIndexes } from './content'
import { TARGET_SELECTOR, trackKeyFromHandler } from './dom'
import {
  placedSourceAddress,
  sameSourceAddressMultiset,
  sourceAddressFromHandler,
  type SourceAddress,
} from './kachelfolge'

const GROUP_ATTRIBUTE = 'data-lia-kachelgruppe'
const GROUP_SELECTOR = `[${GROUP_ATTRIBUTE}]`
const NATIVE_CHECK_SELECTOR = '.lia-quiz__check'
const NATIVE_SOURCE_SELECTOR =
  "[draggable='true'][ondragend*='dragend']"
const GROUP_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/
const TARGET_COMMAND_PATTERN =
  /\bcmd\s*:\s*(?:["'](?:dragenter|dragtarget)["']|(?:dragenter|dragtarget)\b)/i
const TARGET_ID_PATTERN =
  /\bparam\s*:\s*\{[^{}]*\bid\s*:\s*(-?\d+)/i
const warnedMessages = new Set<string>()

interface NativeGroup {
  marker: HTMLElement
  targets: HTMLElement[]
}

interface NativeQuizScope {
  checkButton: HTMLElement
  root: Element
}

function reportContractProblem(groupKey: unknown, message: string): false {
  const key = String(groupKey ?? '') || '<leer>'
  const warning = `[lia-Kachel @Kachelgruppen ${key}] ${message}`

  if (!warnedMessages.has(warning)) {
    warnedMessages.add(warning)
    console.error(warning)
  }

  return false
}

function targetIdFromHandler(handler: string | null): number | null {
  if (!handler || !TARGET_COMMAND_PATTERN.test(handler)) return null

  const match = handler.match(TARGET_ID_PATTERN)
  if (!match) return null

  const id = Number(match[1])
  return Number.isSafeInteger(id) && id >= 0 ? id : null
}

function nearestGroupMarker(element: Element): Element | null {
  for (let cursor = element.parentElement; cursor; cursor = cursor.parentElement) {
    if (cursor.hasAttribute(GROUP_ATTRIBUTE)) return cursor
  }

  return null
}

function smallestCommonAncestor(elements: readonly Element[]): Element | null {
  let candidate: Element | null = elements[0] ?? null

  while (
    candidate &&
    elements.some(
      (element) => candidate !== element && !candidate?.contains(element),
    )
  ) {
    candidate = candidate.parentElement
  }

  return candidate
}

function nativeQuizScope(markers: readonly HTMLElement[]): NativeQuizScope | null {
  for (
    let candidate = smallestCommonAncestor(markers);
    candidate;
    candidate = candidate.parentElement
  ) {
    const checkButtons = Array.from(
      candidate.querySelectorAll<HTMLElement>(NATIVE_CHECK_SELECTOR),
    )

    if (!checkButtons.length) continue
    if (checkButtons.length !== 1) return null

    return { checkButton: checkButtons[0], root: candidate }
  }

  return null
}

function optionCountsForTrack(
  root: Element,
  trackKey: string,
  targetCount: number,
): number[] | null {
  const options = Array.from(
    root.querySelectorAll<HTMLElement>(NATIVE_SOURCE_SELECTOR),
  ).filter(
    (source) =>
      trackKeyFromHandler(source.getAttribute('ondragend')) === trackKey,
  )

  if (!options.length) return null

  const optionsByTarget = Array.from(
    { length: targetCount },
    () => new Set<number>(),
  )
  const addresses = new Set<string>()

  for (const option of options) {
    const address = sourceAddressFromHandler(
      option.getAttribute('ondragend'),
    )

    if (!address) return null

    const [targetId, optionId] = address
    if (
      targetId < 0 ||
      targetId >= targetCount ||
      optionId < 0 ||
      !Number.isSafeInteger(optionId)
    ) {
      return null
    }

    const addressKey = `${String(targetId)}:${String(optionId)}`
    // A native source may briefly be represented in both bank and target.
    // Its address is the identity, so the second DOM node adds no option.
    if (addresses.has(addressKey)) continue

    addresses.add(addressKey)
    optionsByTarget[targetId].add(optionId)
  }

  return optionsByTarget.map((targetOptions) => {
    if (!targetOptions.size) return 0

    const count = Math.max(...targetOptions) + 1
    return targetOptions.size === count ? count : 0
  }).every((count) => count > 0)
    ? optionsByTarget.map((targetOptions) => Math.max(...targetOptions) + 1)
    : null
}

/**
 * Validates logical groups inside one native LiaScript Multi-Drop quiz.
 * Only the boolean result is returned; LiaScript retains all grading state.
 */
export function checkKachelgruppen(
  groupKey: string,
  ownerDocument: Document = document,
): boolean {
  if (!GROUP_KEY_PATTERN.test(String(groupKey))) {
    return reportContractProblem(
      groupKey,
      'Der Gruppenschlüssel ist leer oder ungültig.',
    )
  }

  try {
    const markers = Array.from(
      ownerDocument.querySelectorAll<HTMLElement>(GROUP_SELECTOR),
    ).filter(
      (marker) => marker.getAttribute(GROUP_ATTRIBUTE) === groupKey,
    )

    if (!markers.length || new Set(markers).size !== markers.length) {
      return reportContractProblem(
        groupKey,
        'Es wurden keine eindeutigen Gruppen-Wrapper gefunden.',
      )
    }

    const groups: NativeGroup[] = []
    const groupedTargets = new Set<HTMLElement>()

    for (const marker of markers) {
      const targets = Array.from(
        marker.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
      ).filter((target) => nearestGroupMarker(target) === marker)

      if (!targets.length || new Set(targets).size !== targets.length) {
        return reportContractProblem(
          groupKey,
          'Jeder Gruppen-Wrapper benötigt mindestens ein eindeutiges Target.',
        )
      }

      for (const target of targets) {
        if (groupedTargets.has(target)) {
          return reportContractProblem(
            groupKey,
            'Ein natives Target gehört zu mehr als einer Gruppe.',
          )
        }
        groupedTargets.add(target)
      }

      groups.push({ marker, targets })
    }

    const targets = Array.from(groupedTargets)
    const handlers = targets.map((target) =>
      target.getAttribute('ondragover'),
    )
    const trackKeys = handlers.map(trackKeyFromHandler)
    const targetIds = handlers.map(targetIdFromHandler)
    const trackKey = trackKeys[0]

    if (
      !trackKey ||
      trackKeys.some((candidate) => candidate !== trackKey)
    ) {
      return reportContractProblem(
        groupKey,
        'Die Gruppen gehören nicht zu genau einem nativen LiaScript-Track.',
      )
    }

    if (targetIds.some((id) => id === null)) {
      return reportContractProblem(
        groupKey,
        'Eine globale Target-ID fehlt im nativen dragenter/dragtarget-Handler.',
      )
    }

    const ids = targetIds as number[]
    const sortedIds = [...ids].sort((left, right) => left - right)
    if (
      new Set(ids).size !== ids.length ||
      sortedIds.some((id, index) => id !== index)
    ) {
      return reportContractProblem(
        groupKey,
        'Die globalen nativen Target-IDs sind nicht eindeutig und lückenlos.',
      )
    }

    const quiz = nativeQuizScope(markers)
    if (!quiz) {
      return reportContractProblem(
        groupKey,
        'Genau ein nativer Prüfen-Button wurde nicht gefunden.',
      )
    }

    const quizTargets = Array.from(
      quiz.root.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
    ).filter(
      (target) =>
        trackKeyFromHandler(target.getAttribute('ondragover')) === trackKey,
    )

    if (
      quizTargets.length !== targets.length ||
      quizTargets.some((target) => !groupedTargets.has(target))
    ) {
      return reportContractProblem(
        groupKey,
        'Die Gruppen decken die Targets ihres nativen Tracks nicht exakt ab.',
      )
    }

    const optionCounts = optionCountsForTrack(
      quiz.root,
      trackKey,
      targets.length,
    )
    if (!optionCounts) {
      return reportContractProblem(
        groupKey,
        'Die nativen Quelloptionen des Tracks sind unvollständig oder uneindeutig.',
      )
    }

    const correctOptions = extractCorrectOptionIndexes(
      quiz.checkButton,
      optionCounts,
    )
    if (!correctOptions || correctOptions.length !== targets.length) {
      return reportContractProblem(
        groupKey,
        'Die native Multi-Drop-Lösung ist nicht eindeutig verfügbar.',
      )
    }

    const idByTarget = new Map<HTMLElement, number>()
    targets.forEach((target, index) => {
      idByTarget.set(target, ids[index])
    })

    for (const group of groups) {
      const expected: SourceAddress[] = group.targets.map((target) => {
        const targetId = idByTarget.get(target) as number
        return [targetId, correctOptions[targetId]] as const
      })
      const actual: SourceAddress[] = []

      for (const target of group.targets) {
        const address = placedSourceAddress(target)
        if (!address) return false
        actual.push(address)
      }

      if (!sameSourceAddressMultiset(expected, actual)) return false
    }

    return true
  } catch {
    return reportContractProblem(
      groupKey,
      'Der native Gruppenvertrag konnte nicht gelesen werden.',
    )
  }
}
