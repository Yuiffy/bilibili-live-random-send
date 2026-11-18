// Modified by Yuiffy on 2026-11-18. Apache-2.0.
export function createLikeController(api) {
  const panel = document.getElementById("danmu-setting-panel");
  const row = document.createElement("div");
  row.id = "rsh-like-diagnostics";
  row.style.cssText =
    "margin:8px 10px;padding:8px;background:#fff;border-radius:6px;font-size:12px;color:#095ca2;";
  const status = document.createElement("div");
  status.id = "rsh-like-status";
  status.setAttribute("role", "status");
  const test = document.createElement("button");
  test.type = "button";
  test.textContent = "测试点赞一次";
  test.style.cssText =
    "margin-top:6px;padding:4px 8px;border:1px solid #9bc5e5;border-radius:4px;background:#eef7ff;color:#095ca2;cursor:pointer;";
  test.addEventListener("click", () => clickOnce());
  row.append(status, test);
  panel.querySelector("#autoLikeCheckboxDiv").after(row);
  const randomLabel = panel.querySelector(
    "#clickLikeRandomCheckboxDiv .danmu-random-switch-button-title",
  );
  randomLabel.textContent = "随机间隔点赞（3～15 秒）";
  randomLabel.title =
    "每次等待随机的 3～15 秒后点击一次；找不到按钮时等待下一轮。";

  let timer = null,
    ticker = null,
    generation = 0,
    nextAt = 0,
    count = 0,
    lastAt = null;
  let mode = "",
    lastResult = "";
  function render() {
    const prefix =
      mode === "random"
        ? "随机点赞"
        : mode === "fixed"
          ? "定时点赞"
          : "自动点赞已关闭";
    const countdown =
      mode && nextAt
        ? " · 下次约 " +
          Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)) +
          " 秒"
        : "";
    status.textContent =
      prefix +
      countdown +
      " · 本页已触发点击 " +
      count +
      " 次" +
      (lastResult ? " · " + lastResult : "");
  }
  function usable(element) {
    if (
      !element ||
      !element.isConnected ||
      element.closest(
        "#danmu-setting-panel,#rsh-floating-tools,.bili-dyn-action,.room-feed",
      )
    )
      return false;
    if (
      element.closest('[hidden],[inert],[aria-disabled="true"]') ||
      element.matches(":disabled")
    )
      return false;
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      css.display !== "none" &&
      css.visibility !== "hidden" &&
      css.pointerEvents !== "none"
    );
  }
  function findButton() {
    // Bilibili's own reporting attributes survive class-name/layout changes.
    const selectors = [
      '[data-event-name="dianzan.0.show"]',
      '[data-type="dianzan.0.show"]',
      ".like-btn",
      'button[aria-label="点赞"]',
      '[role="button"][aria-label="点赞"]',
      '[title="点赞"]',
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].find(usable);
      if (found) return found;
    }
    // Restrict text matching to live-chat controls, avoiding dynamic-feed likes.
    for (const scope of document.querySelectorAll(
      '#chat-control-panel-vm,#aside-area-vm,[class*="chat-control"],[class*="chat-input"]',
    )) {
      for (const label of scope.querySelectorAll(
        'button,[role="button"],span,div',
      )) {
        if (label.children.length || label.textContent.trim() !== "点赞")
          continue;
        const target =
          label.closest('button,[role="button"],[data-event-name]') ||
          label.parentElement;
        if (
          target &&
          target !== scope &&
          target.textContent.trim().length < 40 &&
          usable(target)
        )
          return target;
      }
    }
    return null;
  }
  function clickOnce() {
    if (lastAt !== null && Date.now() - lastAt < 1000) return false;
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
    const seconds =
      mode === "random"
        ? 3 + Math.floor(Math.random() * 13)
        : Math.max(3, Number(controls.interval.value) || 6);
    const delay = Math.min(2147483647, seconds * 1000);
    nextAt = Date.now() + delay;
    const token = generation;
    timer = window.setTimeout(() => {
      timer = null;
      if (token !== generation || !mode) return;
      const current = api.getControls();
      if (
        !current.master.checked ||
        !(mode === "random" ? current.random.checked : current.fixed.checked)
      ) {
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
      "clickLikeRandomCheckboxDiv",
    ]) {
      const group = panel.querySelector("#" + id);
      group.style.display = controls.master.checked ? "" : "none";
      group.classList.remove("disabled");
    }
    controls.random.disabled = controls.fixed.disabled = false;
    controls.interval.disabled =
      controls.master.checked && controls.fixed.checked;
    mode = controls.master.checked
      ? controls.random.checked
        ? "random"
        : controls.fixed.checked
          ? "fixed"
          : ""
      : "";
    lastResult = controls.master.checked && !mode ? "请选择随机或定时点赞" : "";
    if (mode) {
      schedule();
      ticker = window.setInterval(render, 1000);
    } else render();
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) sync();
  });
  render();
  return { sync, click: clickOnce };
}
