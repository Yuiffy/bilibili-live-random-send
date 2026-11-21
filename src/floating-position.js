// Modified by Yuiffy on 2026-11-21. Apache-2.0.
export function installFloatingPosition(host, api) {
  const key = "__rsh_floating_position_v2";
  const defaultPosition = () => ({
    horizontal: "right",
    vertical: "bottom",
    x: 16,
    y: 24,
  });
  const valid = (value) =>
    value &&
    ["left", "right"].includes(value.horizontal) &&
    ["top", "bottom"].includes(value.vertical) &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    Number.isFinite(value.y) &&
    value.y >= 0;
  // Keep the preferred gaps intact when a smaller viewport temporarily clamps them.
  function clamp(value, available) {
    const margin = Math.min(4, Math.max(0, available / 2));
    return Math.max(margin, Math.min(value, available - margin));
  }
  function fromCoordinates(x, y) {
    const { width, height } = host.getBoundingClientRect();
    const availableX = Math.max(0, window.innerWidth - width);
    const availableY = Math.max(0, window.innerHeight - height);
    x = clamp(x, availableX);
    y = clamp(y, availableY);
    const horizontal = x <= availableX / 2 ? "left" : "right";
    const vertical = y <= availableY / 2 ? "top" : "bottom";
    return {
      horizontal,
      vertical,
      x: horizontal === "left" ? x : availableX - x,
      y: vertical === "top" ? y : availableY - y,
    };
  }
  let position = api.read(key, null);
  if (!valid(position)) {
    const legacy = api.read("__rsh_floating_position_v1", null);
    position =
      legacy && Number.isFinite(legacy.x) && Number.isFinite(legacy.y)
        ? fromCoordinates(legacy.x, legacy.y)
        : defaultPosition();
    api.write(key, position);
  }
  function render() {
    const { width, height } = host.getBoundingClientRect();
    const x = clamp(position.x, Math.max(0, window.innerWidth - width));
    const y = clamp(position.y, Math.max(0, window.innerHeight - height));
    for (const side of ["left", "right", "top", "bottom"])
      host.style[side] = "auto";
    host.style[position.horizontal] = x + "px";
    host.style[position.vertical] = y + "px";
  }
  render();
  const handle = host.shadowRoot.querySelector(".handle");
  let drag = null;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const box = host.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    position = fromCoordinates(
      drag.left + event.clientX - drag.x,
      drag.top + event.clientY - drag.y,
    );
    render();
  });
  function finish() {
    if (!drag) return;
    drag = null;
    api.write(key, position);
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    handle.addEventListener(type, finish);
  }
  handle.addEventListener("dblclick", () => {
    drag = null;
    position = defaultPosition();
    render();
    api.write(key, position);
  });
  window.addEventListener("resize", () => {
    finish();
    render();
  });
  // Font/layout changes can alter the toolbar size without a window resize.
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(render).observe(host);
}
