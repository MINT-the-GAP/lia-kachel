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
  const styleNodes = new Map()
  const styleHost = {
    appendChild(node) {
      styleNodes.set(node.id, node)
      return node
    },
  }
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
    documentElement: styleHost,
    head: styleHost,
    visibilityState: 'visible',
    addEventListener(type, listener, options) {
      registrations.push(['document', type, listener, options])
    },
    removeEventListener() {},
    querySelectorAll() {
      return []
    },
    createElement(tagName) {
      assert.equal(tagName, 'style')
      const attributes = new Map()
      return {
        id: '',
        textContent: '',
        setAttribute(name, value) {
          attributes.set(name, String(value))
        },
        getAttribute(name) {
          return attributes.get(name) ?? null
        },
      }
    },
    getElementById(id) {
      return styleNodes.get(id) ?? null
    },
  }
  windowStub.document = documentStub

  return { documentStub, styleNodes, windowStub }
}

test('the LiaScript template references relative assets and documents the literal region syntax', async () => {
  const readme = await readFile(fromProject('README.md'), 'utf8')
  const stylesheet = await readFile(fromProject('styles.css'), 'utf8')
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')

  assert.match(readme, /^script:\s*\.\/dist\/index\.js\s*$/m)
  assert.doesNotMatch(readme, /^link:/m)
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
  assert.match(
    readme,
    /<div id="lia-kachelfolge-@0" data-lia-kachelfolge="@0">\s*@1\s*<\/div>/,
  )
  assert.match(
    readme,
    /<div id="lia-kachelfolge-@0" data-lia-kachelfolge="@0" data-lia-kachelfolge-mode="progressive">\s*@1<span data-lia-kachelfolge-dummy="true" aria-hidden="true" inert>✛<\/span>\s*<\/div>/,
  )
  assert.doesNotMatch(readme, /<script\s+modify=.*kachelfolge/i)
  assert.ok(stylesheet.length > 0)
  assert.doesNotMatch(stylesheet, /\[aria-grabbed='true'\]/)
  assert.doesNotMatch(stylesheet, /:(?:where|has)\(/)
  assert.match(stylesheet, /data-lia-kachelfolge-visible='true'/)
  assert.match(stylesheet, /data-lia-kachelfolge-dummy='true'/)
  assert.match(
    stylesheet,
    /\[data-lia-kachelfolge-mode='progressive'\]\s+span/,
  )
  assert.doesNotMatch(
    stylesheet,
    /\[data-lia-kachelfolge-mode='progressive'\]\s*[~+]/,
  )
  assert.ok(bundle.length > 0)
  assert.match(bundle, /lia-kachel-styles/)
  assert.match(bundle, /--lia-kachel-radius/)
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
  assert.deepEqual(targetCounts, [4, 3, 2, 2, 1, 3, 12])
  assert.match(
    fixture,
    /@KachelfolgeN\(`\[->\[\(Karmesin\)\]\]\[->\[\(Scharlach\)\]\]\[->\[\(Rubinrot\)\|Kobalt\]\]`\)/,
  )
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
  const { documentStub, styleNodes, windowStub } =
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
  assert.equal(styleNodes.size, 1)
  const installedStyles = styleNodes.get('lia-kachel-styles')
  assert.ok(installedStyles)
  assert.equal(installedStyles.getAttribute('data-lia-kachel-styles'), '')
  assert.match(
    installedStyles.textContent,
    /data-lia-kachelfolge-mode=progressive/,
  )
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

test('late imported progressive roots reveal N+1 while observers stay local', async () => {
  const bundle = await readFile(fromProject('dist/index.js'), 'utf8')
  const observers = []
  const frames = []
  const selectors = []
  let progressiveQueryCount = 0
  let regionQueryCount = 0
  let marker
  const progressiveRootSelector =
    "[data-lia-kachelfolge-mode='progressive']"
  const progressiveDummySelector =
    "[data-lia-kachelfolge-dummy='true']"
  const nativeTargetSelector =
    "span[role='button'][ondragover*='dragenter']"
  const track = '[["quiz",91],["input",0]]'
  const nativeHandler = (command, address = null) => {
    const value = address
      ? `, value: [${String(address[0])},${String(address[1])}]`
      : ''
    return `window.LIA.send({ track: ${track}, message: { cmd: '${command}', param: { id: 0${value} } } })`
  }

  const progressiveTarget = () => {
    const attributes = new Map([
      ['ondragover', nativeHandler('dragenter')],
    ])

    return {
      nodeType: 1,
      isConnected: true,
      children: [],
      closest(selector) {
        return selector === progressiveRootSelector ? marker : null
      },
      matches() {
        return false
      },
      querySelectorAll() {
        return []
      },
      getAttribute(name) {
        return attributes.get(name) ?? null
      },
      setAttribute(name, value) {
        attributes.set(name, String(value))
      },
      removeAttribute(name) {
        attributes.delete(name)
      },
      setAddress(address) {
        this.children.length = 0
        if (!address) return

        this.children.push({
          getAttribute(name) {
            if (name === 'draggable') return 'true'
            if (name === 'ondragend') {
              return nativeHandler('dragend', address)
            }
            return null
          },
        })
      },
    }
  }
  const progressiveTargets = [
    progressiveTarget(),
    progressiveTarget(),
    progressiveTarget(),
  ]
  const progressiveDummyAttributes = new Map()
  const progressiveDummy = {
    getAttribute(name) {
      return progressiveDummyAttributes.get(name) ?? null
    },
    setAttribute(name, value) {
      progressiveDummyAttributes.set(name, String(value))
    },
    removeAttribute(name) {
      progressiveDummyAttributes.delete(name)
    },
  }
  marker = {
    nodeType: 1,
    isConnected: true,
    closest(selector) {
      return selector === progressiveRootSelector ? this : null
    },
    matches(selector) {
      return selector === progressiveRootSelector
    },
    querySelectorAll(selector) {
      progressiveQueryCount += 1
      return selector === nativeTargetSelector ? progressiveTargets : []
    },
    querySelector(selector) {
      return selector === progressiveDummySelector ? progressiveDummy : null
    },
  }
  const progressiveMutationTarget = {
    nodeType: 1,
    closest() {
      return null
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
  const importedRootMutation = {
    addedNodes: [marker],
    target: progressiveMutationTarget,
  }
  const visibleTargets = () =>
    progressiveTargets.map(
      (target) =>
        target.getAttribute('data-lia-kachelfolge-visible') === 'true',
    )

  progressiveObserver.callback([importedRootMutation])
  progressiveObserver.callback([importedRootMutation])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.deepEqual(visibleTargets(), [true, false, false])
  assert.equal(
    progressiveDummy.getAttribute('data-lia-kachelfolge-visible'),
    null,
  )

  progressiveTargets[0].setAddress([0, 0])
  const firstPlacement = {
    addedNodes: [],
    target: progressiveTargets[0],
  }
  progressiveObserver.callback([firstPlacement])
  progressiveObserver.callback([firstPlacement])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.deepEqual(visibleTargets(), [true, true, false])

  progressiveTargets[1].setAddress([1, 0])
  progressiveObserver.callback([
    { addedNodes: [], target: progressiveTargets[1] },
  ])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.deepEqual(visibleTargets(), [true, true, true])
  assert.equal(
    progressiveDummy.getAttribute('data-lia-kachelfolge-visible'),
    null,
  )

  progressiveTargets[2].setAddress([2, 0])
  progressiveObserver.callback([
    { addedNodes: [], target: progressiveTargets[2] },
  ])
  assert.equal(frames.length, 1)

  frames.shift()(0)
  assert.deepEqual(visibleTargets(), [true, true, true])
  assert.equal(
    progressiveDummy.getAttribute('data-lia-kachelfolge-visible'),
    'true',
  )
  assert.ok(progressiveQueryCount > 0)

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
