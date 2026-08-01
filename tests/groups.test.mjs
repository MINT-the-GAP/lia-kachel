import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const projectRoot = new URL('../', import.meta.url)
const groupSelector = '[data-lia-kachelgruppe]'
const targetSelector =
  "span[role='button'][ondragover*='dragenter']"
const sourceSelector =
  "[draggable='true'][ondragend*='dragend']"
const checkSelector = '.lia-quiz__check'
const groupSizes = [6, 4, 7, 3]

async function loadGroupsApi(consoleStub = console) {
  const bundle = await readFile(new URL('dist/index.js', projectRoot), 'utf8')
  const windowStub = {
    PointerEvent: function PointerEvent() {},
    addEventListener() {},
    removeEventListener() {},
    setTimeout() {
      return 1
    },
    clearTimeout() {},
  }
  const documentStub = {
    defaultView: windowStub,
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() {
      return []
    },
  }
  windowStub.document = documentStub

  new vm.Script(bundle, { filename: 'dist/index.js' }).runInNewContext({
    console: consoleStub,
    document: documentStub,
    window: windowStub,
  })

  return windowStub.LiaKachel.kachelgruppen
}

function elmList(values) {
  return values.reduceRight(
    (tail, value) => ({ $: 1, a: value, b: tail }),
    { $: 0 },
  )
}

function elmArray(values) {
  if (!values.length) return { a: 0, b: 5, c: [], d: [] }

  const tailLength = ((values.length - 1) % 32) + 1
  const treeValues = values.slice(0, values.length - tailLength)
  const tree = []

  for (let offset = 0; offset < treeValues.length; offset += 32) {
    tree.push({ $: 1, a: treeValues.slice(offset, offset + 32) })
  }

  return {
    a: values.length,
    b: 5,
    c: tree,
    d: values.slice(values.length - tailLength),
  }
}

function nativeCheckModel(optionCounts, correctOptions) {
  return {
    elmFs: {
      click: {
        minifiedRoot: {
          model: {
            nativeOptions: elmArray(
              optionCounts.map((count, target) =>
                elmList(
                  Array.from({ length: count }, (_, option) => ({
                    label: `gleich-${String(target)}-${String(option)}`,
                  })),
                ),
              ),
            ),
            nativeSolution: elmArray(
              correctOptions.map((option) => ({
                $: 0,
                a: false,
                b: false,
                c: elmList([option]),
              })),
            ),
          },
        },
      },
    },
  }
}

function nativeTrack(quizId) {
  return `[["quiz",${String(quizId)}],["input",0]]`
}

function targetHandler(track, targetId, command = 'dragenter') {
  return (
    `window.LIA.send({track:${track},message:{cmd:'${command}',` +
    `param:{id:${String(targetId)},value:event}}})`
  )
}

function sourceHandler(track, origin, option) {
  return (
    `window.LIA.send({track:${track},message:{cmd:'dragend',` +
    `param:{id:${String(origin)},value:[${String(origin)},${String(option)}]}}})`
  )
}

class ElementStub {
  constructor(kind, attributes = {}) {
    this.kind = kind
    this.attributes = new Map(Object.entries(attributes))
    this.children = []
    this.parentElement = null
    this.textContent = 'gleich'
  }

  append(...children) {
    for (const child of children) {
      if (child.parentElement) {
        const siblings = child.parentElement.children
        const index = siblings.indexOf(child)
        if (index >= 0) siblings.splice(index, 1)
      }
      child.parentElement = this
      this.children.push(child)
    }
  }

