// Modified by Yuiffy on 2026-11-18. Apache-2.0.
import panelCss from "./panel.css";

export function installPanelStyles() {
  if (document.getElementById("rsh-panel-base-style")) return;
  const style = document.createElement("style");
  style.id = "rsh-panel-base-style";
  style.textContent = panelCss;
  document.head.appendChild(style);
}
