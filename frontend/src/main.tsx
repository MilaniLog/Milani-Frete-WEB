import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);

const noticeSelector =
  '.alert[role="alert"], .alert[role="status"], .success[role="status"]';
let centralNotice: HTMLElement | null = null;
let centralNoticeTimer = 0;

function mirrorNotice(element: Element) {
  const message = element.textContent?.trim();
  if (!message || element.getAttribute("data-central-notice-shown") === message)
    return;
  element.setAttribute("data-central-notice-shown", message);
  centralNotice?.remove();
  window.clearTimeout(centralNoticeTimer);
  const copy = document.createElement("p");
  copy.className = `central-notice-copy ${element.classList.contains("success") ? "success" : "alert"}`;
  copy.textContent = message;
  document.body.appendChild(copy);
  centralNotice = copy;
  centralNoticeTimer = window.setTimeout(() => {
    copy.remove();
    if (centralNotice === copy) centralNotice = null;
  }, 5000);
}

function inspectNotices(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return;
  if (element.matches(noticeSelector)) mirrorNotice(element);
  element.querySelectorAll(noticeSelector).forEach(mirrorNotice);
}

new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    inspectNotices(mutation.target);
    mutation.addedNodes.forEach(inspectNotices);
  });
}).observe(document.getElementById("root")!, {
  childList: true,
  subtree: true,
  characterData: true,
});
