const hostName = "com.omnidark.bridge";
let port = null;
let reconnectTimer = null;
let settings = null;
const pages = new Map();

function connectHost() {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(hostName);
    port.onMessage.addListener(handleHostMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectHost, 10000);
    });
    port.postMessage({ type: "hello" });
  } catch {
    port = null;
  }
}

function handleHostMessage(message) {
  settings = message.settings || message.Settings || null;
  if (message.restoreAll || message.RestoreAll) {
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) {
        if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { type: "restore" }).catch(() => {});
      }
    });
  }
  applyToTabs();
  chrome.runtime.sendMessage({ type: "settings-updated", settings }).catch(() => {});
}

function applyToTabs() {
  if (!settings) return;
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, tabs => {
    for (const tab of tabs) {
      if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { type: "configure", settings }).catch(() => {});
    }
  });
}

function publishStatus() {
  if (!port) {
    connectHost();
    return;
  }
  port.postMessage({ type: "status", pages: [...pages.values()].slice(-100) });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "page-status" && sender.tab?.id !== undefined) {
    const tab = sender.tab;
    pages.set(`${tab.windowId}:${tab.id}`, {
      title: message.title || tab.title || "Chrome 페이지",
      dark: Boolean(message.dark),
      windowId: tab.windowId
    });
    publishStatus();
  } else if (message.type === "restore-current" && sender.tab?.id !== undefined) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "restore" }).catch(() => {});
  } else if (message.type === "get-status") {
    sendResponse({ connected: Boolean(port), settings });
  }
  return message.type === "get-status";
});

chrome.tabs.onRemoved.addListener(tabId => {
  for (const key of pages.keys()) {
    if (key.endsWith(`:${tabId}`)) pages.delete(key);
  }
  publishStatus();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  pages.delete(`${tab.windowId}:${tabId}`);
  publishStatus();
});

chrome.alarms.create("omnidark-sync", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "omnidark-sync") {
    if (!port) connectHost();
    else publishStatus();
  }
});

connectHost();