import {
  extractCorrectOptionIndexes,
  installKachelRegions,
  normalizeTileContent,
  planContentAssignments,
  renderedTileContent,
  sameTargetContents,
} from './content'
import {
  checkKachelfolge,
  parseKachelfolgeSpec,
  sameSourceAddressMultiset,
  sourceAddressFromHandler,
} from './kachelfolge'
import {
  installProgressiveKachelfolgen,
  progressiveVisibleCount,
  refreshProgressiveKachelfolgen,
} from './progressive'
import { installKachelStyles } from './styles'
import { installTouchDragAndDrop } from './touch'

const TOUCH_INSTALLATION_KEY = Symbol.for(
  'lia-kachel.touch-drag-and-drop',
)
const PROGRESSIVE_INSTALLATION_KEY = Symbol.for(
  'lia-kachel.progressive-kachelfolge',
)
const CONTENT_INSTALLATION_KEY = Symbol.for(
  'lia-kachel.content-regions',
)

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installKachelStyles(document)

  const runtime = window as unknown as Record<PropertyKey, unknown>
  const existingApi =
    runtime.LiaKachel && typeof runtime.LiaKachel === 'object'
      ? (runtime.LiaKachel as Record<string, unknown>)
      : {}
  const existingKachelfolge =
    existingApi.kachelfolge && typeof existingApi.kachelfolge === 'object'
      ? (existingApi.kachelfolge as Record<string, unknown>)
      : {}
  const existingContent =
    existingApi.content && typeof existingApi.content === 'object'
      ? (existingApi.content as Record<string, unknown>)
      : {}

  existingApi.content = {
    ...existingContent,
    correctOptions: extractCorrectOptionIndexes,
    normalize: normalizeTileContent,
    planAssignments: planContentAssignments,
    rendered: renderedTileContent,
    sameTargets: sameTargetContents,
  }
  existingApi.kachelfolge = {
    ...existingKachelfolge,
    check: checkKachelfolge,
    parse: parseKachelfolgeSpec,
    progressiveVisibleCount,
    refreshProgressive: refreshProgressiveKachelfolgen,
    sameAddressMultiset: sameSourceAddressMultiset,
    sourceAddressFromHandler,
  }
  runtime.LiaKachel = existingApi

  if (!runtime[TOUCH_INSTALLATION_KEY]) {
    runtime[TOUCH_INSTALLATION_KEY] = installTouchDragAndDrop(document)
  }

  if (!runtime[PROGRESSIVE_INSTALLATION_KEY]) {
    runtime[PROGRESSIVE_INSTALLATION_KEY] =
      installProgressiveKachelfolgen(document)
  }

  if (!runtime[CONTENT_INSTALLATION_KEY]) {
    runtime[CONTENT_INSTALLATION_KEY] = installKachelRegions(document)
  }
}
