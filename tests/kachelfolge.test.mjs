import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const projectRoot = new URL('../', import.meta.url)
const nativeTargetSelector =
  "span[role='button'][ondragover*='dragenter']"
const progressiveRootSelector =
  "[data-lia-kachelfolge-mode='progressive']"

async function loadKachelfolgeApi() {
  const bundle = await readFile(new URL('dist/index.js', projectRoot), 'utf8')
  const windowStub = {
    PointerEvent: function PointerEvent() {},
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = {
    defaultView: windowStub,
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
  }
  windowStub.document = documentStub

  new vm.Script(bundle, { filename: 'dist/index.js' }).runInNewContext({
    console,
    document: documentStub,
    window: windowStub,
  })

  return windowStub.LiaKachel.kachelfolge
}

const plain = (value) => JSON.parse(JSON.stringify(value))

function nativeTrack(quizId) {
  return `[["quiz",${String(quizId)}],["input",0]]`
}

function nativeHandler(track, address) {
  const value = address ? `, value: [${address[0]},${address[1]}]` : ''
  return `window.LIA.send({ track: ${track}, message: { cmd: 'dragend', param: { id: 0${value} } } })`
}

function targetStub(track, address) {
  const attributes = new Map([
    ['ondragover', nativeHandler(track, null)],
  ])
  const target = {
    children: [],
    getAttribute(name) {
      return attributes.get(name) ?? null
    },
    setAttribute(name, value) {
      attributes.set(name, String(value))
    },
    removeAttribute(name) {
      attributes.delete(name)
    },
    setAddress(nextAddress) {
      this.children.length = 0
      if (!nextAddress) return

      this.children.push({
        getAttribute(name) {
          if (name === 'draggable') return 'true'
          if (name === 'ondragend') {
            return nativeHandler(track, nextAddress)
          }
          return null
        },
      })
    },
  }

  target.setAddress(address)
  return target
}

function documentStub(uid, addresses, quizId = 0) {
  const track = nativeTrack(quizId)
  const targets = addresses.map((address) => targetStub(track, address))
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, nativeTargetSelector)
      return targets
    },
  }

  return {
    getElementById(id) {
      return id === `lia-kachelfolge-${uid}` ? root : null
    },
  }
}

function progressiveDocumentStub(addresses, quizId = 0) {
  const track = nativeTrack(quizId)
  const targets = addresses.map((address) => targetStub(track, address))
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, nativeTargetSelector)
      return targets
    },
  }
  const ownerDocument = {
    querySelectorAll(selector) {
      assert.equal(selector, progressiveRootSelector)
      return [root]
    },
  }

  return { ownerDocument, targets }
}

function permutations(values) {
  if (values.length < 2) return [values]

  return values.flatMap((value, index) =>
    permutations(values.filter((_, itemIndex) => itemIndex !== index)).map(
      (rest) => [value, ...rest],
    ),
  )
}

test('the parser mirrors native option identities without reading labels', async () => {
  const api = await loadKachelfolgeApi()
  const spec = String.raw`[->[falsch|(A\|eins)|noch-falsch]][->[(B)|falsch]][->[C]]`

  assert.deepEqual(plain(api.parse(spec)), [
    [0, 1],
    [1, 0],
    [2, 0],
  ])
  assert.throws(() => api.parse(''))
  assert.throws(() => api.parse('[->[A|B]]'))
  assert.throws(() => api.parse('[->[(A)|(B)]]'))
  assert.throws(() => api.parse('[->[()]]'))
  assert.throws(() => api.parse('[->[(A)]'))
})

