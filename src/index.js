/**
 * B站直播间定时发随机弹幕（悬浮维护版）
 * Original work: Gamyou, Apache-2.0.
 * Modified by Yuiffy on 2026-11-18. See NOTICE and CHANGELOG.md.
 */
import { createRuntime } from "./runtime.js";

function start() {
  if (window.top !== window.self || !/^\/\d+\/?$/.test(location.pathname))
    return;
  if (document.getElementById("rsh-floating-tools")) return;
  const storage = {
    read: (key, fallback) => GM_getValue(String(key), fallback),
    write: (key, value) => GM_setValue(String(key), value),
    remove: (key) => GM_deleteValue(String(key)),
  };
  const pageWindow =
    typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  createRuntime(storage, pageWindow).start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
