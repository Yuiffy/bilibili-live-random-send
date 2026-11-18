import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const script = await readFile("dist/bilibili-live-random-send.user.js", "utf8");
assert(script.startsWith("// ==UserScript=="));
assert(script.includes("@license      Apache-2.0"));
assert(script.includes("function createRuntime("));
assert(script.length < 2_000_000);
for (const obsolete of [
  "GM_xmlhttpRequest",
  "patchFloatingModule",
  "update.greasyfork.org/scripts/448354",
  "gcore.jsdelivr.net",
  "eval(",
  "new Function(",
  "script.text =",
]) {
  assert(
    !script.includes(obsolete),
    `Unexpected remote-loader artifact: ${obsolete}`,
  );
}
assert(
  !script.includes('document.getElementById("aside-area-vm").appendChild'),
);
console.log(
  "Release checks passed: readable self-contained code, correct license, no remote module loader.",
);