  contains(candidate) {
    for (let cursor = candidate; cursor; cursor = cursor.parentElement) {
      if (cursor === this) return true
    }
    return false
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  matchesSelector(selector) {
    if (selector === groupSelector) {
      return this.hasAttribute('data-lia-kachelgruppe')
    }
    if (selector === targetSelector) return this.kind === 'target'
    if (selector === sourceSelector) return this.kind === 'source'
    if (selector === checkSelector) return this.kind === 'check'

    throw new Error(`unexpected selector: ${selector}`)
  }

  querySelectorAll(selector) {
    const matches = []

    const visit = (element) => {
      for (const child of element.children) {
        if (child.matchesSelector(selector)) matches.push(child)
        visit(child)
      }
    }

    visit(this)
    return matches
  }
}

function groupedRanges() {
  let start = 0
  return groupSizes.map((size) => {
    const range = Array.from({ length: size }, (_, index) => start + index)
    start += size
    return range
  })
}

function correctArrangement(correctOptions) {
  return groupedRanges().flatMap((range) =>
    [...range]
      .reverse()
      .map((targetId) => [targetId, correctOptions[targetId]]),
  )
}

function createQuiz({
  arrangement,
  duplicateSourceRepresentation = false,
  extraTrackTarget = false,
  key = 'wortarten',
  secondCheck = false,
  targetIds,
  targetTracks = {},
} = {}) {
  const track = nativeTrack(37)
  const optionCounts = Array.from(
    { length: 20 },
    (_, target) => (target % 3) + 1,
  )
  const correctOptions = optionCounts.map(
    (count, target) => target % count,
  )
  const placements = arrangement ?? correctArrangement(correctOptions)
  const ids = targetIds ?? Array.from({ length: 20 }, (_, index) => index)
  const queriedSelectors = []

  const documentRoot = new ElementStub('document-root')
  const quizHost = new ElementStub('quiz-host')
  const wrapperCommonAncestor = new ElementStub('wrapper-common-ancestor')
  const sourceBank = new ElementStub('source-bank')
  const controls = new ElementStub('controls')
  const check = Object.assign(
    new ElementStub('check'),
    nativeCheckModel(optionCounts, correctOptions),
  )
  controls.append(check)
  if (secondCheck) {
    controls.append(
      Object.assign(
        new ElementStub('check'),
        nativeCheckModel(optionCounts, correctOptions),
      ),
    )
  }
  quizHost.append(wrapperCommonAncestor, sourceBank, controls)
  documentRoot.append(quizHost)

  const wrappers = groupedRanges().map(() =>
    new ElementStub('group', { 'data-lia-kachelgruppe': key }),
  )
  wrapperCommonAncestor.append(...wrappers)

  const targets = ids.map((targetId, index) => {
    const targetTrack = targetTracks[index] ?? track
    const target = new ElementStub('target', {
      ondragover: targetHandler(targetTrack, targetId),
    })
    return target
  })

  let offset = 0
  groupSizes.forEach((size, group) => {
    wrappers[group].append(...targets.slice(offset, offset + size))
    offset += size
  })

  if (extraTrackTarget) {
    wrapperCommonAncestor.append(
      new ElementStub('target', {
        ondragover: targetHandler(track, 20, 'dragtarget'),
      }),
    )
  }

  const sourceByAddress = new Map()
  optionCounts.forEach((count, origin) => {
    for (let option = 0; option < count; option += 1) {
      const source = new ElementStub('source', {
        draggable: 'true',
        ondragend: sourceHandler(track, origin, option),
      })
      sourceBank.append(source)
      sourceByAddress.set(`${String(origin)}:${String(option)}`, source)
    }
  })
  if (duplicateSourceRepresentation) {
    sourceBank.append(
      new ElementStub('source', {
        draggable: 'true',
        ondragend: sourceHandler(track, 0, 0),
      }),
    )
  }

  placements.forEach((address, target) => {
    if (!address) return
    const source = sourceByAddress.get(
      `${String(address[0])}:${String(address[1])}`,
    )
    assert.ok(source, `missing source ${JSON.stringify(address)}`)
    targets[target].append(source)
  })

  const ownerDocument = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector)
      return documentRoot.querySelectorAll(selector)
    },
  }

  return {
    correctOptions,
    ownerDocument,
    queriedSelectors,
  }
}

test('the bundle exposes the native grouped validator', async () => {
  const api = await loadGroupsApi()

  assert.equal(typeof api.check, 'function')
})

