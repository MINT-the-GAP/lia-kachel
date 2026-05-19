declare global {
  interface Window {
    __liaTileCrossDebug: string[];
    __liaTileCrossDebugEnabled: boolean;
    __liaTileCrossLogScope: string;
    __liaResetDebugWrite?: (line: string) => void;
    __liaKachelfolgeLog: (msg: string) => void;
    __liaTileCrossDumpDebug: () => string;
  }
}

export function initDebug(): void {
  if ((window as any).__liaTileCrossPatched) return;
  window.__liaTileCrossDebug = window.__liaTileCrossDebug || [];
  window.__liaTileCrossDebugEnabled = true;
  window.__liaTileCrossLogScope = window.__liaTileCrossLogScope || "kf";

  window.__liaKachelfolgeLog = (msg: string) => dlog("kf: " + String(msg || ""));

  window.__liaTileCrossDumpDebug = () => {
    try { return (window.__liaTileCrossDebug || []).join("\n"); } catch (e) { return ""; }
  };
}

export function dlog(msg: string): void {
  const raw = String(msg || "");
  const scope: string = (window as any).__liaTileCrossLogScope || "kf";
  if (scope === "kf" && !/^kf:/i.test(raw)) return;
  const line = (scope === "kf" ? "[kachelfolge] " : "[tile-cross] ") + raw;
  try {
    window.__liaTileCrossDebug = window.__liaTileCrossDebug || [];
    window.__liaTileCrossDebug.push(new Date().toISOString() + " " + line);
    if (window.__liaTileCrossDebug.length > 400) window.__liaTileCrossDebug.shift();
  } catch (e) {}
  if (window.__liaTileCrossDebugEnabled) {
    try { console.log(line); } catch (e) {}
    try {
      if (typeof window.__liaResetDebugWrite === "function") {
        window.__liaResetDebugWrite(line);
      }
    } catch (e) {}
  }
}
