import { el } from "./dom.js";

export function skeletonHtml(lines = 3) {
  const rows = Array.from({ length: lines }, () => '<div class="skeleton-line"></div>').join("");
  return `<div class="panel-loading skeleton-block" aria-busy="true">${rows}</div>`;
}

export function setPanelLoading(containerId, message = "加载中…") {
  const node = el(containerId);
  if (!node) return;
  node.innerHTML = skeletonHtml(4) + `<p class="panel-loading-msg">${message}</p>`;
}
