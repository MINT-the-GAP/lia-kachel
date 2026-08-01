import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import test, { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'

const HOST = '127.0.0.1'
const START_TIMEOUT = 30_000
const COMPILE_TIMEOUT = 45_000
const TEST_TIMEOUT = 240_000
const root = fileURLToPath(new URL('../../', import.meta.url))
const devServerLibrary = fileURLToPath(
  new URL('../../node_modules/@liascript/devserver/dist/lib.js', import.meta.url),
)
const devServerPackage = fileURLToPath(
  new URL('../../node_modules/@liascript/devserver/', import.meta.url),
)
const nodeModules = fileURLToPath(
  new URL('../../node_modules/', import.meta.url),
)
const GROUP = '[data-lia-kachelgruppe=wortarten]'
const SEQUENCE = '[data-lia-kachelfolge]'
const TARGET = '[role=button][ondragover*=dragenter]'
const SOURCE = '[role=button][aria-grabbed][ondragend*=dragend]'
const PLACED_SOURCE = '[draggable=true][ondragend*=dragend]'
const DUMMY = '[data-lia-kachelfolge-dummy=true]'
const CHECK = '.lia-quiz__check'
const RESOLVE = '.lia-quiz__resolve'
const GROUPS = [
  { start: 0, count: 6 },
  { start: 6, count: 4 },
  { start: 10, count: 7 },
  { start: 17, count: 3 },
]

let server
before(async () => {
  server = await startDevServer()
})
after(async () => server?.stop())

for (const [browserName, browserType] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  test(
    `${browserName}: native LiaScript integration`,
    { timeout: TEST_TIMEOUT },
    async (t) => {
      const browser = await browserType.launch({ headless: true })
      t.after(async () => browser.close())

      await t.test('grouped table, progression, check, reload and revisit', async () => {
        const session = await createSession(browser)
        t.after(async () => session.context.close())
        await openCourse(session.page, 'tests/fixtures/kachelfolge-table-import.md', 2, GROUP, 4)

        await assertGroupedTableStructure(session.page)
        assert.deepEqual(await visibleTargetCounts(session.page), [1, 1, 1, 1])
        assert.deepEqual(await visibleDummyIndexes(session.page), [])

        await dragAddressToTarget(session.page, [5, 0], 0)
        assert.deepEqual(await visibleTargetCounts(session.page), [2, 1, 1, 1])
        await dragAddressToTarget(session.page, [9, 0], 6)
        assert.deepEqual(await visibleTargetCounts(session.page), [2, 2, 1, 1])

        await fillReverseGroup(session.page, GROUPS[0], 1)
        assert.deepEqual(await visibleTargetCounts(session.page), [6, 2, 1, 1])
        assert.deepEqual(await visibleDummyIndexes(session.page), [0])
        await assertDummyIsInert(session.page, 0)

        await fillReverseGroup(session.page, GROUPS[1], 1)
        await fillReverseGroup(session.page, GROUPS[2])
        await fillReverseGroup(session.page, GROUPS[3])
        assert.deepEqual(await visibleTargetCounts(session.page), [6, 4, 7, 3])
        assert.deepEqual(await visibleDummyIndexes(session.page), [0, 1, 2, 3])
        for (let index = 0; index < 4; index += 1) {
          await assertDummyIsInert(session.page, index)
        }

        assert.deepEqual(await assignments(session.page), reverseAssignments())
        await clickCheckAndWaitFor(session.page, 'success')
        assert.deepEqual(await assignments(session.page), reverseAssignments())

        const probeBeforeVisit = await probeSnapshot(session.page)
        await revisitSlide(session.page, 1, 2)
        await assertPersistedSuccess(session.page, reverseAssignments())
        await assertNoDuplicateRuntime(session.page, probeBeforeVisit)

        await session.page.waitForTimeout(1_500)
        await assertPreviewHasNoCourseDatabase(session.page)
        await session.page.reload({ waitUntil: 'domcontentloaded' })
        await waitForCompiledCount(session.page, GROUP, 4)
        await assertPreviewHasNoCourseDatabase(session.page)
        await assertReloadReset(session.page)
        await assertRuntimeShape(session.page)
        assertNoRuntimeErrors(session)
      })

      await t.test('incomplete and cross-group answers are rejected natively', async () => {
        const incomplete = await createSession(browser)
        await openCourse(incomplete.page, 'tests/fixtures/kachelfolge-table-import.md', 2, GROUP, 4)
        await dragAddressToTarget(incomplete.page, [5, 0], 0)
        const before = await attemptNumber(incomplete.page)
        await clickCheckAndWaitFor(incomplete.page, 'failure')
        assert.ok((await attemptNumber(incomplete.page)) > before)
        assert.equal(await incomplete.page.locator('.lia-quiz__feedback.text-success').count(), 0)
        assertNoRuntimeErrors(incomplete)
        await incomplete.context.close()

        const crossed = await createSession(browser)
        t.after(async () => crossed.context.close())
        await openCourse(crossed.page, 'tests/fixtures/kachelfolge-table-import.md', 2, GROUP, 4)
        const crossedAssignments = canonicalAssignments()
        crossedAssignments[0] = [6, 0]
        crossedAssignments[6] = [0, 0]
        await fillAssignments(crossed.page, crossedAssignments)
        assert.deepEqual(await assignments(crossed.page), crossedAssignments)

        const attemptBefore = await attemptNumber(crossed.page)
        await clickCheckAndWaitFor(crossed.page, 'failure')
        const attemptAfter = await attemptNumber(crossed.page)
        assert.ok(attemptAfter > attemptBefore)
        assert.equal(await crossed.page.locator('.lia-quiz__feedback.text-success').count(), 0)

        await crossed.page.waitForTimeout(1_500)
        await crossed.page.reload({ waitUntil: 'domcontentloaded' })
        await waitForCompiledCount(crossed.page, GROUP, 4)
        assert.deepEqual(await assignments(crossed.page), Array(20).fill(null))
        assert.deepEqual(await visibleTargetCounts(crossed.page), [1, 1, 1, 1])
        assert.equal(await attemptNumber(crossed.page), 0)
        assert.equal(await crossed.page.locator('.lia-quiz__feedback.text-success').count(), 0)

        await makeResolveAvailable(crossed.page)
        await crossed.page.locator(RESOLVE).click()
        await crossed.page.locator('.lia-quiz__feedback.text-disabled').waitFor({
          state: 'visible',
          timeout: COMPILE_TIMEOUT,
        })
        assert.equal(await crossed.page.locator(CHECK).count(), 1)
        assert.equal(await crossed.page.locator(RESOLVE).count(), 1)
        assertNoRuntimeErrors(crossed)
      })

      await t.test('standalone and adjacent macros remain independent', async () => {
        const session = await createSession(browser)
        t.after(async () => session.context.close())

        await openCourse(session.page, 'tests/fixtures/kachelfolge-import.md', 2, SEQUENCE, 2)
        await assertIndependentSequences(session.page, [4, 3], false)
        await openCourse(session.page, 'tests/fixtures/kachelfolge-import.md', 3, SEQUENCE, 6)
        await assertIndependentSequences(session.page, [2, 2, 2, 2, 2, 2], false)
        await openCourse(session.page, 'tests/fixtures/kachelfolge-n-import.md', 2, SEQUENCE, 2)
        await assertIndependentSequences(session.page, [4, 3], true)
        await openCourse(session.page, 'tests/fixtures/kachelfolge-n-import.md', 3, SEQUENCE, 2)
        await assertIndependentSequences(session.page, [2, 2], true)
        assertNoRuntimeErrors(session)
      })
    },
  )
}

async function startDevServer() {
  const port = await availablePort()
  const origin = `http://${HOST}:${port}`
  const childProgram = String.raw`
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const [library, packageRoot, nodeModules, input, port, host] = process.argv.slice(1)
    const devserver = require(library)
    devserver.init(packageRoot, nodeModules)
    await devserver.start(Number(port), host, input)
    const close = () => {
      devserver.stop()
      setTimeout(() => process.exit(0), 25)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  `
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      childProgram,
      devServerLibrary,
      devServerPackage,
      nodeModules,
      root,
      String(port),
      HOST,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  let output = ''
  let exit = null
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-12_000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.once('exit', (code, signal) => {
    exit = { code, signal }
  })

  const deadline = Date.now() + START_TIMEOUT
  while (Date.now() < deadline) {
    if (exit) throw new Error(`devserver exited early: ${JSON.stringify(exit)}\n${output}`)
    try {
      const response = await fetch(`${origin}/liascript/index.html`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) {
        return {
          origin,
          async stop() {
            if (child.exitCode !== null || child.signalCode !== null) return
            child.kill()
            await Promise.race([
              once(child, 'exit'),
              new Promise((resolve) => setTimeout(resolve, 3_000)),
            ])
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL')
              await once(child, 'exit')
            }
          },
        }
      }
    } catch {
      // Listening starts asynchronously.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill()
  throw new Error(`devserver did not start at ${origin}\n${output}`)
}

async function availablePort() {
  const socket = createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, HOST, resolve)
  })
  const address = socket.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function createSession(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const externalRequests = []
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin !== server.origin
    ) {
      externalRequests.push(url.href)
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })
  await context.addInitScript(installRuntimeProbe)

  const page = await context.newPage()
  const pageErrors = []
  const kachelErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /lia-Kachel|LiaKachel|KachelfolgeSpecError/.test(message.text())
    ) {
      kachelErrors.push(message.text())
    }
  })
  return { context, externalRequests, kachelErrors, page, pageErrors }
}

