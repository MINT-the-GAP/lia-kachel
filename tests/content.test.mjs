import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const projectRoot = new URL('../', import.meta.url)

async function loadContentApi() {
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
    console,
    document: documentStub,
    window: windowStub,
  })

  return windowStub.LiaKachel.content
}

function sourceElement(text, { ariaLabel = null, imageAlts = [] } = {}) {
  return {
    textContent: text,
    getAttribute(name) {
      return name === 'aria-label' ? ariaLabel : null
    },
    querySelectorAll(selector) {
      if (selector !== 'img[alt]') return []
      return imageAlts.map((alt) => ({
        getAttribute(name) {
          return name === 'alt' ? alt : null
        },
      }))
    },
  }
}

function elmList(values) {
  return values.reduceRight(
    (tail, value) => ({ $: 1, a: value, b: tail }),
    { $: 0 },
  )
}

/**
 * Mirrors the relevant Elm Array layout. Values before the tail live in
 * 32-wide leaf nodes; the final 1..32 values live in d.
 */
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

function solutionArray(correctIndexes) {
  return elmArray(
    correctIndexes.map((index) => ({
      $: 0,
      a: false,
      b: false,
      c: elmList([index]),
    })),
  )
}

function optionsArray(optionCounts) {
  return elmArray(
    optionCounts.map((count, target) =>
      elmList(
        Array.from({ length: count }, (_, option) => ({
          $: 0,
          label: `target-${String(target)}-option-${String(option)}`,
        })),
      ),
    ),
  )
}

function nativeCheckButton(
  optionCounts,
  correctIndexes,
  alternateSolutions = [],
) {
  const model = {
    minifiedOptions: optionsArray(optionCounts),
    minifiedSolution: solutionArray(correctIndexes),
  }

  alternateSolutions.forEach((indexes, index) => {
    model[`alternate${String(index)}`] = solutionArray(indexes)
  })

  return {
    elmFs: {
      click: {
        q: {
          deliberatelyUnknownMinifiedPath: model,
        },
      },
    },
  }
}

function plainIndexes(indexes) {
  return indexes === null ? null : Array.from(indexes)
}

function plainAssignments(assignments) {
  return assignments === null
    ? null
    : Array.from(assignments, (address) =>
        address === null ? null : Array.from(address),
      )
}

function source(origin, option, content) {
  return { address: [origin, option], content }
}

function contentByAddress(sources, address) {
  const match = sources.find(
    (entry) =>
      entry.address[0] === address?.[0] &&
      entry.address[1] === address?.[1],
  )
  return match?.content ?? ''
}

test('the browser bundle exposes only the new content-region API', async () => {
  const api = await loadContentApi()

  assert.equal(typeof api.correctOptions, 'function')
  assert.equal(typeof api.normalize, 'function')
  assert.equal(typeof api.planAssignments, 'function')
  assert.equal(typeof api.rendered, 'function')
  assert.equal(typeof api.sameTargets, 'function')
})

test('content normalization is Unicode- and whitespace-tolerant but target-local', async () => {
  const api = await loadContentApi()

  assert.equal(api.normalize('  e\u0301\u00a0\n x  '), 'é x')
  assert.equal(api.sameTargets(['x', 'y'], [' x ', 'y']), true)
  assert.equal(api.sameTargets(['x'], ['X']), false)
  assert.equal(api.sameTargets(['x.'], ['x']), false)
  assert.equal(api.sameTargets([], []), false)
  assert.equal(
    api.sameTargets(
      ['x', 'x', 'x', 'y'],
      ['x', 'x', 'y', 'x'],
    ),
    false,
    'the same global multiset must not satisfy the wrong target order',
  )
})

test('rendered content reads text, image alternatives and aria labels', async () => {
  const api = await loadContentApi()

  assert.equal(
    api.rendered(sourceElement('  sichtbar\n x  ')),
    'sichtbar x',
  )
  assert.equal(
    api.rendered(sourceElement('', { imageAlts: ['Bild', 'x'] })),
    'Bild x',
  )
  assert.equal(
    api.rendered(sourceElement('', { ariaLabel: '  Formel  x ' })),
    'Formel x',
  )
})

test('native solution extraction supports the exact five-target example', async () => {
  const api = await loadContentApi()
  const optionCounts = [1, 1, 1, 1, 3]
  const expected = [0, 0, 0, 0, 2]

  assert.deepEqual(
    plainIndexes(
      api.correctOptions(
        nativeCheckButton(optionCounts, expected),
        optionCounts,
      ),
    ),
    expected,
  )
})

test('native solution extraction reads Elm Array tree and tail for 40 and 128 targets', async () => {
  const api = await loadContentApi()

  for (const count of [40, 128]) {
    const optionCounts = Array.from(
      { length: count },
      (_, target) => (target % 4) + 1,
    )
    const expected = optionCounts.map(
      (options, target) => target % options,
    )
    const button = nativeCheckButton(optionCounts, expected)
    const model =
      button.elmFs.click.q.deliberatelyUnknownMinifiedPath

    assert.ok(model.minifiedOptions.c.length > 0)
    assert.ok(model.minifiedOptions.d.length > 0)
    assert.ok(model.minifiedSolution.c.length > 0)
    assert.ok(model.minifiedSolution.d.length > 0)
    assert.deepEqual(
      plainIndexes(api.correctOptions(button, optionCounts)),
      expected,
      `${String(count)} targets must include both Elm tree and tail`,
    )
  }
})

