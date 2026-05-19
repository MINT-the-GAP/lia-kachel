// global.d.ts — Single source of truth for all Window augmentations used across the plugin.

declare global {
  interface Window {
    // Boot guard
    __liaTileCrossPatched?: number;
    __liaTileCrossInternalDispatch?: number;

    // Debug
    __liaTileCrossDebug: string[];
    __liaTileCrossDebugEnabled: boolean;
    __liaTileCrossLogScope: string;
    __liaResetDebugWrite?: (line: string) => void;
    __liaKachelfolgeLog: (msg: string) => void;
    __liaTileCrossDumpDebug: () => string;

    // LiaScript runtime hooks
    LIA?: { send: (payload: unknown) => void };
    __liaResetGetTileQuizTargetsFromRoot?: (root: Element) => Element[];
    __liaResetCollectTileQuizRoots?: (scope: Element) => Element[];
    __liaResetGetTileQuizRootFromNode?: (node: Element, scope: Element) => Element | null;
    __liaResetRefreshTileTargetStyles?: (doc: Document) => void;

    // Kachelfolge state
    __liaKachelfolgeExpected: Record<string, string[]>;
    __liaKfAssignedSources: WeakMap<Element, { sourceEl: Element; text: string; sourceId: number | null; ts: number; reason: string }>;

    // Freeze stores
    __liaKfFrozenQuizKeys: Set<string>;
    __liaKfFrozenQuizUids: Set<string>;
    __liaKfFrozenQuizFeedback: Map<string, { text: string; className: string; hidden: number }>;

    // Event handler flags
    __liaKfBlockDblclickClear?: boolean;
    __liaKfNavObserverInstalled?: number;
  }
}

export {};