function installRuntimeProbe() {
  let installingKachelBundle = false
  const nativeAppendChild = Node.prototype.appendChild
  Node.prototype.appendChild = function (node) {
    if (node?.id === 'lia-kachel-styles') {
      installingKachelBundle = true
      queueMicrotask(() => {
        installingKachelBundle = false
      })
    }
    return nativeAppendChild.call(this, node)
  }
  const fromKachelBundle = () => {
    if (installingKachelBundle) return true
    if ((document.currentScript?.src ?? '').includes('/dist/index.js')) return true
    return new Error().stack?.includes('/dist/index.js') ?? false
  }

  const NativeObserver = window.MutationObserver
  const observers = []
  window.MutationObserver = class extends NativeObserver {
    constructor(callback) {
      super(callback)
      this.__probe = { active: false, owned: fromKachelBundle(), root: false }
      observers.push(this.__probe)
    }
    observe(target, options) {
      this.__probe.active = true
      this.__probe.root = target === document.documentElement
      return super.observe(target, options)
    }
    disconnect() {
      this.__probe.active = false
      return super.disconnect()
    }
  }

  const listeners = []
  const nativeAdd = EventTarget.prototype.addEventListener
  const nativeRemove = EventTarget.prototype.removeEventListener
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
    if (fromKachelBundle()) {
      const duplicate = listeners.some(
        (entry) =>
          entry.active &&
          entry.target === this &&
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === capture,
      )
      if (!duplicate) {
        listeners.push({ active: true, capture, listener, target: this, type })
      }
    }
    return nativeAdd.call(this, type, listener, options)
  }
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
    listeners.forEach((entry) => {
      if (
        entry.active &&
        entry.target === this &&
        entry.type === type &&
        entry.listener === listener &&
        entry.capture === capture
      ) {
        entry.active = false
      }
    })
    return nativeRemove.call(this, type, listener, options)
  }

  window.__liaKachelBrowserProbe = {
    snapshot() {
      const activeListeners = listeners.filter((entry) => entry.active)
      const byType = {}
      activeListeners.forEach((entry) => {
        byType[entry.type] = (byType[entry.type] ?? 0) + 1
      })
      const ownedObservers = observers.filter((entry) => entry.owned)
      return {
        activeListeners: activeListeners.length,
        activeObservers: ownedObservers.filter((entry) => entry.active).length,
        byType,
        createdListeners: listeners.length,
        createdObservers: ownedObservers.length,
        rootObservers: ownedObservers.filter((entry) => entry.active && entry.root).length,
      }
    },
  }
}

