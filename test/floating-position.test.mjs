import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = readFileSync("src/floating-position.js", "utf8").replace(
  "export function",
  "function",
);
const key = "__rsh_floating_position_v2";
function fixture(saved = new Map(), width = 1200, height = 800) {
  const dom = new JSDOM("<div id='tools'></div>", {
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.innerWidth = width;
  w.innerHeight = height;
  const host = w.document.getElementById("tools");
  host.attachShadow({ mode: "open" }).innerHTML =
    "<button class='handle'>drag</button>";
  const handle = host.shadowRoot.querySelector("button");
  handle.setPointerCapture = () => {};
  const size = { width: 84, height: 116 };
  host.getBoundingClientRect = () => {
    const left =
      host.style.left && host.style.left !== "auto"
        ? parseFloat(host.style.left)
        : w.innerWidth - size.width - (parseFloat(host.style.right) || 0);
    const top =
      host.style.top && host.style.top !== "auto"
        ? parseFloat(host.style.top)
        : w.innerHeight - size.height - (parseFloat(host.style.bottom) || 0);
    return {
      left,
      top,
      ...size,
      right: left + size.width,
      bottom: top + size.height,
    };
  };
  let sizeChanged;
  w.ResizeObserver = class {
    constructor(callback) {
      sizeChanged = callback;
    }
    observe() {}
  };
  w.api = {
    read: (key, fallback) =>
      saved.has(key) ? structuredClone(saved.get(key)) : fallback,
    write: (key, value) => saved.set(key, structuredClone(value)),
  };
  w.eval(
    source + ";installFloatingPosition(document.getElementById('tools'), api)",
  );
  function resize(width, height) {
    w.innerWidth = width;
    w.innerHeight = height;
    w.dispatchEvent(new w.Event("resize"));
  }
  function pointer(type, x, y) {
    handle.dispatchEvent(
      new w.MouseEvent(type, { clientX: x, clientY: y, button: 0 }),
    );
  }
  function dragTo(x, y) {
    const box = host.getBoundingClientRect();
    pointer("pointerdown", box.left, box.top);
    pointer("pointermove", x, y);
    pointer("pointerup", x, y);
  }
  return {
    dom,
    w,
    host,
    handle,
    saved,
    size,
    resize,
    pointer,
    dragTo,
    sizeChanged: () => sizeChanged(),
  };
}

test("bottom-right gaps survive resize, repeated shrink/expand, and reload", () => {
  const f = fixture();
  try {
    f.dragTo(1096, 654); // right 20px, bottom 30px
    assert.deepEqual(f.saved.get(key), {
      horizontal: "right",
      vertical: "bottom",
      x: 20,
      y: 30,
    });
    for (const [width, height] of [
      [1600, 1000],
      [700, 500],
      [100, 130],
      [1600, 1000],
    ]) {
      f.resize(width, height);
      const box = f.host.getBoundingClientRect();
      assert(
        box.left >= 0 &&
          box.top >= 0 &&
          box.right <= width &&
          box.bottom <= height,
      );
    }
    assert.equal(f.host.style.right, "20px");
    assert.equal(f.host.style.bottom, "30px");
    const reloaded = fixture(f.saved, 900, 600);
    assert.equal(reloaded.host.style.right, "20px");
    assert.equal(reloaded.host.style.bottom, "30px");
    reloaded.dom.window.close();
  } finally {
    f.dom.window.close();
  }
});

test("all four corners keep their nearest edges", () => {
  const f = fixture();
  try {
    for (const [x, y, horizontal, vertical] of [
      [10, 20, "left", "top"],
      [1106, 20, "right", "top"],
      [10, 664, "left", "bottom"],
      [1106, 664, "right", "bottom"],
    ]) {
      f.resize(1200, 800);
      f.dragTo(x, y);
      f.resize(1800, 1100);
      assert.equal(f.host.style[horizontal], "10px");
      assert.equal(f.host.style[vertical], "20px");
    }
  } finally {
    f.dom.window.close();
  }
});

test("legacy coordinates migrate once and out-of-range positions stay visible", () => {
  const saved = new Map([["__rsh_floating_position_v1", { x: 1096, y: 654 }]]);
  const f = fixture(saved);
  try {
    assert.deepEqual(saved.get(key), {
      horizontal: "right",
      vertical: "bottom",
      x: 20,
      y: 30,
    });
    f.resize(1800, 1100);
    assert.equal(f.host.style.right, "20px");
    assert.equal(f.host.style.bottom, "30px");
  } finally {
    f.dom.window.close();
  }
  const offscreen = fixture(
    new Map([["__rsh_floating_position_v1", { x: 2500, y: 1800 }]]),
  );
  assert.equal(offscreen.host.style.right, "4px");
  assert.equal(offscreen.host.style.bottom, "4px");
  offscreen.dom.window.close();
});

test("reset and malformed storage use the bottom-right default", () => {
  const f = fixture(
    new Map([[key, { horizontal: "oops", vertical: "top", x: NaN, y: 10 }]]),
  );
  try {
    assert.equal(f.host.style.right, "16px");
    assert.equal(f.host.style.bottom, "24px");
    f.dragTo(10, 10);
    f.handle.dispatchEvent(new f.w.MouseEvent("dblclick"));
    f.resize(1600, 1000);
    assert.equal(f.host.style.right, "16px");
    assert.equal(f.host.style.bottom, "24px");
    assert.deepEqual(f.saved.get(key), {
      horizontal: "right",
      vertical: "bottom",
      x: 16,
      y: 24,
    });
  } finally {
    f.dom.window.close();
  }
});

test("toolbar size changes clamp temporarily and resize ends an active drag", () => {
  const f = fixture();
  try {
    f.size.width = 1190;
    f.size.height = 790;
    f.sizeChanged();
    assert.equal(f.host.style.right, "6px");
    assert.equal(f.host.style.bottom, "6px");
    f.size.width = 84;
    f.size.height = 116;
    f.sizeChanged();
    assert.equal(f.host.style.right, "16px");
    assert.equal(f.host.style.bottom, "24px");
    f.pointer("pointerdown", 1100, 660);
    f.resize(1600, 1000);
    f.pointer("pointermove", 10, 10);
    assert.equal(f.host.style.right, "16px");
    assert.equal(f.host.style.bottom, "24px");
  } finally {
    f.dom.window.close();
  }
});