test('native solution extraction fails closed for missing or ambiguous model shapes', async () => {
  const api = await loadContentApi()
  const optionCounts = [2, 2]

  const withoutOptions = {
    elmFs: {
      click: {
        q: {
          onlySolution: solutionArray([0, 1]),
        },
      },
    },
  }
  const ambiguous = nativeCheckButton(
    optionCounts,
    [0, 1],
    [[1, 0]],
  )

  assert.equal(api.correctOptions(withoutOptions, optionCounts), null)
  assert.equal(api.correctOptions(ambiguous, optionCounts), null)
  assert.equal(api.correctOptions({}, optionCounts), null)
  assert.equal(api.correctOptions(nativeCheckButton([], []), []), null)
})

test('equal contents are interchangeable in the exact gelb/rot region', async () => {
  const api = await loadContentApi()
  const correct = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 2],
  ]
  const sources = [
    source(0, 0, 'gelb'),
    source(1, 0, 'gelb'),
    source(2, 0, 'gelb'),
    source(3, 0, 'rot'),
    source(4, 0, 'pink'),
    source(4, 1, 'grün'),
    source(4, 2, 'rot'),
  ]
  const swapped = [
    { address: [2, 0], content: 'gelb' },
    { address: [0, 0], content: 'gelb' },
    { address: [1, 0], content: 'gelb' },
    { address: [4, 2], content: 'rot' },
    { address: [3, 0], content: 'rot' },
  ]

  assert.deepEqual(
    plainAssignments(api.planAssignments(correct, sources, swapped)),
    correct,
  )
})

test('natively false sources with the same content normalize to each target solution', async () => {
  const api = await loadContentApi()
  const correct = [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 0],
  ]
  const sources = [
    source(0, 0, 'x'),
    source(0, 1, 'A'),
    source(0, 2, 'x'),
    source(1, 0, 'x'),
    source(1, 1, 'x'),
    source(1, 2, 'B'),
    source(2, 0, 'C'),
    source(2, 1, 'x'),
    source(2, 2, 'x'),
    source(3, 0, 'y'),
    source(3, 1, 'y'),
    source(3, 2, 'D'),
  ]
  const falseIdentities = [
    { address: [0, 2], content: 'x' },
    { address: [1, 0], content: 'x' },
    { address: [2, 1], content: 'x' },
    { address: [3, 1], content: 'y' },
  ]

  assert.deepEqual(
    plainAssignments(
      api.planAssignments(correct, sources, falseIdentities),
    ),
    correct,
  )
})

test('assignment planning preserves target-local mistakes despite an equal global multiset', async () => {
  const api = await loadContentApi()
  const correct = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ]
  const sources = [
    source(0, 0, 'x'),
    source(1, 0, 'x'),
    source(2, 0, 'x'),
    source(2, 1, 'x'),
    source(3, 0, 'y'),
    source(3, 1, 'y'),
  ]
  const wrongTargets = [
    { address: [0, 0], content: 'x' },
    { address: [1, 0], content: 'x' },
    { address: [3, 1], content: 'y' },
    { address: [2, 1], content: 'x' },
  ]
  const assignments = plainAssignments(
    api.planAssignments(correct, sources, wrongTargets),
  )

  assert.notEqual(assignments, null)
  assert.deepEqual(
    assignments.map((address) => contentByAddress(sources, address)),
    ['x', 'x', 'y', 'x'],
    'normalization must not move a wrong content into another target',
  )
  assert.equal(
    assignments.every(
      (address, target) =>
        address[0] === correct[target][0] &&
        address[1] === correct[target][1],
    ),
    false,
    'native grading must still see the target-local mismatch',
  )
})

test('assignment planning handles occupied duplicate sources and fails safely on inconsistent input', async () => {
  const api = await loadContentApi()
  const correct = [
    [0, 0],
    [1, 0],
  ]
  const sources = [
    source(0, 0, 'x'),
    source(0, 1, 'x'),
    source(1, 0, 'x'),
    source(1, 1, 'Ablenkung'),
  ]
  const occupiedSwap = [
    { address: [1, 0], content: 'x' },
    { address: [0, 0], content: 'x' },
  ]

  assert.deepEqual(
    plainAssignments(
      api.planAssignments(correct, sources, occupiedSwap),
    ),
    correct,
    'both occupied identities must be rebuilt without duplicating a source',
  )
  assert.equal(
    api.planAssignments(
      correct,
      sources,
      [
        { address: [0, 1], content: 'x' },
        { address: [9, 9], content: 'unbekannt' },
      ],
    ),
    null,
  )
  assert.equal(
    api.planAssignments(
      correct,
      sources,
      [{ address: [0, 0], content: 'x' }],
    ),
    null,
  )
})
