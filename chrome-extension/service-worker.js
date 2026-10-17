const hostName = "com.omnidark.bridge";
let port = null;
let reconnectTimer = null;
let settings = null;
const pages = new Map();

function connectHost() {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(hostName);
    console.info("[OmniDark] Native Messaging 호스트에 연결했습니다.");
    port.onMessage.addListener(handleHostMessage);
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      port = null;
      console.warn("[OmniDark] Native Messaging 연결 종료:", error || "호스트가 연결을 닫았습니다.");
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectHost, 10000);
    });
    port.postMessage({ type: "hello" });
  } catch (error) {
    port = null;
    console.error("[OmniDark] Native Messaging 연결 실패:", error);
  }
}

function handleHostMessage(message) {
  settings = message.settings || message.Settings || null;
  if (settings) console.info("[OmniDark] Windows 앱 설정을 받았습니다.", settings);
  else console.warn("[OmniDark] Native Messaging 응답에 설정이 없습니다.", message);
  if (message.restoreAll || message.RestoreAll) {
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          chrome.tabs.sendMessage(tab.id, { type: "restore" }).catch(error => {
            console.warn(`[OmniDark] 탭 ${tab.id} 전체 복원 실패:`, error);
          });
        }
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
      if (tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: "configure", settings }).catch(error => {
          console.warn(`[OmniDark] 탭 ${tab.id}에 설정 전달 실패 (페이지를 새로고침해야 할 수 있음):`, error);
        });
      }
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
      diagnostics: message.diagnostics || null,
      windowId: tab.windowId
    });
    publishStatus();
  } else if (message.type === "restore-current" && sender.tab?.id !== undefined) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "restore" }, response => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response);
    });
    return true;
  } else if (message.type === "get-status") {
    sendResponse({ connected: Boolean(port), settings: settings || null });
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