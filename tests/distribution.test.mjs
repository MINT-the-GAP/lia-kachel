import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const projectRoot = new URL('../', import.meta.url)
const fromProject = (path) => new URL(path, projectRoot)

const exactRegionExample = `<div class="Kachel">

Wähle in den ersten drei Feldern gelb und danach rot aus.

<!-- data-solution-button="5" data-randomize="true" -->
In diese Lücke muss [->[(gelb)]] rein. \\
In diese muss auch [->[(gelb)]] rein und in diese [->[(gelb)]] auch. \\
Das Adjektiv [->[(rot)]] ist [->[pink|grün|(rot)]].

</div>`

async function authoredTemplateFiles() {
  const sourceEntries = await readdir(fromProject('src/'), {
    withFileTypes: true,
  })
  const fixtureEntries = await readdir(fromProject('tests/fixtures/'), {
    withFileTypes: true,
  })

  return [
    'README.md',
    'styles.css',
    'dist/index.js',
    ...sourceEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => `src/${entry.name}`),
    ...fixtureEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `tests/fixtures/${entry.name}`),
  ]
}

function runtimeWithoutObservers(registrations) {
  const windowStub = {
    PointerEvent: function PointerEvent() {},
    addEventListener(type, listener, options) {
      registrations.push(['window', type, listener, options])
    },
    removeEventListener() {},
    setTimeout() {
      return 1
    },
    clearTimeout() {},
  }
  const documentStub = {
    defaultView: windowStub,
    visibilityState: 'visible',
    addEventListener(type, listener, options) {
      registrations.push(['document', type, listener, options])
    },
    removeEventListener() {},
    querySelectorAll() {
      return []
    },
  }
  windowStub.document = documentStub

  return { documentStub, windowStub }
}