test('source addresses are compared as an exact order-independent multiset', async () => {
  const api = await loadKachelfolgeApi()

  assert.equal(
    api.sameAddressMultiset(
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [
        [2, 0],
        [0, 0],
        [1, 1],
      ],
    ),
    true,
  )
  assert.equal(api.sameAddressMultiset([[0, 0]], [[0, 1]]), false)
  assert.equal(
    api.sameAddressMultiset(
      [
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
    ),
    false,
  )
})

test('the validator accepts permutations and rejects empty or wrong sources', async () => {
  const api = await loadKachelfolgeApi()
  const uid = 'permutation'
  const spec = '[->[gleich|(gleich)]][->[(B)|falsch]][->[C]]'

  assert.equal(
    api.check(uid, spec, documentStub(uid, [[2, 0], [0, 1], [1, 0]], 7)),
    true,
  )
  assert.equal(
    api.check(uid, spec, documentStub(uid, [[0, 0], [1, 0], [2, 0]], 7)),
    false,
    'an identically labelled distractor keeps its wrong native identity',
  )
  assert.equal(
    api.check(uid, spec, documentStub(uid, [[0, 1], null, [2, 0]], 7)),
    false,
  )
})

test('all 24 permutations of four correct source identities are accepted', async () => {
  const api = await loadKachelfolgeApi()
  const uid = 'all-permutations'
  const spec = '[->[(1)|x]][->[(2)|x]][->[(3)|x]][->[(4)|x]]'
  const correct = [[0, 0], [1, 0], [2, 0], [3, 0]]

  for (const permutation of permutations(correct)) {
    assert.equal(
      api.check(uid, spec, documentStub(uid, permutation, 11)),
      true,
      `rejected permutation ${JSON.stringify(permutation)}`,
    )
  }
})

test('arbitrary target counts and independent macro ids share no state', async () => {
  const api = await loadKachelfolgeApi()
  const count = 128
  const spec = Array.from(
    { length: count },
    (_, index) => `[->[(R${String(index)})|F${String(index)}]]`,
  ).join('')
  const reverse = Array.from(
    { length: count },
    (_, index) => [count - index - 1, 0],
  )

  assert.equal(api.check('large', spec, documentStub('large', reverse, 19)), true)
  assert.equal(
    api.check('quiz-a', '[->[(A)]]', documentStub('quiz-a', [[0, 0]], 1)),
    true,
  )
  assert.equal(
    api.check('quiz-b', '[->[(B)|X]]', documentStub('quiz-b', [[0, 1]], 2)),
    false,
  )
})

test('progressive target counts reveal one empty slot without leaking gaps', async () => {
  const api = await loadKachelfolgeApi()

  assert.equal(api.progressiveVisibleCount([]), 0)
  assert.equal(api.progressiveVisibleCount([false]), 1)
  assert.equal(api.progressiveVisibleCount([false, false, false]), 1)
  assert.equal(api.progressiveVisibleCount([true, false, false]), 2)
  assert.equal(api.progressiveVisibleCount([true, true, false]), 3)
  assert.equal(api.progressiveVisibleCount([true, true, true]), 3)
  assert.equal(api.progressiveVisibleCount([false, true, false]), 2)
  assert.equal(api.progressiveVisibleCount([false, false, true, false]), 2)
  assert.equal(
    api.progressiveVisibleCount([true, false, false, true, false]),
    3,
  )
})

test('progressive refresh reacts to place, move and remove on native targets', async () => {
  const api = await loadKachelfolgeApi()
  const { ownerDocument, targets } = progressiveDocumentStub(
    [null, null, null, null],
    23,
  )
  const visible = () =>
    targets.map(
      (target) =>
        target.getAttribute('data-lia-kachelfolge-visible') === 'true',
    )

  api.refreshProgressive(ownerDocument)
  assert.deepEqual(visible(), [true, false, false, false])

  targets[0].setAddress([3, 1])
  api.refreshProgressive(ownerDocument)
  assert.deepEqual(visible(), [true, true, false, false])

  targets[1].setAddress([0, 0])
  api.refreshProgressive(ownerDocument)
  assert.deepEqual(visible(), [true, true, true, false])

  targets[1].setAddress(null)
  targets[2].setAddress([0, 0])
  api.refreshProgressive(ownerDocument)
  assert.deepEqual(
    visible(),
    [true, true, true, false],
    'moving a tile across a gap must not reveal a fourth target',
  )

  targets[2].setAddress(null)
  api.refreshProgressive(ownerDocument)
  assert.deepEqual(
    visible(),
    [true, true, false, false],
    'removing the trailing tile collapses to one available empty target',
  )

  targets[0].setAddress(null)
  targets[3].setAddress([2, 0])
  api.refreshProgressive(ownerDocument)
  assert.deepEqual(
    visible(),
    [true, false, false, true],
    'a restored high-index tile stays visible beside exactly one empty target',
  )
})

test('progressive counts support arbitrary N without shared state', async () => {
  const api = await loadKachelfolgeApi()
  const count = 128
  const filled = Array.from({ length: count }, () => false)

  for (let index = 0; index < count; index += 1) {
    assert.equal(
      api.progressiveVisibleCount(filled),
      Math.min(index + 1, count),
    )
    filled[index] = true
  }

  assert.equal(api.progressiveVisibleCount(filled), count)
  assert.equal(api.progressiveVisibleCount([false, false]), 1)
})
