// ==UserScript==
// @name         B站直播间定时发随机弹幕（悬浮维护版）
// @namespace    https://live.bilibili.com/暂无主页
// @version      3.0.0
// @description  右侧可拖动悬浮入口；随机/顺序定时弹幕、零点打卡、弹幕分组、随机/定时点赞及运行诊断；各直播间设置独立保存，附带原版直播间简化功能。
// @author       Gamyou (original), Yuiffy (maintenance)
// @license      Apache-2.0
// @match        *://live.bilibili.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @homepageURL  https://github.com/Yuiffy/bilibili-live-random-send
// @supportURL   https://github.com/Yuiffy/bilibili-live-random-send/issues
// ==/UserScript==

/*
 * Original author: Gamyou. Upstream module 1.7.5.3, Apache-2.0.
 * Modified by Yuiffy on 2026-11-18. All functional code is included below.
 * Source and modification notices: https://github.com/Yuiffy/bilibili-live-random-send
 * Distributed under the Apache License, Version 2.0.
 * License text: https://www.apache.org/licenses/LICENSE-2.0
 */

(() => {
  // src/timers.js
  function workerClock() {
    const handles = /* @__PURE__ */ new Map();
    self.onmessage = ({ data }) => {
      const { command, id, delay, repeating } = data;
      if (command === "clear") {
        clearTimeout(handles.get(id));
        clearInterval(handles.get(id));
        handles.delete(id);
        return;
      }
      const tick = () => {
        self.postMessage({ id });
        if (!repeating) handles.delete(id);
      };
      handles.set(
        id,
        repeating ? setInterval(tick, delay) : setTimeout(tick, delay)
      );
    };
  }
  function createTimers() {
    const jobs = /* @__PURE__ */ new Map();
    let nextId = 0;
    let worker = null;
    function run(id) {
      const job = jobs.get(id);
      if (!job) return;
      if (!job.repeating) jobs.delete(id);
      else job.dueAt = Date.now() + job.delay;
      job.callback.call(job.context);
    }
    function scheduleNative(id, delay) {
      const job = jobs.get(id);
      job.nativeHandle = window.setTimeout(() => {
        if (!jobs.has(id)) return;
        try {
          run(id);
        } finally {
          if (jobs.has(id)) scheduleNative(id, job.delay);
        }
      }, delay);
    }
    function fallback() {
      worker?.terminate();
      worker = null;
      for (const [id, job] of jobs)
        scheduleNative(id, Math.max(0, job.dueAt - Date.now()));
    }
    try {
      const url = URL.createObjectURL(
        new Blob(["(", workerClock.toString(), ")()"], {
          type: "application/javascript"
        })
      );
      try {
        worker = new Worker(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      worker.onmessage = ({ data }) => {
        if (worker) run(data.id);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fallback();
      };
    } catch {
      fallback();
    }
    function schedule(callback, delay, context, repeating) {
      const id = ++nextId;
      delay = Math.max(0, Math.min(2147483647, Number(delay) || 0));
      jobs.set(id, {
        callback,
        context,
        delay,
        repeating,
        dueAt: Date.now() + delay,
        nativeHandle: null
      });
      if (worker) worker.postMessage({ command: "start", id, delay, repeating });
      else scheduleNative(id, delay);
      return id;
    }
    function clear(id) {
      const job = jobs.get(id);
      if (!job) return;
      if (worker) worker.postMessage({ command: "clear", id });
      if (job.nativeHandle !== null) window.clearTimeout(job.nativeHandle);
      jobs.delete(id);
    }
    return {
      setTimeout: (callback, delay, context) => schedule(callback, delay, context, false),
      setInterval: (callback, delay, context) => schedule(callback, delay, context, true),
      clearTimeout: clear,
      clearInterval: clear
    };
  }

  // src/floating-ui.js
  function installFloatingUi(api) {
    if (document.getElementById("rsh-floating-tools")) return;
    api.createPanel();
    api.createStart(null);
    const panel = document.getElementById("danmu-setting-panel");
    const start2 = api.getStart();
    const host = document.createElement("div");
    host.id = "rsh-floating-tools";
    host.style.cssText = "position:fixed!important;right:16px;top:42vh;z-index:2147483646!important;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{font-family:system-ui,"Microsoft YaHei",sans-serif;font-size:13px;color:#e6f6ff;}
      .tools{display:flex;flex-direction:column;gap:5px;padding:6px;background:#202833;
        border:1px solid #537087;border-radius:14px;box-shadow:0 4px 18px #0005;}
      button{box-sizing:border-box;border:0;border-radius:9px;background:#31465c;color:#e6f6ff;
        font:inherit;min-width:68px;height:34px;padding:0 9px;cursor:pointer;white-space:nowrap;}
      button:hover{background:#406584;}button:focus-visible{outline:2px solid #80d8ff;outline-offset:2px;}
      .handle{height:24px;background:transparent;color:#a8c7dc;font-size:12px;cursor:grab;touch-action:none;user-select:none;}
    </style><div class="tools"><button type="button" class="handle" title="拖动移动；双击恢复默认位置" aria-label="拖动弹幕工具">⠿ 弹幕</button></div>`;
    const tools = shadow.querySelector(".tools");
    start2.type = "button";
    start2.style.cssText = "";
    tools.appendChild(start2);
    const settings = document.createElement("button");
    settings.type = "button";
    settings.textContent = "⚙ 设置";
    settings.title = "打开定时弹幕设置";
    settings.addEventListener("click", api.open);
    tools.appendChild(settings);
    document.body.appendChild(host);
    const style = document.createElement("style");
    style.id = "rsh-floating-panel-style";
    style.textContent = `
      #danmu-setting-panel{box-sizing:border-box!important;position:fixed!important;
        left:auto!important;right:100px!important;top:50%!important;bottom:auto!important;
        transform:translateY(-50%)!important;width:min(460px,calc(100vw - 24px))!important;
        height:min(760px,80vh)!important;max-height:calc(100vh - 24px)!important;
        z-index:2147483647!important;box-shadow:0 8px 40px #0006;padding:12px;color:#12388d;}
      #danmu-setting-panel .danmu-group-textarea{box-sizing:border-box;min-height:64px;color:#152b44;background:#fff;}
      #danmu-setting-panel .danmu-random-setting-bottom{position:sticky;bottom:-12px;background:#e7f1fb;padding:8px 0;}
      #danmu-setting-panel .danmu-random-set-button-container{display:inline-flex;gap:8px;align-items:center;}
      #danmu-setting-panel [title="保存"],#danmu-setting-panel [title="关闭"]{
        font-family:system-ui,sans-serif!important;font-style:normal;line-height:24px;
        padding:4px 12px!important;margin-left:0;cursor:pointer;}
      #danmu-setting-panel [title="保存"]::before,#danmu-setting-panel [title="关闭"]::before{content:none!important;}
      @media(max-width:640px){#danmu-setting-panel{right:12px!important;}}
    `;
    document.head.appendChild(style);
    for (const [title, text] of [
      ["保存", "✓ 保存"],
      ["关闭", "✕ 关闭"]
    ]) {
      const control = panel.querySelector(`[title="${title}"]`);
      if (control) {
        control.textContent = text;
        control.setAttribute("role", "button");
        control.tabIndex = 0;
        control.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            control.click();
          }
        });
      }
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel.style.display === "block") api.close();
    });
    const key = "__rsh_floating_position_v1";
    let position = api.read(key, null);
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
      position = null;
    function place(x, y) {
      const box = host.getBoundingClientRect();
      position = {
        x: Math.max(4, Math.min(x, innerWidth - box.width - 4)),
        y: Math.max(4, Math.min(y, innerHeight - box.height - 4))
      };
      host.style.right = "auto";
      host.style.left = position.x + "px";
      host.style.top = position.y + "px";
    }
    if (position) place(position.x, position.y);
    const handle = shadow.querySelector(".handle");
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const box = host.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag)
        place(
          drag.left + event.clientX - drag.x,
          drag.top + event.clientY - drag.y
        );
    });
    function finish() {
      if (drag) {
        drag = null;
        if (position) api.write(key, position);
      }
    }
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("dblclick", () => {
      position = null;
      host.style.left = "auto";
      host.style.right = "16px";
      host.style.top = "42vh";
      api.write(key, { reset: true });
    });
    window.addEventListener("resize", () => {
      if (position) place(position.x, position.y);
    });
    api.createLikes();
    api.initialize();
  }

  // src/like-controller.js
  function createLikeController(api) {
    const panel = document.getElementById("danmu-setting-panel");
    const row = document.createElement("div");
    row.id = "rsh-like-diagnostics";
    row.style.cssText = "margin:8px 10px;padding:8px;background:#fff;border-radius:6px;font-size:12px;color:#095ca2;";
    const status = document.createElement("div");
    status.id = "rsh-like-status";
    status.setAttribute("role", "status");
    const test = document.createElement("button");
    test.type = "button";
    test.textContent = "测试点赞一次";
    test.style.cssText = "margin-top:6px;padding:4px 8px;border:1px solid #9bc5e5;border-radius:4px;background:#eef7ff;color:#095ca2;cursor:pointer;";
    test.addEventListener("click", () => clickOnce());
    row.append(status, test);
    panel.querySelector("#autoLikeCheckboxDiv").after(row);
    const randomLabel = panel.querySelector(
      "#clickLikeRandomCheckboxDiv .danmu-random-switch-button-title"
    );
    randomLabel.textContent = "随机间隔点赞（3～15 秒）";
    randomLabel.title = "每次等待随机的 3～15 秒后点击一次；找不到按钮时等待下一轮。";
    let timer = null, ticker = null, generation = 0, nextAt = 0, count = 0, lastAt = null;
    let mode = "", lastResult = "";
    function render() {
      const prefix = mode === "random" ? "随机点赞" : mode === "fixed" ? "定时点赞" : "自动点赞已关闭";
      const countdown = mode && nextAt ? " · 下次约 " + Math.max(0, Math.ceil((nextAt - Date.now()) / 1e3)) + " 秒" : "";
      status.textContent = prefix + countdown + " · 本页已触发点击 " + count + " 次" + (lastResult ? " · " + lastResult : "");
    }
    function usable(element) {
      if (!element || !element.isConnected || element.closest(
        "#danmu-setting-panel,#rsh-floating-tools,.bili-dyn-action,.room-feed"
      ))
        return false;
      if (element.closest('[hidden],[inert],[aria-disabled="true"]') || element.matches(":disabled"))
        return false;
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && css.display !== "none" && css.visibility !== "hidden" && css.pointerEvents !== "none";
    }
    function findButton() {
      const selectors = [
        '[data-event-name="dianzan.0.show"]',
        '[data-type="dianzan.0.show"]',
        ".like-btn",
        'button[aria-label="点赞"]',
        '[role="button"][aria-label="点赞"]',
        '[title="点赞"]'
      ];
      for (const selector of selectors) {
        const found = [...document.querySelectorAll(selector)].find(usable);
        if (found) return found;
      }
      for (const scope of document.querySelectorAll(
        '#chat-control-panel-vm,#aside-area-vm,[class*="chat-control"],[class*="chat-input"]'
      )) {
        for (const label of scope.querySelectorAll(
          'button,[role="button"],span,div'
        )) {
          if (label.children.length || label.textContent.trim() !== "点赞")
            continue;
          const target = label.closest('button,[role="button"],[data-event-name]') || label.parentElement;
          if (target && target !== scope && target.textContent.trim().length < 40 && usable(target))
            return target;
        }
      }
      return null;
    }
    function clickOnce() {
      if (lastAt !== null && Date.now() - lastAt < 1e3) return false;
      const button = findButton();
      if (!button) {
        lastResult = "未找到可用的直播点赞按钮，等待下一轮";
        render();
        return false;
      }
      try {
        button.click();
        lastAt = Date.now();
        count++;
        lastResult = "上次点击 " + new Date(lastAt).toLocaleTimeString();
        render();
        return true;
      } catch (error) {
        lastResult = "点击未完成：" + error.message;
        render();
        return false;
      }
    }
    function stop() {
      generation++;
      if (timer !== null) window.clearTimeout(timer);
      if (ticker !== null) window.clearInterval(ticker);
      timer = ticker = null;
      nextAt = 0;
      mode = "";
    }
    function schedule() {
      const controls = api.getControls();
      const seconds = mode === "random" ? 3 + Math.floor(Math.random() * 13) : Math.max(3, Number(controls.interval.value) || 6);
      const delay = Math.min(2147483647, seconds * 1e3);
      nextAt = Date.now() + delay;
      const token = generation;
      timer = window.setTimeout(() => {
        timer = null;
        if (token !== generation || !mode) return;
        const current = api.getControls();
        if (!current.master.checked || !(mode === "random" ? current.random.checked : current.fixed.checked)) {
          sync();
          return;
        }
        clickOnce();
        if (token === generation && mode) schedule();
      }, delay);
      render();
    }
    function sync(source) {
      stop();
      const controls = api.getControls();
      if (!controls.master.checked) {
        controls.random.checked = controls.fixed.checked = false;
      } else if (source === "random" && controls.random.checked) {
        controls.fixed.checked = false;
      } else if (source === "fixed" && controls.fixed.checked) {
        controls.random.checked = false;
      } else if (controls.random.checked && controls.fixed.checked) {
        controls.fixed.checked = false;
      }
      for (const id of [
        "clickLikeIntervalCheckboxDiv",
        "clickLikeRandomCheckboxDiv"
      ]) {
        const group = panel.querySelector("#" + id);
        group.style.display = controls.master.checked ? "" : "none";
        group.classList.remove("disabled");
      }
      controls.random.disabled = controls.fixed.disabled = false;
      controls.interval.disabled = controls.master.checked && controls.fixed.checked;
      mode = controls.master.checked ? controls.random.checked ? "random" : controls.fixed.checked ? "fixed" : "" : "";
      lastResult = controls.master.checked && !mode ? "请选择随机或定时点赞" : "";
      if (mode) {
        schedule();
        ticker = window.setInterval(render, 1e3);
      } else render();
    }
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) sync();
    });
    render();
    return { sync, click: clickOnce };
  }

  // src/panel.css
  var panel_default = '.danmu-group-title {\n  font-size: 14px;\n  padding-left: 2px;\n  color: rgb(18, 56, 141);\n  display: inline;\n  margin-right: 60%;\n  vertical-align: middle;\n}\n.danmu-group-textarea {\n  width: 98%;\n  min-height: 100px;\n  height: 16%;\n  margin: 1px 0px 4px;\n  border: 0px;\n  resize: none;\n}\n.el-button {\n  display: inline-block;\n  line-height: 1;\n  white-space: nowrap;\n  cursor: pointer;\n  background: #fff;\n  border: 1px solid #dcdfe6;\n  color: #606266;\n  -webkit-appearance: none;\n  text-align: center;\n  -webkit-box-sizing: border-box;\n  box-sizing: border-box;\n  outline: 0;\n  margin: 0;\n  -webkit-transition: 0.1s;\n  transition: 0.1s;\n  font-weight: 500;\n  padding: 12px 20px;\n  font-size: 14px;\n  border-radius: 4px;\n}\n.el-button.is-circle {\n  border-radius: 50%;\n  padding: 12px;\n}\n.el-button--mini.is-circle {\n  padding: 3px;\n}\n.el-button:focus,\n.el-button:hover {\n  color: #409eff;\n  border-color: #c6e2ff;\n  background-color: #ecf5ff;\n}\n.el-icon-close.is-circle {\n  padding: 5px;\n  color: #ff0000;\n  border: 1px solid #ff0000;\n  margin-left: 20px;\n}\n.el-icon-check.is-circle {\n  padding: 5px;\n  color: #0000ff;\n  border: 1px solid #0000ff;\n  margin-left: 20px;\n}\n#danmu-setting-panel input[type="checkbox"] {\n  display: none;\n}\n.switch-check {\n  display: inline-block;\n  margin: 0 5px;\n  vertical-align: middle;\n}\n.switch-check-label {\n  display: inline-block;\n  vertical-align: middle;\n  border: 1px solid #bdc3c7;\n  border-radius: 60px;\n  width: 40px;\n  height: 18px;\n  position: relative;\n  transition: all 0.3s;\n  cursor: pointer;\n}\n.switch-check-label:before {\n  width: 14px;\n  height: 14px;\n  content: "";\n  display: inline-block;\n  background-color: #bdc3c7;\n  border-radius: 100%;\n  position: absolute;\n  top: 2px;\n  left: 4px;\n  transition: all 0.3s;\n}\n.switch-check :checked ~ label {\n  background-color: #26b22b;\n  border-color: #26b22b;\n}\n.switch-check :checked ~ label:before {\n  left: 22px;\n  background-color: #fff;\n}\n.switch-check-group {\n  margin-top: 5px;\n  width: 95%;\n}\n.danmu-random-setting-panel {\n  background-color: #e7f1fb;\n  border-radius: 10px;\n  width: 100%;\n  height: 100%;\n  overflow-y: auto;\n  position: absolute;\n  left: 0px;\n  top: 0px;\n  z-index: 999;\n  display: none;\n}\n.danmu-random-setting-panel::-webkit-scrollbar {\n  width: 4px;\n  height: 4px;\n}\n.danmu-random-setting-panel::-webkit-scrollbar-thumb {\n  border-radius: 5px;\n  -webkit-box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);\n  background: rgba(0, 0, 0, 0.2);\n}\n.danmu-random-setting-panel::-webkit-scrollbar-track {\n  -webkit-box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);\n  border-radius: 0;\n  background: rgba(0, 0, 0, 0.1);\n}\n.danmu-random-setting-title {\n  text-align: center;\n  font-size: 16px;\n  font-weight: 700;\n  color: #1c5adc;\n  line-height: 30px;\n}\n.danmu-random-setting-title-sub {\n  display: inline-block;\n  color: #ee8b8b;\n  height: 24px;\n  vertical-align: sub;\n  -webkit-transform: scale(0.7);\n}\n.danmu-random-setting-tips {\n  color: #0b81cc;\n  text-align: center;\n  font-style: italic;\n}\n.module-update-info {\n  color: #0b81cc;\n  text-indent: 2em;\n  font-size: 13px;\n  font-weight: 700;\n  margin: 8px 0;\n  padding: 2px 0;\n  background-color: #ffffff;\n}\n.update-info-text {\n  color: #f00;\n  vertical-align: -webkit-baseline-middle;\n}\n.danmu-random-setting-bottom {\n  width: 100%;\n  line-height: 35px;\n}\n.danmu-random-switch-button-title {\n  font-size: 14px;\n  vertical-align: middle;\n  margin-left: 5px;\n  color: #095ca2;\n  cursor: help;\n}\n.danmu-random-setting-success-tips {\n  text-align: center;\n  display: inline-block;\n  vertical-align: middle;\n  width: 40%;\n}\n.danmu-random-setting-success-text {\n  font-size: 16px;\n  color: #128712;\n  display: none;\n}\n.danmu-random-set-button-container {\n  display: inline-block;\n  vertical-align: middle;\n}\n.global-setting-tip {\n  padding-left: 10px;\n  color: red;\n  font-size: 14px;\n  font-weight: 700;\n  cursor: help;\n}\n.disabled {\n  color: #ababab;\n  cursor: not-allowed;\n}\n.clean-cache-btn {\n  min-width: 70px;\n  font-size: 14px;\n  border-radius: 4px;\n  color: #fff;\n  background: #d99d1b;\n  border: 0px;\n  cursor: pointer;\n  vertical-align: middle;\n  line-height: 30px;\n}\n.clean-cache-btn:hover {\n  background: rgba(217, 157, 27, 0.8);\n  color: #000;\n}\n.danmu-btn {\n  min-width: 65px;\n  height: 24px;\n  font-size: 12px;\n  border-radius: 4px;\n  color: rgb(255, 255, 255);\n  background: rgb(217, 157, 27);\n  border: 0px;\n  cursor: pointer;\n  line-height: 1;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n}\n.danmu-btn:hover {\n  background: var(--color) !important;\n}\n.danmu-text-span {\n  color: #095ca2;\n  font-size: 20px;\n  vertical-align: middle;\n  font-weight: 700;\n}\n.danmu-second-input {\n  width: 70px;\n  height: 20px;\n  margin: 0px 3px;\n  border: 0px;\n  border-radius: 3px;\n  font-size: 18px;\n}\n.not-display {\n  display: none !important;\n}\n';

  // src/styles.js
  function installPanelStyles() {
    if (document.getElementById("rsh-panel-base-style")) return;
    const style = document.createElement("style");
    style.id = "rsh-panel-base-style";
    style.textContent = panel_default;
    document.head.appendChild(style);
  }

  // src/runtime.js
  function createRuntime(storage, pageWindow) {
    const timers = createTimers();
    let signInCheckbox, hideLoginGuideCheckbox, hideHarunaCheckbox, hideShopCheckbox, noSleepCheckbox, hideGiftCheckbox, hideRoomFeedCheckbox, hideRoomInfoCheckbox, hideNoticeCheckbox, hideFooterCheckbox, lotteryCheckbox, closeLotteryCheckbox, hesitationRandomCheckbox, hesitationIntervalCheckbox, hidePrivacyCheckbox, hideWatermarkCheckbox, setPublicCheckbox, hideBusinessCheckbox, hideRankListCheckbox, showLiveAreaCheckbox, showRoomTitleCheckbox, groupOneCheckbox, groupTwoCheckbox, groupThreeCheckbox, groupFourCheckbox, groupFiveCheckbox, randomMessageCheckbox, usePublicCheckbox, autoLikeCheckbox, randomLikeCheckbox, fixedLikeCheckbox, messageIntervalInput, settingsPanel, groupOneInput, groupTwoInput, groupThreeInput, groupFourInput, groupFiveInput, signInTextInput, likeIntervalInput, randomHesitationInput, fixedHesitationInput, startButton, intervalPrefixLabel, intervalSuffixLabel, statusText, moduleInfoElement, startButtonLabel, keepAwakeTimer, keepAwakeMoveTimer, roomSettings = {
      version: 6,
      usePublic: false,
      signIn: {
        auto: false,
        text: "打卡"
      },
      send: {
        random: true,
        interval: 600
      },
      data1: {
        available: true,
        values: ["[惊喜]", "[流汗]"]
      },
      data2: {
        available: true,
        values: []
      },
      data3: {
        available: true,
        values: []
      },
      data4: {
        available: true,
        values: ["[爱]"]
      },
      data5: {
        available: true,
        values: []
      },
      like: {
        likeRandom: false,
        likeInterval: false,
        clickLikeInterval: 6
      },
      lottery: {
        lottery: false,
        hesitationInterval: false,
        hesitationIntervalExpiry: 100,
        hesitationRandom: false,
        hesitationRandomExpiry: 100
      }
    }, baseInfo = {
      id: "RandomSendHelper",
      text: "打卡",
      default: "danmu",
      config: "config",
      msg: "设置按直播间独立保存；修改后点击底部「保存」。"
    }, globalSettings = {}, messagePool = [], messageTimer = null, midnightTimer = null, messageIndex = 0, getStoredValue = storage.read, setStoredValue = storage.write, deleteStoredValue = storage.remove, getRoomId = () => {
      let localValue = pageWindow.BilibiliLive ? pageWindow.BilibiliLive.ROOMID : null;
      return localValue || ((localValue = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.room_id : null) ? localValue : (localValue = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.room_id : null) ? localValue : (localValue = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.roomID : null) ? localValue : (localValue = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.room_id : null) ? localValue : (localValue = window.location.pathname.split("/").filter(Boolean)[0]) ? localValue : (console.error("===> 获取不到直播间id"), -99));
    };
    const getParentAreaName = () => {
      let localValue = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.parent_area_name : null;
      return localValue || ((localValue = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.parentAreaName : null) ? localValue : (localValue = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.parent_area_name : null) ? localValue : (console.warn("===> 获取不到直播父区域名称"), null));
    };
    const getShortRoomId = () => {
      let localValue = pageWindow.BilibiliLive ? pageWindow.BilibiliLive.SHORT_ROOMID : null;
      return localValue || ((localValue = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.short_id : null) ? localValue : (localValue = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.short_id : null) ? localValue : (localValue = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.shortRoomID : null) ? localValue : (console.warn("===> 获取不到房间短id"), -99));
    }, isBlank = (value) => {
      if (!value || "" == value) return true;
      return new RegExp("^[ ]+$").test(value);
    }, sendMessage = (message) => {
      const scope = document.getElementById("chat-control-panel-vm") || document.querySelector(
        '[class*="chat-control-panel"],[class*="chat-input"]'
      );
      const input = scope?.querySelector("textarea");
      const button = scope?.querySelector(
        ".right-action button,.right-actions button,button.bl-button--primary"
      ) || document.querySelector(".right-action button,.right-actions button");
      if (!input || !button || button.disabled) {
        console.warn("===> 找不到可用的弹幕输入框或发送按钮，跳过本次发送");
        return false;
      }
      if (!isBlank(input.value)) {
        console.log("===> 有内容正在编辑，跳过该次发送任务");
        return false;
      }
      input.value = message;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button.click();
      return true;
    }, updateMidnightSignIn = () => {
      if (signInCheckbox.checked) {
        if (signInTextInput.setAttribute("disabled", "disabled"), signInTextInput.classList.add("disabled"), !midnightTimer) {
          let localValue = new Date(
            new Date(
              (/* @__PURE__ */ new Date()).setDate((/* @__PURE__ */ new Date()).getDate() + 1)
            ).toDateString()
          ).getTime() - (() => (/* @__PURE__ */ new Date()).getTime())();
          console.log("===> 设置凌晨打卡定时器【" + localValue + "】");
          midnightTimer = timers.setTimeout(() => {
            let localValue2 = isBlank(roomSettings.signIn.text) ? "打卡" : roomSettings.signIn.text;
            sendMessage(
              isBlank(signInTextInput.value) ? localValue2 : signInTextInput.value
            );
            console.log("===> 设置下一次打卡");
            timers.clearTimeout(midnightTimer);
            midnightTimer = null;
            updateMidnightSignIn();
          }, localValue);
        }
      } else {
        signInTextInput.removeAttribute("disabled");
        signInTextInput.classList.remove("disabled");
        midnightTimer && (console.log("===> 关闭自动打卡功能"), timers.clearTimeout(midnightTimer), midnightTimer = null);
      }
    }, fillMessageGroups = (value) => {
      groupOneInput.value = value.data1.values.length ? value.data1.values.join("|") : [];
      groupTwoInput.value = value.data2.values.length ? value.data2.values.join("|") : [];
      groupThreeInput.value = value.data3.values.length ? value.data3.values.join("|") : [];
      groupFourInput.value = value.data4.values.length ? value.data4.values.join("|") : [];
      groupFiveInput.value = value.data5.values.length ? value.data5.values.join("|") : [];
    }, restoreSettingsForm = () => {
      autoLikeCheckbox.checked = true;
      setPublicCheckbox.checked = false;
      randomMessageCheckbox.checked = roomSettings.send.random;
      signInCheckbox.checked = roomSettings.signIn.auto;
      usePublicCheckbox.checked = roomSettings.usePublic;
      groupOneCheckbox.checked = roomSettings.data1.available;
      groupTwoCheckbox.checked = roomSettings.data2.available;
      groupThreeCheckbox.checked = roomSettings.data3.available;
      groupFourCheckbox.checked = roomSettings.data4.available;
      groupFiveCheckbox.checked = roomSettings.data5.available;
      randomLikeCheckbox.checked = roomSettings.like.likeRandom;
      fixedLikeCheckbox.checked = roomSettings.like.likeInterval;
      likeIntervalInput.value = roomSettings.like.clickLikeInterval;
      !roomSettings.like.likeRandom && !roomSettings.like.likeInterval && (autoLikeCheckbox.checked = false);
      messageIntervalInput.value = roomSettings.send.interval || 600;
      signInTextInput.value = isBlank(roomSettings.signIn.text) ? "" : roomSettings.signIn.text;
      lotteryCheckbox.checked = roomSettings.lottery.lottery;
      hesitationIntervalCheckbox.checked = roomSettings.lottery.hesitationInterval;
      fixedHesitationInput.value = isBlank(
        roomSettings.lottery.hesitationIntervalExpiry
      ) ? 100 : roomSettings.lottery.hesitationIntervalExpiry;
      hesitationRandomCheckbox.checked = roomSettings.lottery.hesitationRandom;
      randomHesitationInput.value = isBlank(
        roomSettings.lottery.hesitationRandomExpiry
      ) ? 100 : roomSettings.lottery.hesitationRandomExpiry;
      storeLotterySettings(roomSettings.lottery);
      noSleepCheckbox.checked = globalSettings.noSleep;
      hideLoginGuideCheckbox.checked = globalSettings.hideLoginGuide;
      hideHarunaCheckbox.checked = globalSettings.hideHaruna;
      hideShopCheckbox.checked = globalSettings.hideShop;
      hideGiftCheckbox.checked = globalSettings.hideGift;
      hideRoomFeedCheckbox.checked = globalSettings.hideRoomFeed;
      hideRoomInfoCheckbox.checked = globalSettings.hideRoomInfo;
      hideNoticeCheckbox.checked = globalSettings.hideNotice;
      hideFooterCheckbox.checked = globalSettings.hideFooter;
      hidePrivacyCheckbox.checked = globalSettings.noPrivacy;
      hideWatermarkCheckbox.checked = globalSettings.hideWatermark;
      hideBusinessCheckbox.checked = globalSettings.hideBusiness;
      hideRankListCheckbox.checked = globalSettings.hideRankList;
      showLiveAreaCheckbox.checked = globalSettings.showLiveArea;
      showRoomTitleCheckbox.checked = globalSettings.showRoomTitle;
      closeLotteryCheckbox.checked = globalSettings.closeLottery;
      window.localStorage.setItem(
        "close_lottery_checked",
        closeLotteryCheckbox.checked
      );
      (() => {
        updateMessageSource();
        updateFooterVisibility();
        updateGiftVisibility();
        updateLoginGuideVisibility();
        updateHarunaVisibility();
        updateShopVisibility();
        updatePrivacyVisibility();
        updateWatermarkVisibility();
        updateBusinessVisibility();
        updateRankListVisibility();
        updateKeepAwake();
        updateMidnightSignIn();
        updateLotteryOptions();
        updateFixedHesitation();
        updateRandomHesitation();
        updateLotteryClosePreference();
        updateAutoLike();
        updateRoomFeedVisibility();
        updateRoomInfoVisibility();
        updateNoticeVisibility();
        updateLiveAreaVisibility();
        updateRoomTitle();
        let timerId = timers.setTimeout(() => {
          timers.clearTimeout(timerId);
          updateFooterVisibility();
          updateGiftVisibility();
          updateLoginGuideVisibility();
          updateHarunaVisibility();
          updateShopVisibility();
          updatePrivacyVisibility();
          updateWatermarkVisibility();
          updateBusinessVisibility();
          updateRankListVisibility();
          updateRoomFeedVisibility();
          updateRoomInfoVisibility();
          updateNoticeVisibility();
          updateLiveAreaVisibility();
          updateRoomTitle();
        }, 1500);
      })();
    }, openSettings = () => settingsPanel.style.display = "block", closeSettings = () => {
      restoreSettingsForm();
      settingsPanel.style.display = "none";
    }, rebuildMessagePool = () => {
      if (roomSettings.data1.values.length <= 0 && roomSettings.data2.values.length <= 0 && roomSettings.data3.values.length <= 0 && roomSettings.data4.values.length <= 0 && roomSettings.data5.values.length <= 0)
        return messagePool || [];
      let items = [];
      items = roomSettings.data1.available ? items.concat(roomSettings.data1.values) : items;
      items = roomSettings.data2.available ? items.concat(roomSettings.data2.values) : items;
      items = roomSettings.data3.available ? items.concat(roomSettings.data3.values) : items;
      items = roomSettings.data4.available ? items.concat(roomSettings.data4.values) : items;
      items = roomSettings.data5.available ? items.concat(roomSettings.data5.values) : items;
      messagePool = items;
      randomMessageCheckbox.checked ? messagePool = ((value) => {
        for (let index = 0; index < value.length; index++) {
          const localValue = Math.floor(Math.random() * value.length), localValue2 = value[index];
          value[index] = value[localValue];
          value[localValue] = localValue2;
        }
        return value;
      })(items) : messageIndex = 0;
    }, showStatus = (value, value2, value3) => {
      statusText.textContent = value;
      statusText.style.display = "block";
      statusText.style.color = value3 || "#128712";
      let timerId = timers.setTimeout(() => {
        timers.clearTimeout(timerId);
        statusText.style.display = "none";
        statusText.textContent = "";
        value2 && (settingsPanel.style.display = "none");
      }, 1500);
    }, saveSettings = () => {
      if (!baseInfo || isBlank(baseInfo.default) || isBlank(baseInfo.config))
        return void showStatus("保存失败", false, "red");
      baseInfo.config && (globalSettings.noSleep = noSleepCheckbox.checked, globalSettings.hideLoginGuide = hideLoginGuideCheckbox.checked, globalSettings.hideHaruna = hideHarunaCheckbox.checked, globalSettings.hideShop = hideShopCheckbox.checked, globalSettings.hideGift = hideGiftCheckbox.checked, globalSettings.hideRoomFeed = hideRoomFeedCheckbox.checked, globalSettings.hideRoomInfo = hideRoomInfoCheckbox.checked, globalSettings.hideNotice = hideNoticeCheckbox.checked, globalSettings.hideFooter = hideFooterCheckbox.checked, globalSettings.closeLottery = closeLotteryCheckbox.checked, window.localStorage.setItem(
        "close_lottery_checked",
        globalSettings.closeLottery
      ), globalSettings.noPrivacy = hidePrivacyCheckbox.checked, globalSettings.hideWatermark = hideWatermarkCheckbox.checked, globalSettings.hideBusiness = hideBusinessCheckbox.checked, globalSettings.hideRankList = hideRankListCheckbox.checked, globalSettings.showLiveArea = showLiveAreaCheckbox.checked, globalSettings.showRoomTitle = showRoomTitleCheckbox.checked, setStoredValue(baseInfo.config, globalSettings));
      let localValue = isBlank(groupOneInput.value) ? [] : groupOneInput.value.split("|"), localValue2 = isBlank(groupTwoInput.value) ? [] : groupTwoInput.value.split("|"), localValue3 = isBlank(groupThreeInput.value) ? [] : groupThreeInput.value.split("|"), localValue4 = isBlank(groupFourInput.value) ? [] : groupFourInput.value.split("|"), localValue5 = isBlank(groupFiveInput.value) ? [] : groupFiveInput.value.split("|");
      if (roomSettings.signIn.text = signInTextInput.value, roomSettings.signIn.auto = signInCheckbox.checked, roomSettings.send.random = randomMessageCheckbox.checked, roomSettings.send.interval = messageIntervalInput.value || 600, roomSettings.data1.available = groupOneCheckbox.checked, roomSettings.data2.available = groupTwoCheckbox.checked, roomSettings.data3.available = groupThreeCheckbox.checked, roomSettings.data4.available = groupFourCheckbox.checked, roomSettings.data5.available = groupFiveCheckbox.checked, roomSettings.like.likeRandom = randomLikeCheckbox.checked, roomSettings.like.likeInterval = fixedLikeCheckbox.checked, roomSettings.like.clickLikeInterval = likeIntervalInput.value || 6, roomSettings.lottery.lottery = lotteryCheckbox.checked, roomSettings.lottery.hesitationInterval = hesitationIntervalCheckbox.checked, roomSettings.lottery.hesitationIntervalExpiry = fixedHesitationInput.value, roomSettings.lottery.hesitationRandom = hesitationRandomCheckbox.checked, roomSettings.lottery.hesitationRandomExpiry = randomHesitationInput.value, roomSettings.usePublic = usePublicCheckbox.checked, usePublicCheckbox.checked || (roomSettings.data1.values = localValue, roomSettings.data2.values = localValue2, roomSettings.data3.values = localValue3, roomSettings.data4.values = localValue4, roomSettings.data5.values = localValue5), storeLotterySettings(roomSettings.lottery), setStoredValue(getRoomId(), roomSettings), setPublicCheckbox.checked) {
        let options = {
          data1: {},
          data2: {},
          data3: {},
          data4: {},
          data5: {}
        };
        options.data1.values = localValue;
        options.data2.values = localValue2;
        options.data3.values = localValue3;
        options.data4.values = localValue4;
        options.data5.values = localValue5;
        setStoredValue(baseInfo.default, options);
      }
      usePublicCheckbox.checked && (roomSettings.data1.values = localValue, roomSettings.data2.values = localValue2, roomSettings.data3.values = localValue3, roomSettings.data4.values = localValue4, roomSettings.data5.values = localValue5);
      rebuildMessagePool();
      showStatus("设置成功", true);
    }, sendNextMessage = () => messagePool.length < 1 ? (alert("请先设置弹幕"), false) : (randomMessageCheckbox.checked && (messageIndex = Math.floor(Math.random() * messagePool.length)), sendMessage(messagePool[messageIndex]), ++messageIndex >= messagePool.length && (messageIndex = 0), true), toggleMessageSending = () => {
      let index = 0;
      if (messageTimer) {
        timers.clearInterval(messageTimer);
        messageTimer = null;
        startButton.title = "开始定时发送任务";
        messageIntervalInput.removeAttribute("disabled");
        messageIntervalInput.classList.remove("disabled");
        startButtonLabel ? (startButton.style.removeProperty("background"), startButton.style.removeProperty("--color"), startButtonLabel.textContent = "开始") : startButton.style.removeProperty("color");
      } else {
        if (index = 1e3 * (messageIntervalInput.value || 600), !sendNextMessage())
          return;
        messageTimer = timers.setInterval(sendNextMessage, index);
        startButton.title = "停止定时发送任务";
        messageIntervalInput.setAttribute("disabled", "disabled");
        messageIntervalInput.classList.add("disabled");
        startButtonLabel ? (startButton.style.background = "rgba(255,0,0,1)", startButton.style.setProperty("--color", "rgba(255,0,0,0.8)"), startButtonLabel.textContent = "停止") : startButton.style.color = "rgb(255 102 153)";
      }
    }, createSecondsInput = () => {
      let inputElement = document.createElement("input");
      return inputElement.style.border = "0", inputElement.style.width = "55px", inputElement.setAttribute("placeholder", "单位：秒"), inputElement.addEventListener("input", () => {
        inputElement.value = inputElement.value.replace(/[^0-9]/g, "");
      }), inputElement;
    }, createCheckbox = (value, value2, value3, value4, value5, value6, value7, value8, value9, value10) => {
      let inputElement = document.createElement("input");
      inputElement.type = "checkbox";
      inputElement.id = value;
      inputElement.checked = false;
      value4 && !value10 && inputElement.addEventListener("click", value4);
      let labelElement = document.createElement("label");
      labelElement.setAttribute("for", value);
      labelElement.classList.add("switch-check-label");
      let spanElement = document.createElement("span");
      spanElement.textContent = value2;
      spanElement.title = value3;
      spanElement.classList.add("danmu-random-switch-button-title");
      value10 && (inputElement.disabled = true, inputElement.classList.add("disabled"), labelElement.classList.add("disabled"), spanElement.classList.add("disabled"));
      let divElement = document.createElement("div");
      return divElement.id = value + "Div", divElement.classList.add("switch-check"), divElement.classList.add("switch-check-group"), divElement.appendChild(inputElement), divElement.appendChild(labelElement), divElement.appendChild(spanElement), isBlank(value6) || (divElement.style.marginLeft = value6), isBlank(value7) || (divElement.style.width = value7), value8 && divElement.style.setProperty("display", "none"), value9 && (divElement.appendChild(value9), value10 && (value9.disabled = true, value9.classList.add("disabled"))), value5.appendChild(divElement), inputElement;
    }, createSettingsPanel = () => {
      let divElement = document.createElement("div");
      divElement.textContent = "弹幕设置";
      divElement.classList.add("danmu-random-setting-title");
      let divElement2 = document.createElement("div");
      divElement2.textContent = "3.0.0";
      divElement2.classList.add("danmu-random-setting-title-sub");
      divElement.appendChild(divElement2);
      let divElement3 = document.createElement("div");
      divElement3.classList.add("danmu-random-setting-tips");
      divElement3.innerHTML = '任一分组内输入弹幕即可，多条用<span style="color:#dc6b07;margin:0 2px 0 4px;font-weight:700;font-style:normal;">竖线</span>分隔';
      (moduleInfoElement = document.createElement("div")).classList.add(
        "module-update-info"
      );
      moduleInfoElement.innerHTML = `<span class="update-info-text">消息提示：</span><span class="update-info-text" style="color:#0f6ba6;">${baseInfo.msg || "直播间标题补充分区信息"}</span>`;
      let divElement4 = document.createElement("div");
      divElement4.textContent = "分组 1 ：";
      divElement4.classList.add("danmu-group-title");
      (groupOneCheckbox = document.createElement("input")).type = "checkbox";
      groupOneCheckbox.id = "group1Checkbox";
      groupOneCheckbox.checked = true;
      let labelElement = document.createElement("label");
      labelElement.setAttribute("for", "group1Checkbox");
      labelElement.classList.add("switch-check-label");
      let divElement5 = document.createElement("div");
      divElement5.classList.add("switch-check");
      divElement5.appendChild(groupOneCheckbox);
      divElement5.appendChild(labelElement);
      (groupOneInput = document.createElement("textarea")).classList.add(
        "danmu-group-textarea"
      );
      groupOneInput.setAttribute(
        "placeholder",
        "请输入弹幕，多条弹幕请用“|”分隔"
      );
      let divElement6 = document.createElement("div");
      divElement6.textContent = "分组 2 ：";
      divElement6.classList.add("danmu-group-title");
      (groupTwoCheckbox = document.createElement("input")).type = "checkbox";
      groupTwoCheckbox.id = "group2Checkbox";
      groupTwoCheckbox.checked = true;
      let labelElement2 = document.createElement("label");
      labelElement2.setAttribute("for", "group2Checkbox");
      labelElement2.classList.add("switch-check-label");
      let divElement7 = document.createElement("div");
      divElement7.classList.add("switch-check");
      divElement7.appendChild(groupTwoCheckbox);
      divElement7.appendChild(labelElement2);
      (groupTwoInput = document.createElement("textarea")).classList.add(
        "danmu-group-textarea"
      );
      groupTwoInput.setAttribute(
        "placeholder",
        "请输入弹幕，多条弹幕请用“|”分隔"
      );
      let divElement8 = document.createElement("div");
      divElement8.textContent = "分组 3 ：";
      divElement8.classList.add("danmu-group-title");
      (groupThreeCheckbox = document.createElement("input")).type = "checkbox";
      groupThreeCheckbox.id = "group3Checkbox";
      groupThreeCheckbox.checked = true;
      let labelElement3 = document.createElement("label");
      labelElement3.setAttribute("for", "group3Checkbox");
      labelElement3.classList.add("switch-check-label");
      let divElement9 = document.createElement("div");
      divElement9.classList.add("switch-check");
      divElement9.appendChild(groupThreeCheckbox);
      divElement9.appendChild(labelElement3);
      (groupThreeInput = document.createElement("textarea")).classList.add(
        "danmu-group-textarea"
      );
      groupThreeInput.setAttribute(
        "placeholder",
        "请输入弹幕，多条弹幕请用“|”分隔"
      );
      let divElement10 = document.createElement("div");
      divElement10.textContent = "分组 4 ：";
      divElement10.classList.add("danmu-group-title");
      (groupFourCheckbox = document.createElement("input")).type = "checkbox";
      groupFourCheckbox.id = "group4Checkbox";
      groupFourCheckbox.checked = true;
      let labelElement4 = document.createElement("label");
      labelElement4.setAttribute("for", "group4Checkbox");
      labelElement4.classList.add("switch-check-label");
      let divElement11 = document.createElement("div");
      divElement11.classList.add("switch-check");
      divElement11.appendChild(groupFourCheckbox);
      divElement11.appendChild(labelElement4);
      (groupFourInput = document.createElement("textarea")).classList.add(
        "danmu-group-textarea"
      );
      groupFourInput.setAttribute(
        "placeholder",
        "请输入弹幕，多条弹幕请用“|”分隔"
      );
      let divElement12 = document.createElement("div");
      divElement12.textContent = "分组 5 ：";
      divElement12.classList.add("danmu-group-title");
      (groupFiveCheckbox = document.createElement("input")).type = "checkbox";
      groupFiveCheckbox.id = "group5Checkbox";
      groupFiveCheckbox.checked = true;
      let labelElement5 = document.createElement("label");
      labelElement5.setAttribute("for", "group5Checkbox");
      labelElement5.classList.add("switch-check-label");
      let divElement13 = document.createElement("div");
      divElement13.classList.add("switch-check");
      divElement13.appendChild(groupFiveCheckbox);
      divElement13.appendChild(labelElement5);
      (groupFiveInput = document.createElement("textarea")).classList.add(
        "danmu-group-textarea"
      );
      groupFiveInput.setAttribute(
        "placeholder",
        "请输入弹幕，多条弹幕请用“|”分隔"
      );
      (intervalPrefixLabel = document.createElement("span")).textContent = "设置弹幕每";
      intervalPrefixLabel.classList.add("danmu-text-span");
      intervalPrefixLabel.style.marginLeft = "4px";
      (messageIntervalInput = document.createElement("input")).value = 600;
      messageIntervalInput.classList.add("danmu-second-input");
      messageIntervalInput.addEventListener("input", () => {
        messageIntervalInput.value = messageIntervalInput.value.replace(
          /[^0-9]/g,
          ""
        );
      });
      (intervalSuffixLabel = document.createElement("span")).textContent = "秒发送一次";
      intervalSuffixLabel.classList.add("danmu-text-span");
      intervalSuffixLabel.style.marginRight = "4px";
      let divElement14 = document.createElement("div");
      divElement14.appendChild(intervalPrefixLabel);
      divElement14.appendChild(messageIntervalInput);
      divElement14.appendChild(intervalSuffixLabel);
      let divElement15 = document.createElement("div");
      divElement15.style.textIndent = "12px";
      divElement15.style.fontSize = "12px";
      divElement15.style.color = "#e30388";
      divElement15.textContent = "▲ 执行任务时会占用发送按钮对上的输入框，如果输入框有内容则停止发送任务，直到清空输入框为止";
      (signInTextInput = document.createElement("input")).id = "signInputText";
      signInTextInput.style.border = "0";
      signInTextInput.style.width = "90px";
      signInTextInput.setAttribute("placeholder", "输入打卡的文字");
      fixedHesitationInput = createSecondsInput();
      randomHesitationInput = createSecondsInput();
      likeIntervalInput = createSecondsInput();
      let divElement16 = document.createElement("div");
      divElement16.appendChild(divElement4);
      divElement16.appendChild(divElement5);
      divElement16.appendChild(groupOneInput);
      divElement16.appendChild(divElement6);
      divElement16.appendChild(divElement7);
      divElement16.appendChild(groupTwoInput);
      divElement16.appendChild(divElement8);
      divElement16.appendChild(divElement9);
      divElement16.appendChild(groupThreeInput);
      divElement16.appendChild(divElement10);
      divElement16.appendChild(divElement11);
      divElement16.appendChild(groupFourInput);
      divElement16.appendChild(divElement12);
      divElement16.appendChild(divElement13);
      divElement16.appendChild(groupFiveInput);
      divElement16.appendChild(divElement14);
      divElement16.appendChild(divElement15);
      randomMessageCheckbox = createCheckbox(
        "rdCheckbox",
        "随机从上面的弹幕中选出一条发送",
        "将合并所有分组数据，从中随机选出一条发送",
        null,
        divElement16
      );
      signInCheckbox = createCheckbox(
        "signInCheckbox",
        "打卡弹幕：",
        "每日零点自动发送一条打卡弹幕",
        updateMidnightSignIn,
        divElement16,
        null,
        null,
        false,
        signInTextInput
      );
      autoLikeCheckbox = createCheckbox(
        "autoLikeCheckbox",
        "自动点赞该直播间",
        "分成固定间隔的定时点赞和随机某个时间点点赞功能",
        updateAutoLike,
        divElement16,
        null,
        null,
        null,
        null,
        null
      );
      fixedLikeCheckbox = createCheckbox(
        "clickLikeIntervalCheckbox",
        "定时点赞：",
        "大于3秒的时间间隔任意设置（时间单位：秒，最小间隔3秒，免得被滥用惹恼了阿B加上人机校验）",
        updateFixedLike,
        divElement16,
        "23px",
        "90%",
        true,
        likeIntervalInput,
        false
      );
      randomLikeCheckbox = createCheckbox(
        "clickLikeRandomCheckbox",
        "随机时间点点赞",
        "每15秒内随机一个时间点点赞一次直播间（点赞1000次大概需要4小时）",
        updateRandomLike,
        divElement16,
        "23px",
        "90%",
        true,
        null,
        false
      );
      lotteryCheckbox = createCheckbox(
        "lotteryCheckbox",
        "自动参与天选时刻/福袋抽奖",
        "自动点击参与按钮，请确保已经登录了阿B账号",
        updateLotteryOptions,
        divElement16
      );
      hesitationIntervalCheckbox = createCheckbox(
        "hesitationIntervalCheckbox",
        "犹豫期：",
        "不立刻参与天选时刻，这期间可以手动处理，免得自动参加后后悔（时间单位：秒）",
        updateFixedHesitation,
        divElement16,
        "23px",
        "90%",
        true,
        fixedHesitationInput,
        false
      );
      hesitationRandomCheckbox = createCheckbox(
        "hesitationRandomCheckbox",
        "随机犹豫期：",
        "尝试应对人机校验，不一定有效，随机的范围：(0, 填的数字]（时间单位：秒）",
        updateRandomHesitation,
        divElement16,
        "23px",
        "90%",
        true,
        randomHesitationInput,
        false
      );
      usePublicCheckbox = createCheckbox(
        "usePublicCheckbox",
        "使用共用弹幕源",
        "使用设置为共用弹幕作为弹幕源",
        updateMessageSource,
        divElement16
      );
      let divElement17 = document.createElement("div");
      divElement17.textContent = "以上设置对应各个直播间独立保存，无需刷新";
      divElement17.title = "请点击设置面板底下的“✓”进行保存";
      divElement17.classList.add("global-setting-tip");
      divElement17.classList.add("switch-check-group");
      divElement16.appendChild(divElement17);
      let divElement18 = document.createElement("div");
      divElement18.style.margin = "20px 0 10px";
      (divElement17 = document.createElement("div")).textContent = "以下设置，需刷新其它直播间才能适用";
      divElement17.title = "请点击设置面板底下的“✓”进行保存";
      divElement17.classList.add("global-setting-tip");
      divElement17.classList.add("switch-check-group");
      divElement18.appendChild(divElement17);
      setPublicCheckbox = createCheckbox(
        "setPublicCheckbox",
        "设为共用弹幕源",
        "把这个直播间的弹幕共享给其它直播间使用，先后设置时，后面的会覆盖前面的设置",
        onPublicSourceSelected,
        divElement18
      );
      closeLotteryCheckbox = createCheckbox(
        "closeLotteryCheckbox",
        "关闭天选时刻/福袋",
        "关闭天选时刻/福袋弹窗",
        updateLotteryClosePreference,
        divElement18
      );
      hideGiftCheckbox = createCheckbox(
        "hideGiftControlCheckbox",
        "隐藏礼物栏",
        "隐藏播放器底部的礼物栏",
        updateGiftVisibility,
        divElement18
      );
      noSleepCheckbox = createCheckbox(
        "noSleepCheckbox",
        "防止直播间休眠",
        "防止直播间页面一段时间没操作之后进入休眠",
        updateKeepAwake,
        divElement18,
        null,
        null,
        false
      );
      hideLoginGuideCheckbox = createCheckbox(
        "hideLoginGuideCheckbox",
        "隐藏播放器底部登录提示",
        "隐藏未登录时播放器底部显示的登录提示",
        updateLoginGuideVisibility,
        divElement18
      );
      hideHarunaCheckbox = createCheckbox(
        "hideHarunaCheckbox",
        "隐藏看板娘立绘",
        "隐藏直播间Haruna立绘",
        updateHarunaVisibility,
        divElement18
      );
      hideShopCheckbox = createCheckbox(
        "hideShopCheckbox",
        "隐藏购物提示",
        "隐藏播放器左上角的商店购物提示",
        updateShopVisibility,
        divElement18
      );
      hideRoomFeedCheckbox = createCheckbox(
        "hideRoomFeedCheckbox",
        "隐藏主播动态",
        "隐藏播放器底下主播的动态栏",
        updateRoomFeedVisibility,
        divElement18
      );
      hideRoomInfoCheckbox = createCheckbox(
        "hideRoomInfoCheckbox",
        "隐藏简介、荣誉，或直播间推荐列表",
        "隐藏播放器底下直播间推荐列表，不登录账号显示为主播的荣耀和简介",
        updateRoomInfoVisibility,
        divElement18
      );
      hideNoticeCheckbox = createCheckbox(
        "hideNoticeCheckbox",
        "隐藏主播公告",
        "隐藏弹幕列表底下主播的公告",
        updateNoticeVisibility,
        divElement18
      );
      hideFooterCheckbox = createCheckbox(
        "hideFooterCheckbox",
        "隐藏直播间页脚",
        "隐藏直播间底部的网页页脚",
        updateFooterVisibility,
        divElement18
      );
      hidePrivacyCheckbox = createCheckbox(
        "hidePrivacyCheckbox",
        "隐藏隐私提示对话框",
        "隐藏隐私提示登录的对话框，被打码的昵称不保证变回正常",
        updatePrivacyVisibility,
        divElement18
      );
      hideWatermarkCheckbox = createCheckbox(
        "hideRoomStatusCheckbox",
        "隐藏直播水印",
        "隐藏播放器左上角的直播水印",
        updateWatermarkVisibility,
        divElement18
      );
      hideBusinessCheckbox = createCheckbox(
        "hideBusinessCheckbox",
        "隐藏商业性互动",
        "隐藏全站广播、PK、连MIC、连视频等",
        updateBusinessVisibility,
        divElement18
      );
      hideRankListCheckbox = createCheckbox(
        "hideRankListCheckbox",
        "隐藏滚动排行榜",
        "隐藏顶部的人气榜、航海榜、礼物星球等",
        updateRankListVisibility,
        divElement18
      );
      showLiveAreaCheckbox = createCheckbox(
        "showLiveArea",
        "显示直播分区",
        "显示直播间所属的直播分区",
        updateLiveAreaVisibility,
        divElement18,
        null,
        null,
        true,
        null,
        true
      );
      showRoomTitleCheckbox = createCheckbox(
        "showRoomTitle",
        "显示直播间标题",
        "在播放器顶头显示直播间标题和分区",
        updateRoomTitle,
        divElement18,
        null,
        null,
        false,
        null,
        false
      );
      (statusText = document.createElement("span")).classList.add(
        "danmu-random-setting-success-text"
      );
      let divElement19 = document.createElement("div");
      divElement19.classList.add("danmu-random-setting-success-tips");
      divElement19.appendChild(statusText);
      let iElement = document.createElement("i");
      iElement.setAttribute("title", "保存");
      iElement.style.padding = "5px";
      iElement.classList.add("el-button");
      iElement.classList.add("el-icon-check");
      iElement.classList.add("is-circle");
      iElement.addEventListener("click", saveSettings);
      let iElement2 = document.createElement("i");
      iElement2.setAttribute("title", "关闭");
      iElement2.style.padding = "5px";
      iElement2.classList.add("el-button");
      iElement2.classList.add("el-icon-close");
      iElement2.classList.add("is-circle");
      iElement2.addEventListener("click", closeSettings);
      let divElement20 = document.createElement("div");
      divElement20.classList.add("danmu-random-set-button-container");
      divElement20.appendChild(iElement);
      divElement20.appendChild(iElement2);
      let divElement21 = document.createElement("div");
      divElement21.classList.add("danmu-random-setting-bottom");
      divElement21.appendChild(divElement19);
      divElement21.appendChild(divElement20);
      let divElement22 = document.createElement("div");
      divElement22.id = "otherContainer";
      let divElement23 = document.createElement("div");
      divElement23.style.height = "calc(98% - 30px - 25px)";
      divElement23.appendChild(divElement16);
      divElement23.appendChild(divElement18);
      divElement23.appendChild(divElement22);
      divElement23.appendChild(divElement21);
      (settingsPanel = document.createElement("div")).id = "danmu-setting-panel";
      settingsPanel.classList.add("danmu-random-setting-panel");
      settingsPanel.appendChild(divElement);
      settingsPanel.appendChild(moduleInfoElement);
      settingsPanel.appendChild(divElement3);
      settingsPanel.appendChild(divElement23);
      document.body.appendChild(settingsPanel);
    }, createStartButton = () => {
      startButton = document.createElement("button");
      startButtonLabel = document.createElement("span");
      startButtonLabel.textContent = "开始";
      startButton.title = "开始定时发送任务";
      startButton.addEventListener("click", toggleMessageSending);
      startButton.appendChild(startButtonLabel);
    }, setDisplay = (value, value2, value3) => {
      value && (value3 ? value.style.setProperty("display", value2, "important") : value.style.setProperty("display", value2));
    }, setHidden = (value, value2) => {
      value2 ? setDisplay(value, "none", true) : value.style.removeProperty("display");
    }, removeClassRecursively = (value, value2) => {
      if (value.classList.remove(value2), 0 < value.children.length)
        for (let index = 0; index < value.children.length; index++)
          removeClassRecursively(value.children[index], value2);
    }, addClassRecursively = (value, value2) => {
      if (value.classList.add(value2), 0 < value.children.length)
        for (let index = 0; index < value.children.length; index++)
          addClassRecursively(value.children[index], value2);
    }, updateLoginGuideVisibility = () => {
      let element = document.getElementById("switch-login-guide-vm");
      element && setHidden(element, hideLoginGuideCheckbox.checked);
    }, updateHarunaVisibility = () => {
      let element = document.getElementById("my-dear-haruna-vm");
      element && setHidden(element, hideHarunaCheckbox.checked);
    }, updateShopVisibility = () => {
      let element = document.getElementById("shop-popover-vm");
      element && setHidden(element, hideShopCheckbox.checked);
    }, updateGiftVisibility = () => {
      let localValue = document.getElementsByClassName(
        "gift-control-section"
      )[0];
      if (localValue && setHidden(localValue, hideGiftCheckbox.checked), (localValue = document.getElementById(
        "web-player__bottom-bar__container"
      )) && setHidden(localValue, hideGiftCheckbox.checked), localValue = document.getElementsByClassName(
        "fullscreen-container-paddingbox"
      )[0]) {
        let element = document.getElementById("fullscreen-container");
        element && (hideGiftCheckbox.checked ? (localValue.style.setProperty("height", "100%"), element.style.setProperty(
          "grid-template-rows",
          "minmax(0,1fr) 0px",
          "important"
        )) : (localValue.style.removeProperty("height"), element.style.removeProperty("grid-template-rows")));
      }
    }, updateRoomFeedVisibility = () => {
      let localValue = document.getElementsByClassName("room-feed")[0];
      localValue && setHidden(localValue, hideRoomFeedCheckbox.checked);
      (localValue = document.getElementsByClassName(
        "flip-view p-relative"
      )[0]) && setHidden(localValue, hideRoomFeedCheckbox.checked);
    }, updateRoomInfoVisibility = () => {
      let localValue = document.getElementsByClassName("room-info-ctnr")[0];
      localValue && setHidden(localValue, hideRoomInfoCheckbox.checked);
    }, updateNoticeVisibility = () => {
      let localValue = document.getElementsByClassName("right-container")[0];
      localValue && (localValue.style.setProperty("min-height", "auto"), setHidden(localValue, hideNoticeCheckbox.checked));
    }, updateFooterVisibility = () => {
      let element = document.getElementById("link-footer-vm");
      element && setHidden(element, hideFooterCheckbox.checked);
      (element = document.getElementsByClassName("link-footer")[0]) && setHidden(element, hideFooterCheckbox.checked);
    }, updatePrivacyVisibility = () => {
      if (hidePrivacyCheckbox.checked) {
        let styleElement = document.createElement("style");
        styleElement.id = "hidePrivacyDialog";
        styleElement.setAttribute("type", "text/css");
        styleElement.innerHTML = ".privacy-dialog{display:none !important;}";
        document.head.appendChild(styleElement);
      } else {
        let element = document.getElementById("hidePrivacyDialog");
        element && element.remove();
      }
    }, updateWatermarkVisibility = () => {
      let localValue = document.getElementsByClassName(
        "web-player-icon-roomStatus"
      )[0];
      localValue && setHidden(localValue, hideWatermarkCheckbox.checked);
    }, updateBusinessVisibility = () => {
      let element = document.getElementById("businessContainerElement");
      element && setHidden(element, hideBusinessCheckbox.checked);
    }, resetTitleLayout = () => {
      let element = document.getElementById("playback-rate-title");
      element && (setHidden(element, true), element.parentElement.style.removeProperty("padding-bottom"));
      (element = document.getElementById("playback-rate-username")) && element.style.removeProperty("display");
    }, updateRankListVisibility = () => {
      let localValue = document.getElementsByClassName("lower-row")[0];
      if (localValue) {
        let localValue2 = localValue.getElementsByClassName("right-ctnr")[0];
        if (localValue2) {
          setHidden(localValue2, hideRankListCheckbox.checked);
          let timerId = timers.setTimeout(() => {
            timers.clearTimeout(timerId);
            timerId = null;
            resetTitleLayout();
          }, 100);
        }
      }
      localValue = null;
      (localValue = document.getElementsByClassName(
        "right-dynamic-modules"
      )[0]) && setHidden(localValue, hideRankListCheckbox.checked);
    }, updateLiveAreaVisibility = () => {
      let localValue = document.getElementsByClassName("live-area")[0];
      localValue && (((value, value2) => {
        value && (value2 ? setDisplay(value, "block", true) : value.style.removeProperty("display"));
      })(localValue, showLiveAreaCheckbox.checked), resetTitleLayout());
    }, updateRoomTitle = () => {
      let element = document.getElementById("live-room-title"), element2 = document.getElementById("live-room-area");
      if (!element && showRoomTitleCheckbox.checked) {
        let localValue = document.getElementsByClassName("normal-row-ctnr")[0];
        if (localValue) {
          let element3 = localValue.querySelector(".right-section");
          if (element3) {
            let divElement = document.createElement("div");
            divElement.style = "display: flex; flex-direction: column; margin-left: 10px;";
            element3.prepend(divElement);
            element3.style.justifyContent = "space-between";
            (element = document.createElement("span")).id = "live-room-title";
            element.className = "live-skin-main-text";
            element.style = "font-size: 15px;";
            element.textContent = (() => {
              let localValue5 = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.title : null;
              return localValue5 || ((localValue5 = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data.title : null) ? localValue5 : (localValue5 = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.roomTitle : null) ? localValue5 : (localValue5 = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.title : null) ? localValue5 : (console.warn("===> 获取不到直播间标题"), null));
            })();
            divElement.appendChild(element);
            (element2 = document.createElement("div")).id = "live-room-area";
            element2.className = "live-skin-main-text";
            element2.style = "height: 16px; line-height: 16px; font-size: 11px; white-space: nowrap;";
            divElement.appendChild(element2);
            let localValue2 = (() => {
              let localValue5 = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.parent_area_id : null;
              return localValue5 || ((localValue5 = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.parentAreaID : null) ? localValue5 : (localValue5 = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.parent_area_id : null) ? localValue5 : (console.warn("===> 获取不到直播父区域ID"), 6));
            })(), localValue3 = getParentAreaName(), aElement = document.createElement("a");
            aElement.title = localValue3;
            aElement.textContent = localValue3;
            aElement.className = "live-skin-main-text";
            aElement.href = `https://live.bilibili.com/p/eden/area-tags?parentAreaId=${localValue2}`;
            aElement.target = "_blank";
            element2.appendChild(aElement);
            let spanElement = document.createElement("span");
            spanElement.textContent = " > ";
            element2.appendChild(spanElement);
            let localValue4 = (() => {
              let localValue5 = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.area_name : null;
              return localValue5 || ((localValue5 = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.areaName : null) ? localValue5 : (localValue5 = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.area_name : null) ? localValue5 : (console.warn("===> 获取不到直播区域名称"), null));
            })(), aElement2 = document.createElement("a");
            aElement2.title = localValue4;
            aElement2.textContent = localValue4;
            aElement2.className = "live-skin-main-text";
            aElement2.href = `https://live.bilibili.com/p/eden/area-tags?areaId=${(() => {
              let localValue5 = pageWindow.__NEPTUNE_IS_MY_WAIFU__ && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data && pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info ? pageWindow.__NEPTUNE_IS_MY_WAIFU__.roomInfoRes.data.room_info.area_id : null;
              return localValue5 || ((localValue5 = pageWindow.__STORE__ && pageWindow.__STORE__.baseInfoRoom ? pageWindow.__STORE__.baseInfoRoom.areaID : null) ? localValue5 : (localValue5 = pageWindow.__SSR_INITIAL_STATE__ && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom && pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info ? pageWindow.__SSR_INITIAL_STATE__.baseInfoRoom.room_info.area_id : null) ? localValue5 : (console.warn("===> 获取不到直播区域id"), 0));
            })()}&parentAreaId=${localValue2}`;
            aElement2.target = "_blank";
            element2.appendChild(aElement2);
          }
        }
      } else {
        setHidden(element, !showRoomTitleCheckbox.checked);
        element2 && setHidden(element2, !showRoomTitleCheckbox.checked);
      }
    }, readLotterySettings = () => {
      let localValue = window.localStorage.getItem("lottery_" + getRoomId());
      if (!localValue) return roomSettings.lottery;
      if ("string" == typeof localValue)
        try {
          localValue = JSON.parse(localValue);
        } catch (localValue2) {
          console.error("===> Parsing error:", localValue2);
          localValue = roomSettings.lottery;
        }
      return localValue;
    }, storeLotterySettings = (value) => {
      window.localStorage.setItem(
        "lottery_" + getRoomId(),
        JSON.stringify(value)
      );
    }, updateLotteryOptions = () => {
      let element = document.getElementById("hesitationIntervalCheckboxDiv");
      element && setHidden(element, !lotteryCheckbox.checked);
      let element2 = document.getElementById("hesitationRandomCheckboxDiv");
      element2 && setHidden(element2, !lotteryCheckbox.checked);
      let localValue = readLotterySettings();
      localValue.lottery = lotteryCheckbox.checked;
      lotteryCheckbox.checked || (hesitationIntervalCheckbox.checked = false, fixedHesitationInput.disabled = false, hesitationIntervalCheckbox.disabled = false, localValue.hesitationInterval = hesitationIntervalCheckbox.checked, localValue.hesitationIntervalExpiry = fixedHesitationInput.value, element && removeClassRecursively(element, "disabled"), hesitationRandomCheckbox.checked = false, randomHesitationInput.disabled = false, hesitationRandomCheckbox.disabled = false, localValue.hesitationRandom = hesitationRandomCheckbox.checked, localValue.hesitationRandomExpiry = randomHesitationInput.value, element2 && removeClassRecursively(element2, "disabled"));
      storeLotterySettings(localValue);
    }, updateLotteryClosePreference = () => {
      window.localStorage.setItem(
        "close_lottery_checked",
        closeLotteryCheckbox.checked
      );
    }, updateFixedHesitation = () => {
      let element = document.getElementById("hesitationRandomCheckboxDiv");
      hesitationIntervalCheckbox.checked ? (fixedHesitationInput.disabled = true, randomHesitationInput.disabled = true, hesitationRandomCheckbox.checked = false, hesitationRandomCheckbox.disabled = true, element && addClassRecursively(element, "disabled")) : (hesitationRandomCheckbox.disabled = false, element && removeClassRecursively(element, "disabled"), hesitationRandomCheckbox.checked || (randomHesitationInput.disabled = false, fixedHesitationInput.disabled = false));
      let localValue = readLotterySettings();
      localValue.hesitationInterval = hesitationIntervalCheckbox.checked;
      localValue.hesitationIntervalExpiry = fixedHesitationInput.value;
      storeLotterySettings(localValue);
    }, updateRandomHesitation = () => {
      let element = document.getElementById("hesitationIntervalCheckboxDiv");
      hesitationRandomCheckbox.checked ? (randomHesitationInput.disabled = true, fixedHesitationInput.disabled = true, hesitationIntervalCheckbox.checked = false, hesitationIntervalCheckbox.disabled = true, element && addClassRecursively(element, "disabled")) : (hesitationIntervalCheckbox.disabled = false, element && removeClassRecursively(element, "disabled"), hesitationIntervalCheckbox.checked || (randomHesitationInput.disabled = false, fixedHesitationInput.disabled = false));
      let localValue = readLotterySettings();
      localValue.hesitationRandom = hesitationRandomCheckbox.checked;
      localValue.hesitationRandomExpiry = randomHesitationInput.value;
      storeLotterySettings(localValue);
    }, onPublicSourceSelected = () => {
    }, updateMessageSource = () => {
      let localValue = null;
      (localValue = usePublicCheckbox.checked ? getStoredValue(baseInfo.default, null) : roomSettings) && fillMessageGroups(localValue);
    }, updateAutoLike = () => likeController.sync("master"), updateFixedLike = () => likeController.sync("fixed"), updateRandomLike = () => likeController.sync("random"), updateKeepAwake = () => {
      noSleepCheckbox.checked ? keepAwakeTimer || (console.log("===> 开启防休眠功能"), keepAwakeTimer = timers.setInterval(() => {
        keepAwakeMoveTimer = timers.setTimeout(() => {
          timers.clearTimeout(keepAwakeMoveTimer);
          document.body.dispatchEvent(
            new MouseEvent("mousemove", {
              bubbles: true
            })
          );
        }, 3e3 * Math.random());
      }, 17e3)) : (console.log("===> 关闭防休眠功能"), keepAwakeTimer && (timers.clearInterval(keepAwakeTimer), keepAwakeTimer = null), keepAwakeMoveTimer && (timers.clearTimeout(keepAwakeMoveTimer), keepAwakeMoveTimer = null));
    }, closeLotteryDialog = (value) => {
      let localValue = document.getElementsByClassName(
        "close-btn bg-contain"
      )[0];
      if (localValue) {
        if (isBlank(value)) localValue.click();
        else
          var timerId = timers.setTimeout(() => {
            timers.clearTimeout(timerId);
            localValue.click();
          }, 1e3 * value);
        return;
      }
      const localValue2 = document.getElementsByClassName("lucky-bag-header")[0];
      if (localValue2) {
        if (localValue = localValue2.getElementsByClassName("close-btn")[0])
          if (isBlank(value)) localValue.click();
          else
            timerId = timers.setTimeout(() => {
              timers.clearTimeout(timerId);
              localValue.click();
            }, 1e3 * value);
      } else ;
    }, scheduleLotteryParticipation = (value, value2) => {
      let timerId = timers.setTimeout(() => {
        timers.clearTimeout(timerId);
        value.click();
        "true" === window.localStorage.getItem("close_lottery_checked") && closeLotteryDialog(3);
      }, value2);
    }, handleLotteryDialog = (value) => {
      let localValue = readLotterySettings();
      if (localValue.lottery) {
        if (localValue.hesitationInterval) {
          let localValue2 = isBlank(localValue.hesitationIntervalExpiry) || 0 >= localValue.hesitationIntervalExpiry ? 1e5 : 1e3 * localValue.hesitationIntervalExpiry;
          scheduleLotteryParticipation(value, localValue2);
        } else if (localValue.hesitationRandom) {
          let localValue2 = isBlank(localValue.hesitationRandomExpiry) || 0 >= localValue.hesitationRandomExpiry ? 1e5 : 1e3 * localValue.hesitationRandomExpiry;
          localValue2 = Math.ceil(Math.random() * localValue2);
          scheduleLotteryParticipation(value, localValue2);
        } else {
          value.click();
          "true" === window.localStorage.getItem("close_lottery_checked") && closeLotteryDialog(3);
        }
      } else
        "true" === window.localStorage.getItem("close_lottery_checked") && closeLotteryDialog();
    }, showRecommendedRoomTitles = (value) => {
      !value || 0 >= value.length || Array.prototype.forEach.call(value, (value2) => {
        let localValue = value2.firstChild;
        if (!localValue) return;
        let localValue2 = localValue.children[1];
        if (!localValue2) return;
        let localValue3 = localValue2.children[1];
        if (!localValue3) return;
        let localValue4 = localValue3.children[1];
        if (!localValue4) return;
        let localValue5 = localValue4.children[0];
        if (!localValue5) return;
        localValue.title = localValue5.textContent;
        let localValue6 = localValue2.children[0];
        if (localValue6) {
          let localValue7 = localValue6.lastChild;
          localValue7 && localValue7.style.display && "none" == localValue7.style.display && localValue7.remove();
        }
      });
    }, readGlobalSettings = () => {
      let options = {};
      return baseInfo.config && (options = getStoredValue(baseInfo.config, {}), delete options.script, delete options.moduleVersion, delete options.lastUpdate, !isBlank(options.hesitationExpiry) && delete options.hesitationExpiry, (!isBlank(options.signInText) || "" == options.signInText) && delete options.signInText, (true === options.autoSignIn || false === options.autoSignIn) && delete options.autoSignIn, (true === options.lottery || false === options.lottery) && delete options.lottery, (true === options.hesitation || false === options.hesitation) && delete options.hesitation, isBlank(options.closeLottery) && (options.closeLottery = false)), options;
    }, migrateRoomSettings = (saved) => {
      for (const key of [
        "signIn",
        "send",
        "like",
        "lottery",
        "data1",
        "data2",
        "data3",
        "data4",
        "data5"
      ]) {
        const previous = saved[key];
        roomSettings[key] = {
          ...roomSettings[key],
          ...previous && typeof previous === "object" ? previous : {}
        };
      }
      roomSettings.usePublic = Boolean(saved.usePublic);
      if (saved.version !== 6) {
        roomSettings.send.random = saved.sendMsgRandom ?? saved.random ?? roomSettings.send.random;
        roomSettings.send.interval = saved.sendMsgInterval ?? saved.interval ?? roomSettings.send.interval;
        roomSettings.like.likeRandom = saved.likeRandom ?? roomSettings.like.likeRandom;
        roomSettings.like.likeInterval = saved.likeInterval ?? roomSettings.like.likeInterval;
        roomSettings.like.clickLikeInterval = saved.clickLikeInterval ?? roomSettings.like.clickLikeInterval;
        roomSettings.signIn.text = saved.signInText ?? roomSettings.signIn.text;
      }
      if (roomSettings.usePublic) {
        const shared = getStoredValue(baseInfo.default, null);
        for (const key of ["data1", "data2", "data3", "data4", "data5"]) {
          if (Array.isArray(shared?.[key]?.values))
            roomSettings[key].values = shared[key].values;
        }
      }
      roomSettings.version = 6;
      setStoredValue(getRoomId(), roomSettings);
    }, initializeSettings = () => {
      let localValue = getStoredValue(getRoomId(), null);
      localValue ? migrateRoomSettings(localValue) : (localValue = getStoredValue(getShortRoomId(), null)) && (setStoredValue(getRoomId(), localValue), deleteStoredValue(getShortRoomId()), migrateRoomSettings(localValue));
      globalSettings = readGlobalSettings();
      fillMessageGroups(roomSettings);
      restoreSettingsForm();
      rebuildMessagePool();
    }, mountFloatingControls = () => installFloatingUi({
      createPanel: createSettingsPanel,
      createStart: createStartButton,
      getStart: () => startButton,
      open: openSettings,
      close: closeSettings,
      initialize: initializeSettings,
      read: getStoredValue,
      write: setStoredValue,
      createLikes: () => likeController = createLikeController({
        getControls: () => ({
          master: autoLikeCheckbox,
          random: randomLikeCheckbox,
          fixed: fixedLikeCheckbox,
          interval: likeIntervalInput
        })
      })
    });
    let likeController;
    installPanelStyles();
    const startRuntime = () => {
      (() => {
        let localValue = document.getElementsByClassName("particitation-btn")[0];
        if (localValue) return void handleLotteryDialog(localValue);
        let localValue2 = document.getElementsByClassName("lottery-actions")[0];
        if (localValue2 && (localValue = localValue2.getElementsByClassName(
          "action-btn primary-btn"
        )[0]))
          handleLotteryDialog(localValue);
        else
          var timerId = timers.setTimeout(() => {
            timers.clearTimeout(timerId);
            (localValue = document.getElementsByClassName("particitation-btn")[0]) ? handleLotteryDialog(localValue) : (localValue2 = document.getElementsByClassName("lottery-actions")[0]) && (localValue = localValue2.getElementsByClassName(
              "action-btn primary-btn"
            )[0]) && handleLotteryDialog(localValue);
          }, 2e3);
      })();
      (() => {
        let timerId = timers.setTimeout(() => {
          timers.clearTimeout(timerId);
          let options = {
            childList: true
          };
          [
            "all__card-list-ctnr",
            "all__special-area-recommend-list-ctnr"
          ].forEach((value) => {
            let localValue = document.getElementsByClassName(value)[0];
            localValue && Array.prototype.forEach.call(localValue.children, (value2) => {
              /^index_/i.test(value2.className) && (showRecommendedRoomTitles(value2.children), new MutationObserver((value3) => {
                !value3 || 0 >= value3.length || Array.prototype.forEach.call(
                  value3,
                  (value4) => showRecommendedRoomTitles(value4.addedNodes)
                );
              }).observe(value2, options));
            });
          });
        }, 500);
      })();
      mountFloatingControls();
    };
    return {
      start: startRuntime
    };
  }

  // src/index.js
  function start() {
    if (window.top !== window.self || !/^\/\d+\/?$/.test(location.pathname))
      return;
    if (document.getElementById("rsh-floating-tools")) return;
    const storage = {
      read: (key, fallback) => GM_getValue(String(key), fallback),
      write: (key, value) => GM_setValue(String(key), value),
      remove: (key) => GM_deleteValue(String(key))
    };
    const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    createRuntime(storage, pageWindow).start();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
