import { TARGET_SELECTOR, trackKeyFromHandler } from './dom'

export type SourceAddress = readonly [origin: number, option: number]

export interface KachelTargetSpec {
  correctAddress: SourceAddress
  correctContent: string
}

export class KachelfolgeSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KachelfolgeSpecError'
  }
}

const UNIT_START = '[->['
const SOURCE_ADDRESS_PATTERN =
  /["']?value["']?\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/
const warnedMessages = new Set<string>()

function fail(message: string): never {
  throw new KachelfolgeSpecError(message)
}

function splitAtUnescapedPipes(input: string): string[] {
  const options: string[] = []
  let start = 0

  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== '|' || input[index - 1] === '\\') continue

    options.push(input.slice(start, index).replace(/\\\|/g, '|'))
    start = index + 1
  }

  options.push(input.slice(start).replace(/\\\|/g, '|'))
  return options
}

function readUnit(
  rawSpec: string,
  start: number,
): { content: string; next: number } {
  const contentStart = start + UNIT_START.length

  for (let index = contentStart; index < rawSpec.length - 1; index += 1) {
    if (rawSpec[index] === '\\' && rawSpec[index + 1] === ']') {
      index += 1
      continue
    }

    if (rawSpec[index] === ']' && rawSpec[index + 1] === ']') {
      return {
        content: rawSpec.slice(contentStart, index),
        next: index + 2,
      }
    }
  }

  return fail(
    `Kachel ${String(start + 1)} ist nicht mit ]] abgeschlossen.`,
  )
}

/**
 * Mirrors LiaScript's native drop-option contract closely enough to identify
 * the one required source of every target. Labels are deliberately ignored.
 */
export function parseKachelTargets(rawSpec: string): KachelTargetSpec[] {
  const spec = String(rawSpec)
  const targets: KachelTargetSpec[] = []
  let cursor = 0

  while (cursor < spec.length) {
    while (/\s/.test(spec[cursor] ?? '')) cursor += 1
    if (cursor >= spec.length) break

    if (!spec.startsWith(UNIT_START, cursor)) {
      return fail(
        `Unerwarteter Inhalt ab Zeichen ${String(cursor + 1)}. ` +
          `Erwartet wurde ${UNIT_START}.`,
      )
    }

    const unit = readUnit(spec, cursor)
    if (!unit.content.length) {
      return fail(`Kachel ${String(targets.length + 1)} ist leer.`)
    }

    const options = splitAtUnescapedPipes(unit.content)
    const correctOptions: number[] = []

    if (options.length === 1) {
      correctOptions.push(0)
    } else {
      options.forEach((option, optionIndex) => {
        const trimmed = option.trim()
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          correctOptions.push(optionIndex)
        }
      })
    }

    if (correctOptions.length !== 1) {
      return fail(
        `Kachel ${String(targets.length + 1)} benötigt genau eine ` +
          `richtige Option in runden Klammern.`,
      )
    }

    const correctOption = options[correctOptions[0]].trim()
    const correctContent =
      correctOption.startsWith('(') && correctOption.endsWith(')')
        ? correctOption.slice(1, -1).trim()
        : correctOption

    if (!correctContent) {
      return fail(
        `Kachel ${String(targets.length + 1)} benötigt einen nichtleeren ` +
          `Inhalt für die richtige Option.`,
      )
    }

    targets.push({
      correctAddress: [targets.length, correctOptions[0]],
      correctContent,
    })
    cursor = unit.next
  }

  if (!targets.length) {
    return fail('Kachelfolge benötigt mindestens ein [->[...]]-Target.')
  }

  return targets
}

export function parseKachelfolgeSpec(rawSpec: string): SourceAddress[] {
  return parseKachelTargets(rawSpec).map(
    ({ correctAddress }) => correctAddress,
  )
}

export function sourceAddressFromHandler(
  handler: string | null,
): SourceAddress | null {
  const match = handler?.match(SOURCE_ADDRESS_PATTERN)

  if (!match) return null

  const origin = Number(match[1])
  const option = Number(match[2])

  if (!Number.isSafeInteger(origin) || !Number.isSafeInteger(option)) {
    return null
  }

  return [origin, option]
}

export function placedSourceAddress(target: Element): SourceAddress | null {
  const placedSource = Array.from(target.children).find((child) => {
    const handler = child.getAttribute('ondragend')
    return child.getAttribute('draggable') === 'true' && handler?.includes('dragend')
  })

  return sourceAddressFromHandler(
    placedSource?.getAttribute('ondragend') ?? null,
  )
}

export function sameSourceAddressMultiset(
  expected: readonly SourceAddress[],
  actual: readonly SourceAddress[],
): boolean {
  if (expected.length !== actual.length) return false

  const counts = new Map<string, number>()

  for (const [origin, option] of expected) {
    const key = `${String(origin)}:${String(option)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  for (const [origin, option] of actual) {
    const key = `${String(origin)}:${String(option)}`
    const remaining = counts.get(key)

    if (!remaining) return false
    if (remaining === 1) counts.delete(key)
    else counts.set(key, remaining - 1)
  }

  return counts.size === 0
}

function reportContractProblem(uid: string, message: string): false {
  const warning = `[lia-Kachel @Kachelfolge ${uid}] ${message}`

  if (!warnedMessages.has(warning)) {
    warnedMessages.add(warning)
    console.error(warning)
  }

  return false
}

function reportAuthoringProblem(uid: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  const warning = `[lia-Kachel @Kachelfolge ${uid}] ${message}`

  if (!warnedMessages.has(warning)) {
    warnedMessages.add(warning)
    console.error(warning)
  }

  throw new KachelfolgeSpecError(warning)
}

/**
 * Native LiaScript quiz validator. It returns only a boolean; LiaScript keeps
 * ownership of trials, feedback, scoring, persistence and the resolved state.
 */
export function checkKachelfolge(
  uid: string,
  rawSpec: string,
  ownerDocument: Document = document,
): boolean {
  let expected: SourceAddress[]

  try {
    expected = parseKachelfolgeSpec(rawSpec)
  } catch (error) {
    return reportAuthoringProblem(uid, error)
  }

  const root = ownerDocument.getElementById(`lia-kachelfolge-${uid}`)

  if (!root) {
    return reportContractProblem(uid, 'Der Makro-Wrapper wurde nicht gefunden.')
  }

  // @input currently serializes every placed Multi-Drop source as -1. The
  // native [origin target, option] address therefore has to be read from the
  // rendered handler. Keeping all targets inside one macro root is an explicit
  // part of the import contract and avoids any global DOM lookup.
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>(TARGET_SELECTOR),
  )

  if (targets.length !== expected.length) {
    return reportContractProblem(
      uid,
      `Erwartet wurden ${String(expected.length)} Targets, gefunden wurden ` +
        `${String(targets.length)}.`,
    )
  }

  const trackKey = trackKeyFromHandler(targets[0]?.getAttribute('ondragover'))

  if (
    !trackKey ||
    targets.some(
      (target) =>
        trackKeyFromHandler(target.getAttribute('ondragover')) !== trackKey,
    )
  ) {
    return reportContractProblem(
      uid,
      'Die Targets gehören nicht zu genau einem nativen LiaScript-Quiz.',
    )
  }

  const actual: SourceAddress[] = []

  for (const target of targets) {
    const address = placedSourceAddress(target)
    if (!address) return false
    actual.push(address)
  }

  return sameSourceAddressMultiset(expected, actual)
}