test('the LiaScript template references relative assets and documents the literal region syntax', async () => {
  const readme = await readFile(fromProject('README.md'), 'utf8')
  const stylesheet = await readFile(fromProject('styles.css'), 'utf8')
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')

  assert.match(readme, /^script:\s*\.\/dist\/index\.js\s*$/m)
  assert.match(readme, /^link:\s*\.\/styles\.css\s*$/m)
  assert.match(readme, /^@Kachelfolge:\s*@Kachelfolge_\(@uid,`@0`\)\s*$/m)
  assert.match(
    readme,
    /^@KachelfolgeN:\s*@KachelfolgeN_\(@uid,`@0`\)\s*$/m,
  )
  assert.match(
    readme,
    /<script>\s*window\.LiaKachel\.kachelfolge\.check\("@0", "@'1"\)\s*<\/script>/,
  )
  assert.equal(
    readme.match(/<\/script>\r?\n\r?\n@end/g)?.length,
    2,
    'only the two kachelfolge block macros remain',
  )
  assert.ok(
    readme.replace(/\r\n/g, '\n').includes(exactRegionExample),
    'the newest user example must be copyable without a macro or script',
  )
  assert.match(readme, /data-lia-kachelfolge-mode="progressive"/)
  assert.doesNotMatch(readme, /<script\s+modify=.*kachelfolge/i)
  assert.ok(stylesheet.length > 0)
  assert.doesNotMatch(stylesheet, /\[aria-grabbed='true'\]/)
  assert.doesNotMatch(stylesheet, /:(?:where|has)\(/)
  assert.match(stylesheet, /data-lia-kachelfolge-visible='true'/)
  assert.ok(bundle.length > 0)
  assert.doesNotMatch(bundle, /\?\?/)
  assert.doesNotMatch(bundle, /\?\.[A-Za-z[(]/)
})

test('the retired content macro and marker vocabulary is absent from authored artifacts', async () => {
  const files = await authoredTemplateFiles()
  const retiredTokens = [
    '@Kachel' + 'n',
    'data-lia-kachel' + 'n',
    'lia-kachel' + 'n-',
  ]

  for (const path of files) {
    const content = await readFile(fromProject(path), 'utf8')
    retiredTokens.forEach((token) => {
      assert.equal(
        content.includes(token),
        false,
        `${token} must be absent from ${path}`,
      )
    })
  }

  assert.equal(
    files.some((path) => new RegExp('kachel' + 'n', 'i').test(path)),
    false,
    'the retired macro name must not survive as a fixture or source filename',
  )
})

test('the package target has one stable browser bundle', async () => {
  const packageJson = JSON.parse(
    await readFile(fromProject('package.json'), 'utf8'),
  )
  const gitignore = await readFile(fromProject('.gitignore'), 'utf8')

  assert.equal(packageJson.app, 'dist/index.js')
  assert.equal(packageJson.targets.app.context, 'browser')
  assert.equal(packageJson.targets.app.outputFormat, 'global')
  assert.equal(packageJson.targets.app.sourceMap, false)
  assert.deepEqual(packageJson.targets.app.engines.browsers, [
    'defaults',
    'Safari >= 12',
    'iOS >= 12',
  ])
  assert.doesNotMatch(gitignore, /^\/?dist\/?$/m)
})

test('the browser fixture imports this template and keeps quiz rows intact', async () => {
  const fixtureUrl = fromProject('tests/fixtures/touch-import.md')
  const fixture = await readFile(fixtureUrl, 'utf8')
  const importPath = fixture.match(/^import:\s*(\S+)\s*$/m)?.[1]
  const quizRows = fixture
    .split(/\r?\n/)
    .filter((line) => line.includes('[->['))
  const targetsPerRow = quizRows.map(
    (line) => line.match(/\[->\[/g)?.length ?? 0,
  )

  assert.ok(importPath)
  assert.equal(new URL(importPath, fixtureUrl).href, fromProject('README.md').href)
  assert.deepEqual(targetsPerRow, [3, 3, 12])
})

test('the unordered-quiz fixture imports the template with isolated N-sized macros', async () => {
  const fixtureUrl = fromProject('tests/fixtures/kachelfolge-import.md')
  const fixture = await readFile(fixtureUrl, 'utf8')
  const importPath = fixture.match(/^import:\s*(\S+)\s*$/m)?.[1]
  const invocations = [...fixture.matchAll(/^@Kachelfolge\(`([^`]*)`\)$/gm)]
  const targetCounts = invocations.map(
    ([, spec]) => spec.match(/\[->\[/g)?.length ?? 0,
  )

  assert.ok(importPath)
  assert.equal(new URL(importPath, fixtureUrl).href, fromProject('README.md').href)
  assert.deepEqual(targetCounts, [4, 3, 2, 2, 2, 2, 2, 2, 1, 12])
})

test('the progressive fixture imports arbitrary and adjacent @KachelfolgeN macros', async () => {
  const fixtureUrl = fromProject('tests/fixtures/kachelfolge-n-import.md')
  const fixture = await readFile(fixtureUrl, 'utf8')
  const importPath = fixture.match(/^import:\s*(\S+)\s*$/m)?.[1]
  const invocations = [...fixture.matchAll(/^@KachelfolgeN\(`([^`]*)`\)$/gm)]
  const targetCounts = invocations.map(
    ([, spec]) => spec.match(/\[->\[/g)?.length ?? 0,
  )

  assert.ok(importPath)
  assert.equal(new URL(importPath, fixtureUrl).href, fromProject('README.md').href)
  assert.deepEqual(targetCounts, [4, 3, 2, 2, 1, 12])
})

test('the content fixture imports native quizzes and multiple tracks inside div.Kachel regions', async () => {
  const fixtureUrl = fromProject('tests/fixtures/kachel-region-import.md')
  const fixture = await readFile(fixtureUrl, 'utf8')
  const importPath = fixture.match(/^import:\s*(\S+)\s*$/m)?.[1]
  const normalized = fixture.replace(/\r\n/g, '\n')
  const regions = [
    ...normalized.matchAll(
      /<div\s+class="([^"]*\bKachel\b[^"]*)"\s*>([\s\S]*?)<\/div>/g,
    ),
  ]
  const targetCounts = regions.map(
    ([, , body]) => body.match(/\[->\[/g)?.length ?? 0,
  )

  assert.ok(importPath)
  assert.equal(new URL(importPath, fixtureUrl).href, fromProject('README.md').href)
  assert.deepEqual(targetCounts, [5, 4, 2, 2, 1, 12, 4])
  assert.equal(regions[1][1], 'Kachel extra-klasse')
  assert.ok(normalized.includes(exactRegionExample))
  assert.match(
    regions[4][2],
    /Einzelwert:\s*\[->\[solo\]\]\./,
    'a one-target fixture must remain an inline native Multi-Drop quiz',
  )
  assert.doesNotMatch(regions[4][2].trim(), /^\[->\[solo\]\]$/)
  assert.match(
    regions[6][2],
    /Erster Quizabsatz:[\s\S]+\n\nZweiter Quizabsatz:/,
    'one .Kachel region must cover two independent native quiz paragraphs',
  )
  assert.doesNotMatch(fixture, /<script\b/i)
  assert.equal(fixture.includes('data-lia-kachel' + 'n'), false)
  assert.equal(fixture.includes('@Kachel' + 'n'), false)
})

test('the generated bundle is classic JavaScript, exposes content helpers and installs once', async () => {
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')
  const registrations = []
  const { documentStub, windowStub } =
    runtimeWithoutObservers(registrations)
  const context = vm.createContext({
    console,
    document: documentStub,
    window: windowStub,
  })
  const script = new vm.Script(bundle, { filename: 'dist/index.js' })

  script.runInContext(context)
  const registrationCount = registrations.length
  script.runInContext(context)

  assert.ok(registrationCount > 0)
  assert.equal(registrations.length, registrationCount)
  assert.ok(
    registrations.some(
      ([target, type]) => target === 'document' && type === 'pointerdown',
    ),
  )
  assert.equal(
    registrations.filter(
      ([target, type, , options]) =>
        target === 'document' && type === 'click' && options === true,
    ).length,
    2,
    'touch click suppression and content normalization are each attached once',
  )
  assert.equal(
    typeof windowStub.LiaKachel.content.correctOptions,
    'function',
  )
  assert.equal(
    typeof windowStub.LiaKachel.content.planAssignments,
    'function',
  )
  assert.equal(windowStub.LiaKachel['kachel' + 'n'], undefined)
})

test('progressive and content observers install once and batch local mutations', async () => {
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')
  const observers = []
  const frames = []
  const selectors = []
  let paragraphQueryCount = 0
  let regionQueryCount = 0
  let marker
  const paragraph = {
    querySelectorAll(selector) {
      paragraphQueryCount += 1
      return selector.includes('data-lia-kachelfolge-mode') ? [marker] : []
    },
  }
  marker = {
    isConnected: true,
    closest() {
      return paragraph
    },
    matches() {
      return true
    },
    querySelectorAll() {
      return []
    },
  }
  const progressiveMutationTarget = {
    nodeType: 1,
    closest() {
      return paragraph
    },
    matches() {
      return false
    },
    querySelectorAll() {
      return []
    },
  }
  const region = {
    nodeType: 1,
    isConnected: true,
    closest(selector) {
      return selector === 'div.Kachel' ? this : null
    },
    matches(selector) {
      return selector === 'div.Kachel'
    },
    querySelectorAll() {
      regionQueryCount += 1
      return []
    },
  }
  class MutationObserverStub {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }

    observe(target, options) {
      this.target = target
      this.options = options
    }

    disconnect() {}
  }
  const windowStub = {
    MutationObserver: MutationObserverStub,
    PointerEvent: function PointerEvent() {},
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(callback) {
      frames.push(callback)
      return frames.length
    },
    cancelAnimationFrame() {},
    setTimeout() {
      return 1
    },
    clearTimeout() {},
  }
  const documentStub = {
    defaultView: windowStub,
    documentElement: {},
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll(selector) {
      selectors.push(selector)
      return []
    },
  }
  windowStub.document = documentStub

  const context = vm.createContext({
    console,
    document: documentStub,
    window: windowStub,
  })
  const script = new vm.Script(bundle, { filename: 'dist/index.js' })

  script.runInContext(context)
  script.runInContext(context)

  assert.equal(observers.length, 2)
  observers.forEach((observer) => {
    assert.equal(observer.target, documentStub.documentElement)
    assert.equal(observer.options.childList, true)
    assert.equal(observer.options.subtree, true)
  })
  assert.ok(selectors.includes('div.Kachel'))

  const [progressiveObserver, contentObserver] = observers
  const progressiveMutation = {
    addedNodes: [],
    target: progressiveMutationTarget,
  }
  progressiveObserver.callback([progressiveMutation])
  progressiveObserver.callback([progressiveMutation])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.ok(paragraphQueryCount > 0)

  const globalQueriesBeforeRegionMutation = selectors.length
  const regionMutation = { addedNodes: [], target: region }
  contentObserver.callback([regionMutation])
  contentObserver.callback([regionMutation])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.ok(regionQueryCount > 0)
  assert.equal(
    selectors.length,
    globalQueriesBeforeRegionMutation,
    'native region mutations must not trigger a document-wide scan',
  )
})

test('the bundle installs a touch-event fallback without Pointer Events', async () => {
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')
  const registrations = []
  const windowStub = {
    addEventListener(type) {
      registrations.push(['window', type])
    },
    removeEventListener() {},
    setTimeout() {
      return 1
    },
    clearTimeout() {},
  }
  const documentStub = {
    defaultView: windowStub,
    visibilityState: 'visible',
    addEventListener(type, listener, options) {
      registrations.push(['document', type, options])
    },
    removeEventListener() {},
    querySelectorAll() {
      return []
    },
  }
  windowStub.document = documentStub

  const script = new vm.Script(bundle, { filename: 'dist/index.js' })
  script.runInNewContext({
    console,
    document: documentStub,
    window: windowStub,
  })

  const documentEventTypes = registrations
    .filter(([target]) => target === 'document')
    .map(([, type]) => type)

  assert.ok(documentEventTypes.includes('touchstart'))
  assert.ok(documentEventTypes.includes('touchmove'))
  assert.ok(documentEventTypes.includes('touchend'))
  assert.ok(documentEventTypes.includes('touchcancel'))
  assert.ok(!documentEventTypes.includes('pointerdown'))
})
