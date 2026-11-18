import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
const source = readFileSync("dist/bilibili-live-random-send.user.js", "utf8");
const pages = [];
function page(html = "", random = true, options = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" + html + "</body></html>",
    {
      url: options.url || "https://live.bilibili.com/25788785",
      runScripts: "outside-only",
    },
  );
  pages.push(dom);
  const w = dom.window;
  const saved = new Map([
    [
      "25788785",
      options.saved || {
        version: 6,
        like: {
          likeRandom: random,
          likeInterval: !random,
          clickLikeInterval: 6,
        },
      },
    ],
  ]);
  const clock = {
    now: 100000,
    id: 0,
    jobs: new Map(),
    tick(ms) {
      const until = this.now + ms;
      for (let n = 0; n < 5000; n++) {
        const next = [...this.jobs]
          .filter(([, j]) => j.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) {
          this.now = until;
          return;
        }
        const [id, job] = next;
        this.now = job.at;
        this.jobs.delete(id);
        if (job.interval)
          this.jobs.set(id, { ...job, at: job.at + job.interval });
        job.fn();
      }
      throw Error("Timer loop");
    },
  };
  w.alert = (message) => {
    throw Error(message);
  };
  w.Date.now = () => clock.now;
  w.Math.random = () => 0.5;
  w.setTimeout = (fn, ms) => {
    const id = ++clock.id;
    clock.jobs.set(id, { fn, at: clock.now + ms });
    return id;
  };
  w.clearTimeout = (id) => clock.jobs.delete(id);
  w.setInterval = (fn, ms) => {
    const id = ++clock.id;
    clock.jobs.set(id, { fn, at: clock.now + ms, interval: ms });
    return id;
  };
  w.clearInterval = (id) => clock.jobs.delete(id);
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    let hidden = false;
    for (let p = this; p; p = p.parentElement)
      if (p.hidden || p.style.display === "none") hidden = true;
    return { width: hidden ? 0 : 30, height: hidden ? 0 : 30, left: 0, top: 0 };
  };
  w.GM_getValue = (key, fallback) =>
    saved.has(key) ? structuredClone(saved.get(key)) : fallback;
  w.GM_setValue = (key, value) => saved.set(key, structuredClone(value));
  w.GM_deleteValue = (key) => saved.delete(key);
  w.eval(source);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const controls = {
    master: w.document.getElementById("autoLikeCheckbox"),
    random: w.document.getElementById("clickLikeRandomCheckbox"),
    fixed: w.document.getElementById("clickLikeIntervalCheckbox"),
  };
  return {
    dom,
    w,
    clock,
    controls,
    saved,
    status: () => w.document.getElementById("rsh-like-status").textContent,
  };
}
test("like scheduler: boundaries, switching, restore, hidden/feed exclusion, late mount", () => {
  // Reproduces a class rename, with a hidden old button and a live-chat marker.
  const p = page(
    '<div class="like-btn" hidden></div><div class="renamed-like" data-event-name="dianzan.0.show"></div><div class="room-feed"><button aria-label="点赞">点赞</button></div>',
  );
  let clicks = 0,
    hidden = 0,
    feed = 0;
  p.w.document
    .querySelector(".renamed-like")
    .addEventListener("click", () => clicks++);
  p.w.document
    .querySelector(".like-btn")
    .addEventListener("click", () => hidden++);
  p.w.document
    .querySelector(".room-feed button")
    .addEventListener("click", () => feed++);
  assert.equal(clicks, 0);
  p.clock.tick(8999);
  assert.equal(clicks, 0);
  p.clock.tick(1);
  assert.equal(clicks, 1);
  assert.match(p.status(), /已触发点击 1 次/);
  p.clock.tick(18000);
  assert.equal(clicks, 3);
  // Switching to fixed cancels the pending random callback and uses six seconds.
  p.controls.fixed.click();
  assert.equal(p.controls.random.checked, false);
  p.clock.tick(6000);
  assert.equal(clicks, 4);
  p.controls.master.click();
  p.clock.tick(30000);
  assert.equal(clicks, 4);
  assert.equal(hidden, 0);
  assert.equal(feed, 0);
  // Missing target reports an actionable state, then recovers after late mounting.
  const missing = page(
    '<div class="room-feed"><button aria-label="点赞">点赞</button></div>',
  );
  missing.clock.tick(9000);
  assert.match(missing.status(), /未找到可用/);
  const replacement = missing.w.document.createElement("div");
  replacement.dataset.type = "dianzan.0.show";
  let recovered = 0;
  replacement.addEventListener("click", () => recovered++);
  missing.w.document.body.append(replacement);
  missing.clock.tick(9000);
  assert.equal(recovered, 1);
  // Closing settings restores saved options and re-arms exactly one timer.
  missing.controls.master.click();
  assert.equal(missing.controls.random.checked, false);
  missing.w.document
    .getElementById("rsh-floating-tools")
    .shadowRoot.querySelectorAll("button")[2]
    .click();
  missing.w.document.querySelector('[title="关闭"]').click();
  assert.equal(missing.controls.random.checked, true);
  missing.clock.tick(9000);
  assert.equal(recovered, 2);
  // Fixed mode restored from storage uses its saved interval.
  const fixed = page('<button aria-label="点赞">点赞</button>', false);
  let fixedCount = 0;
  fixed.w.document
    .querySelector('button[aria-label="点赞"]')
    .addEventListener("click", () => fixedCount++);
  fixed.clock.tick(5999);
  assert.equal(fixedCount, 0);
  fixed.clock.tick(1);
  assert.equal(fixedCount, 1);
  // Every random sample is bounded at 3 and 15 seconds.
  const boundary = page('<button aria-label="点赞">点赞</button>');
  boundary.w.Math.random = () => 0;
  boundary.controls.random.click();
  boundary.controls.random.click();
  assert(
    [...boundary.clock.jobs.values()].some(
      (j) => !j.interval && j.at - boundary.clock.now === 3000,
    ),
  );
  boundary.w.Math.random = () => 0.999999;
  boundary.controls.random.click();
  boundary.controls.random.click();
  assert(
    [...boundary.clock.jobs.values()].some(
      (j) => !j.interval && j.at - boundary.clock.now === 15000,
    ),
  );
  for (const test of [p, missing, fixed, boundary]) test.dom.window.close();
});