async function openCourse(page, fixture, slide, selector, count) {
  const course = `${server.origin}/${fixture}`
  await page.goto(`${server.origin}/liascript/index.html?${course}#${slide}`, {
    waitUntil: 'domcontentloaded',
    timeout: COMPILE_TIMEOUT,
  })
  await waitForCompiledCount(page, selector, count)
  assert.ok(page.url().startsWith(server.origin), 'course did not use the local devserver')
}

async function waitForCompiledCount(page, selector, count) {
  await page.waitForFunction(
    ({ count, selector }) =>
      document.querySelectorAll(selector).length === count &&
      typeof window.LiaKachel?.kachelfolge?.check === 'function',
    { count, selector },
    { timeout: COMPILE_TIMEOUT },
  )
  await page.waitForTimeout(100)
}

async function assertGroupedTableStructure(page) {
  const structure = await page.evaluate(
    ({ CHECK, DUMMY, GROUP, RESOLVE, SOURCE, TARGET }) => {
      const track = (handler) =>
        handler?.match(/track\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/)?.[1] ?? null
      const address = (handler) => {
        const match = handler?.match(
          /value\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/,
        )
        return match ? [Number(match[1]), Number(match[2])] : null
      }
      const targetId = (handler) => {
        const match = handler?.match(/param\s*:\s*\{\s*id\s*:\s*(\d+)/)
        return match ? Number(match[1]) : null
      }
      const wrappers = Array.from(document.querySelectorAll(GROUP))
      const table = wrappers[0]?.closest('table') ?? null
      const quizzes = Array.from(document.querySelectorAll('.lia-quiz'))
      const targets = Array.from(table?.querySelectorAll(TARGET) ?? [])
      const sources = Array.from(document.querySelectorAll(SOURCE))
      return {
        api: typeof window.LiaKachel?.kachelgruppen?.check,
        checkCount: document.querySelectorAll(CHECK).length,
        dummyCount: table?.querySelectorAll(DUMMY).length ?? 0,
        quizCount: quizzes.length,
        resolveCount: document.querySelectorAll(RESOLVE).length,
        rowCellCounts: Array.from(table?.rows ?? []).map((row) => row.cells.length),
        rows: table?.rows.length ?? 0,
        sourceAddresses: sources.map((source) => address(source.getAttribute('ondragend'))),
        sourceTracks: sources.map((source) => track(source.getAttribute('ondragend'))),
        targetIds: targets.map((target) => targetId(target.getAttribute('ondragover'))),
        targetTracks: targets.map((target) => track(target.getAttribute('ondragover'))),
        wrappers: wrappers.map((wrapper) => ({
          cell: wrapper.closest('td')?.cellIndex ?? null,
          row: wrapper.closest('tr')?.rowIndex ?? null,
          table: wrapper.closest('table') === table,
          targets: wrapper.querySelectorAll(TARGET).length,
        })),
      }
    },
    { CHECK, DUMMY, GROUP, RESOLVE, SOURCE, TARGET },
  )

  assert.equal(structure.api, 'function')
  assert.equal(structure.rows, 5)
  assert.deepEqual(structure.rowCellCounts, [2, 2, 2, 2, 2])
  assert.deepEqual(
    structure.wrappers,
    GROUPS.map((group, index) => ({
      cell: 1,
      row: index + 1,
      table: true,
      targets: group.count,
    })),
  )
  assert.equal(structure.dummyCount, 4)
  assert.equal(structure.quizCount, 1)
  assert.equal(structure.checkCount, 1)
  assert.equal(structure.resolveCount, 1)
  assert.deepEqual(structure.targetIds, Array.from({ length: 20 }, (_, index) => index))
  assert.deepEqual(
    structure.sourceAddresses.slice().sort(compareAddresses),
    canonicalAssignments().slice().sort(compareAddresses),
  )
  assert.equal(new Set(structure.targetTracks).size, 1)
  assert.equal(new Set(structure.sourceTracks).size, 1)
  assert.equal(structure.targetTracks[0], structure.sourceTracks[0])
  assert.ok(structure.targetTracks[0], 'native LiaScript track was not found')
  await assertRuntimeShape(page)
}

async function assertRuntimeShape(page) {
  const shape = await page.evaluate(
    ({ DUMMY, GROUP }) => ({
      dummies: document.querySelectorAll(DUMMY).length,
      styles: document.querySelectorAll('#lia-kachel-styles[data-lia-kachel-styles]').length,
      wrappers: document.querySelectorAll(GROUP).length,
    }),
    { DUMMY, GROUP },
  )
  assert.deepEqual(shape, { dummies: 4, styles: 1, wrappers: 4 })
}

async function visibleTargetCounts(page) {
  return page.locator(GROUP).evaluateAll(
    (wrappers, targetSelector) =>
      wrappers.map(
        (wrapper) =>
          Array.from(wrapper.querySelectorAll(targetSelector)).filter(
            (target) => getComputedStyle(target).display !== 'none',
          ).length,
      ),
    TARGET,
  )
}

async function visibleDummyIndexes(page) {
  return page.locator(GROUP).evaluateAll(
    (wrappers, dummySelector) =>
      wrappers.flatMap((wrapper, index) => {
        const dummy = wrapper.querySelector(dummySelector)
        return dummy && getComputedStyle(dummy).display !== 'none' ? [index] : []
      }),
    DUMMY,
  )
}

async function assertDummyIsInert(page, groupIndex) {
  const state = await page.locator(GROUP).nth(groupIndex).evaluate(
    (wrapper, dummySelector) => {
      const dummy = wrapper.querySelector(dummySelector)
      if (!dummy) throw new Error('dummy not found')
      dummy.focus()
      return {
        active: document.activeElement === dummy,
        ariaHidden: dummy.getAttribute('aria-hidden'),
        inert: dummy.inert,
        interactiveDescendants: Array.from(
          dummy.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'),
        ).filter((element) => element.tabIndex >= 0).length,
        tabIndex: dummy.tabIndex,
      }
    },
    DUMMY,
  )
  assert.deepEqual(state, {
    active: false,
    ariaHidden: 'true',
    inert: true,
    interactiveDescendants: 0,
    tabIndex: -1,
  })
}

async function fillReverseGroup(page, group, skip = 0) {
  for (let offset = skip; offset < group.count; offset += 1) {
    await dragAddressToTarget(
      page,
      [group.start + group.count - 1 - offset, 0],
      group.start + offset,
    )
  }
}

async function fillAssignments(page, targetAssignments) {
  for (let target = 0; target < targetAssignments.length; target += 1) {
    await dragAddressToTarget(page, targetAssignments[target], target)
  }
}

async function dragAddressToTarget(page, address, targetId) {
  const sourceIndex = await page.locator(SOURCE).evaluateAll(
    (sources, expected) =>
      sources.findIndex((source) => {
        const match = source
          .getAttribute('ondragend')
          ?.match(/value\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/)
        return (
          match &&
          Number(match[1]) === expected[0] &&
          Number(match[2]) === expected[1]
        )
      }),
    address,
  )
  const targetIndex = await page.locator(TARGET).evaluateAll(
    (targets, expected) =>
      targets.findIndex((target) => {
        const match = target
          .getAttribute('ondragover')
          ?.match(/param\s*:\s*\{\s*id\s*:\s*(\d+)/)
        return match && Number(match[1]) === expected
      }),
    targetId,
  )
  assert.notEqual(sourceIndex, -1, `source address ${address.join(',')} not found`)
  assert.notEqual(targetIndex, -1, `target ${targetId} not found`)

  const source = page.locator(SOURCE).nth(sourceIndex)
  const target = page.locator(TARGET).nth(targetIndex)
  assert.equal(await target.isVisible(), true, `target ${targetId} is hidden`)
  await source.dragTo(target, { timeout: 15_000 })
  try {
    await page.waitForFunction(
      ({ address, placedSourceSelector, targetId, targetSelector }) => {
      const target = Array.from(document.querySelectorAll(targetSelector)).find(
        (candidate) => {
          const match = candidate
            .getAttribute('ondragover')
            ?.match(/param\s*:\s*\{\s*id\s*:\s*(\d+)/)
          return match && Number(match[1]) === targetId
        },
      )
      const match = target
        ?.querySelector(placedSourceSelector)
        ?.getAttribute('ondragend')
        ?.match(/value\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/)
      return match && Number(match[1]) === address[0] && Number(match[2]) === address[1]
      },
      {
        address,
        placedSourceSelector: PLACED_SOURCE,
        targetId,
        targetSelector: TARGET,
      },
      { timeout: 15_000 },
    )
  } catch (error) {
    const debug = await page.evaluate(
      ({ SOURCE, TARGET, targetId }) => ({
        sources: Array.from(document.querySelectorAll(SOURCE)).map((node) => ({
          handler: node.getAttribute('ondragend'),
          parent: node.parentElement?.tagName,
          text: node.textContent,
        })),
        target: Array.from(document.querySelectorAll(TARGET))
          .find((node) => node.getAttribute('ondragover')?.includes(`id: ${targetId}`))
          ?.outerHTML,
      }),
      { SOURCE, TARGET, targetId },
    )
    throw new Error(`drag ${address.join(',')} -> ${targetId} failed: ${JSON.stringify(debug)}`, {
      cause: error,
    })
  }
  await page.waitForTimeout(20)
}

async function assignments(page) {
  return page.locator(TARGET).evaluateAll((targets, placedSourceSelector) => {
    const id = (target) => {
      const match = target
        .getAttribute('ondragover')
        ?.match(/param\s*:\s*\{\s*id\s*:\s*(\d+)/)
      return match ? Number(match[1]) : -1
    }
    return targets
      .slice()
      .sort((left, right) => id(left) - id(right))
      .map((target) => {
        const match = target
          .querySelector(placedSourceSelector)
          ?.getAttribute('ondragend')
          ?.match(/value\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/)
        return match ? [Number(match[1]), Number(match[2])] : null
      })
  }, PLACED_SOURCE)
}

function canonicalAssignments() {
  return Array.from({ length: 20 }, (_, index) => [index, 0])
}

function reverseAssignments() {
  return GROUPS.flatMap(({ count, start }) =>
    Array.from({ length: count }, (_, offset) => [start + count - 1 - offset, 0]),
  )
}

function compareAddresses(left, right) {
  return left[0] - right[0] || left[1] - right[1]
}

async function attemptNumber(page) {
  const text = (await page.locator(CHECK).innerText()).trim()
  const numbers = text.match(/\d+/g)
  return numbers ? Number(numbers.at(-1)) : 0
}

async function clickCheckAndWaitFor(page, outcome) {
  const feedback =
    outcome === 'success'
      ? '.lia-quiz__feedback.text-success'
      : '.lia-quiz__feedback.text-error'
  const check = page.locator(CHECK)
  assert.equal(await check.count(), 1)
  assert.equal(await check.isEnabled(), true, 'native LiaScript check is disabled')
  await check.click()
  await page.locator(feedback).waitFor({ state: 'visible', timeout: COMPILE_TIMEOUT })
}

async function makeResolveAvailable(page) {
  const resolve = page.locator(RESOLVE)
  assert.equal(await resolve.count(), 1)
  for (let attempts = 0; attempts < 3; attempts += 1) {
    if ((await resolve.isVisible()) && (await resolve.isEnabled())) return
    await clickCheckAndWaitFor(page, 'failure')
  }
  assert.fail('native LiaScript resolve control did not become available')
}

async function revisitSlide(page, away, back) {
  await page.evaluate((slide) => {
    location.hash = `#${slide}`
  }, away)
  await page.locator(GROUP).first().waitFor({ state: 'hidden', timeout: COMPILE_TIMEOUT })
  await page.evaluate((slide) => {
    location.hash = `#${slide}`
  }, back)
  await waitForCompiledCount(page, GROUP, 4)
  await page.locator(GROUP).first().waitFor({ state: 'visible', timeout: COMPILE_TIMEOUT })
}

async function assertPersistedSuccess(page, expectedAssignments = null) {
  assert.equal(await page.locator('.lia-quiz__feedback.text-success').count(), 1)
  if (expectedAssignments) {
    assert.deepEqual(await assignments(page), expectedAssignments)
    assert.deepEqual(await visibleDummyIndexes(page), [0, 1, 2, 3])
  }
  assert.equal(await page.locator(CHECK).count(), 1)
  assert.equal(await page.locator(RESOLVE).count(), 1)
}

async function assertReloadReset(page) {
  assert.equal(await page.locator('.lia-quiz__feedback').count(), 0)
  assert.equal(await attemptNumber(page), 0)
  assert.deepEqual(await assignments(page), Array(20).fill(null))
  assert.deepEqual(await visibleTargetCounts(page), [1, 1, 1, 1])
  assert.deepEqual(await visibleDummyIndexes(page), [])
  assert.equal(await page.locator(CHECK).count(), 1)
  assert.equal(await page.locator(RESOLVE).count(), 1)
}

async function probeSnapshot(page) {
  return page.evaluate(() => window.__liaKachelBrowserProbe.snapshot())
}

async function assertNoDuplicateRuntime(page, before) {
  await page.waitForTimeout(300)
  await assertRuntimeShape(page)
  const current = await probeSnapshot(page)
  assert.ok(before.activeListeners > 0, 'bundle listener probe found no listeners')
  assert.ok(before.activeObservers > 0, 'bundle observer probe found no observers')
  assert.deepEqual(current, before)
}

async function assertIndependentSequences(page, targetCounts, progressive) {
  const result = await page.locator(SEQUENCE).evaluateAll(
    (wrappers, { CHECK, DUMMY, TARGET }) => {
      const quizzes = Array.from(document.querySelectorAll('.lia-quiz'))
      const wrapperTracks = wrappers.map((wrapper) =>
        Array.from(wrapper.querySelectorAll(TARGET)).map(
          (target) =>
            target
              .getAttribute('ondragover')
              ?.match(/track\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/)?.[1] ?? null,
        ),
      )
      return {
        checkCount: document.querySelectorAll(CHECK).length,
        dummyCounts: wrappers.map((wrapper) => wrapper.querySelectorAll(DUMMY).length),
        quizCount: quizzes.length,
        targetCounts: wrappers.map((wrapper) => wrapper.querySelectorAll(TARGET).length),
        distinctWrapperTracks: new Set(wrapperTracks.map((tracks) => tracks[0])).size,
        trackCounts: wrapperTracks.map((tracks) => new Set(tracks).size),
        visibleTargets: wrappers.map(
          (wrapper) =>
            Array.from(wrapper.querySelectorAll(TARGET)).filter(
              (target) => getComputedStyle(target).display !== 'none',
            ).length,
        ),
      }
    },
    { CHECK, DUMMY, TARGET },
  )
  const count = targetCounts.length
  assert.equal(result.quizCount, count)
  assert.equal(result.checkCount, count)
  assert.equal(result.distinctWrapperTracks, count)
  assert.deepEqual(result.targetCounts, targetCounts)
  assert.deepEqual(result.trackCounts, Array(count).fill(1))
  if (progressive) {
    assert.deepEqual(result.dummyCounts, Array(count).fill(1))
    assert.deepEqual(result.visibleTargets, Array(count).fill(1))
  } else {
    assert.deepEqual(result.dummyCounts, Array(count).fill(0))
    assert.deepEqual(result.visibleTargets, targetCounts)
  }
  assert.equal(await page.locator('#lia-kachel-styles').count(), 1)
}

function assertNoRuntimeErrors(session) {
  assert.deepEqual(session.pageErrors, [], 'browser page errors occurred')
  assert.deepEqual(session.kachelErrors, [], 'lia-Kachel logged browser errors')
  assert.deepEqual(
    session.externalRequests,
    [],
    'the local browser fixture attempted to use an online host',
  )
}

async function assertPreviewHasNoCourseDatabase(page) {
  const databaseNames = await page.evaluate(async () =>
    (await indexedDB.databases())
      .map((database) => database.name)
      .filter(Boolean),
  )
  // The pinned local devserver preview does not provide LiaScript's hosted
  // course-state database. Persistent DOM is therefore exercised on slide
  // revisit, while a full preview reload is expected to start a fresh quiz.
  assert.deepEqual(databaseNames, [])
}
