// Browser wallet extensions (MetaMask, etc.) inject scripts into every page. When near-connect
// probes for them, some throw errors from their own code, e.g. MetaMask's inpage.js:
// "MetaMask extension not found". Those are not our bugs and must not reach the error overlay or
// the console as unhandled. This runs inline in <head>, before Next and React add their listeners,
// and stops ONLY events whose source or stack is an extension URL (or that exact MetaMask message).
// Everything else passes through untouched.
export const EXTENSION_ERROR_FILTER = `(() => {
  const EXT = /(chrome|moz|safari-web|ms-browser)-extension:\\/\\//;
  const KNOWN = ["MetaMask extension not found"];
  const fromExtension = (err, file) => {
    if (file && EXT.test(file)) return true;
    if (!err) return false;
    const stack = typeof err === "object" ? String(err.stack || "") : "";
    const msg = typeof err === "object" ? String(err.message || "") : String(err);
    return EXT.test(stack) || KNOWN.includes(msg);
  };
  window.addEventListener("error", (e) => {
    if (fromExtension(e.error, e.filename)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    if (fromExtension(e.reason)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
})();`;
