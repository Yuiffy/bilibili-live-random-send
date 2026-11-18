import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
const source = readFileSync("src/timers.js", "utf8").replace(
  "export function",
  "function",
);
function fixture(workerWorks) {
  let now = 0,
    id = 0,
    worker;
  const native = new Map();
  const context = vm.createContext({
    Map,
    Blob,
    Date: { now: () => now },
    URL: { createObjectURL: () => "blob:fixture", revokeObjectURL() {} },
    window: {
      setTimeout(fn, delay) {
        native.set(++id, { fn, delay });
        return id;
      },
      clearTimeout(id) {
        native.delete(id);
      },
    },
    Worker: class {
      constructor() {
        if (!workerWorks) throw Error("CSP");
        worker = this;
        this.commands = [];
      }
      postMessage(data) {
        this.commands.push(data);
      }
      terminate() {
        this.terminated = true;
      }
    },
  });
  vm.runInContext(source + ";globalThis.timers=createTimers()", context);
  return {
    timers: context.timers,
    native,
    get worker() {
      return worker;
    },
    setNow: (value) => (now = value),
  };
}
test("native fallback repeats, cancels and removes one-shot jobs", () => {
  const f = fixture(false);
  let count = 0;
  const once = f.timers.setTimeout(() => count++, 10);
  const repeat = f.timers.setInterval(() => count++, 20);
  const first = [...f.native.values()][0];
  f.native.delete(1);
  first.fn();
  assert.equal(count, 1);
  const second = [...f.native.values()][0];
  f.native.delete(2);
  second.fn();
  assert.equal(count, 2);
  assert.equal(f.native.size, 1);
  f.timers.clearInterval(repeat);
  assert.equal(f.native.size, 0);
  f.timers.clearTimeout(once);
});
test("worker cancellation and failure preserve remaining delay", () => {
  const f = fixture(true);
  let count = 0;
  const a = f.timers.setTimeout(() => count++, 100);
  f.timers.clearTimeout(a);
  f.worker.onmessage({ data: { id: a } });
  assert.equal(count, 0);
  const b = f.timers.setInterval(() => count++, 200);
  f.worker.onmessage({ data: { id: b } });
  assert.equal(count, 1);
  f.setNow(50);
  f.worker.onerror({ preventDefault() {} });
  assert.equal(f.worker.terminated, true);
  assert.equal([...f.native.values()][0].delay, 150);
  f.timers.clearInterval(b);
  assert.equal(f.native.size, 0);
});