test('global 6/4/7/3 ranges accept only within-group permutations with native option indexes', async () => {
  const api = await loadGroupsApi()
  const valid = createQuiz()

  assert.equal(api.check('wortarten', valid.ownerDocument), true)
  const duplicate = createQuiz({ duplicateSourceRepresentation: true })
  assert.equal(
    api.check(
      'wortarten',
      duplicate.ownerDocument,
    ),
    true,
    'duplicate DOM representations of one native source address are harmless',
  )
  assert.deepEqual(valid.correctOptions.slice(0, 6), [0, 1, 2, 0, 0, 2])
  assert.equal(
    valid.queriedSelectors.some((selector) => /\b(?:table|td)\b/i.test(selector)),
    false,
    'group discovery must not depend on a table selector',
  )

  const arrangement = correctArrangement(valid.correctOptions)
  ;[arrangement[0], arrangement[6]] = [arrangement[6], arrangement[0]]

  assert.equal(
    api.check('wortarten', createQuiz({ arrangement }).ownerDocument),
    false,
    'a source exchanged between the six- and four-target groups must fail',
  )
})

test('incomplete groups and a wrong native option fail independently of duplicate text', async () => {
  const api = await loadGroupsApi()
  const baseline = createQuiz()
  const incomplete = correctArrangement(baseline.correctOptions)
  incomplete[10] = null

  assert.equal(
    api.check('wortarten', createQuiz({ arrangement: incomplete }).ownerDocument),
    false,
  )

  const wrongOption = correctArrangement(baseline.correctOptions)
  const origin = wrongOption[10][0]
  const count = (origin % 3) + 1
  wrongOption[10] = [
    origin,
    (baseline.correctOptions[origin] + 1) % count,
  ]

  assert.equal(
    api.check('wortarten', createQuiz({ arrangement: wrongOption }).ownerDocument),
    false,
    'all source labels are identical; only the native address may decide',
  )
})

test('track, target-id and exact coverage contract violations fail closed', async () => {
  const api = await loadGroupsApi()

  assert.equal(
    api.check(
      'track-error',
      createQuiz({
        key: 'track-error',
        targetTracks: { 9: nativeTrack(99) },
      }).ownerDocument,
    ),
    false,
  )
  assert.equal(
    api.check(
      'coverage-error',
      createQuiz({ key: 'coverage-error', extraTrackTarget: true }).ownerDocument,
    ),
    false,
  )
  assert.equal(
    api.check(
      'id-gap',
      createQuiz({
        key: 'id-gap',
        targetIds: [...Array.from({ length: 19 }, (_, index) => index), 20],
      }).ownerDocument,
    ),
    false,
  )
  assert.equal(
    api.check(
      'id-duplicate',
      createQuiz({
        key: 'id-duplicate',
        targetIds: [...Array.from({ length: 19 }, (_, index) => index), 18],
      }).ownerDocument,
    ),
    false,
  )
})

test('the smallest common ancestor must lead to exactly one native check button', async () => {
  const api = await loadGroupsApi()

  assert.equal(
    api.check(
      'two-checks',
      createQuiz({ key: 'two-checks', secondCheck: true }).ownerDocument,
    ),
    false,
  )
})

test('identical contract problems are logged once and invalid keys never query the DOM', async () => {
  const errors = []
  const api = await loadGroupsApi({
    debug() {},
    error(...values) {
      errors.push(values.join(' '))
    },
    log() {},
    warn() {},
  })
  const broken = createQuiz({
    key: 'once',
    targetTracks: { 9: nativeTrack(99) },
  })

  assert.equal(api.check('once', broken.ownerDocument), false)
  assert.equal(api.check('once', broken.ownerDocument), false)
  assert.equal(errors.length, 1)

  let queried = false
  assert.equal(
    api.check('nicht gültig', {
      querySelectorAll() {
        queried = true
        return []
      },
    }),
    false,
  )
  assert.equal(queried, false)
})