test("root mount, idempotency, saved message migration and save/cancel", () => {
  const p = page("", true, {
    saved: {
      version: 5,
      data1: { available: true, values: ["hello", "world"] },
      sendMsgInterval: 42,
      likeRandom: true,
    },
  });
  const d = p.w.document;
  assert.equal(d.getElementById("danmu-setting-panel").parentElement, d.body);
  assert.equal(d.querySelector(".danmu-group-textarea").value, "hello|world");
  assert.equal(d.querySelector(".danmu-second-input").value, "42");
  p.w.eval(source);
  p.w.document.dispatchEvent(new p.w.Event("DOMContentLoaded"));
  assert.equal(d.querySelectorAll("#rsh-floating-tools").length, 1);
  d.querySelector(".danmu-group-textarea").value = "changed";
  d.querySelector('[title="关闭"]').click();
  assert.equal(d.querySelector(".danmu-group-textarea").value, "hello|world");
  d.querySelector(".danmu-group-textarea").value = "saved|message";
  d.querySelector('[title="保存"]').click();
  assert.deepEqual(p.saved.get("25788785").data1.values, ["saved", "message"]);
  assert.equal(p.saved.get("25788785").like.likeRandom, true);
  p.dom.window.close();
});
test("sending respects user drafts and survives missing controls", () => {
  const p = page(
    '<div id="chat-control-panel-vm"><textarea>draft</textarea><div class="right-action"><button>发送</button></div></div>',
  );
  let sent = 0;
  const d = p.w.document;
  d.querySelector(".right-action button").onclick = () => sent++;
  const start = d
    .getElementById("rsh-floating-tools")
    .shadowRoot.querySelectorAll("button")[1];
  start.click();
  assert.equal(sent, 0);
  assert.equal(
    d.querySelector("#chat-control-panel-vm textarea").value,
    "draft",
  );
  d.querySelector("#chat-control-panel-vm textarea").value = "";
  p.clock.tick(600000);
  assert.equal(sent, 1);
  d.getElementById("chat-control-panel-vm").remove();
  assert.doesNotThrow(() => p.clock.tick(600000));
  start.click();
  p.dom.window.close();
});
test("ignores non-room pages", () => {
  const p = page("", true, { url: "https://live.bilibili.com/" });
  assert.equal(p.w.document.getElementById("rsh-floating-tools"), null);
  p.dom.window.close();
});
