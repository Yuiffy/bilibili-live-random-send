// Modified by Yuiffy on 2026-11-18. Apache-2.0.
export function installFloatingUi(api) {
  if (document.getElementById("rsh-floating-tools")) return;
  api.createPanel();
  api.createStart(null);
  const panel = document.getElementById("danmu-setting-panel");
  const start = api.getStart();
  const host = document.createElement("div");
  host.id = "rsh-floating-tools";
  host.style.cssText =
    "position:fixed!important;right:16px;top:42vh;z-index:2147483646!important;";
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
  start.type = "button";
  start.style.cssText = "";
  tools.appendChild(start);
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
    ["关闭", "✕ 关闭"],
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
      y: Math.max(4, Math.min(y, innerHeight - box.height - 4)),
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
        drag.top + event.clientY - drag.y,
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
