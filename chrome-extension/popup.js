const connection = document.querySelector("#connection");
const pageState = document.querySelector("#page-state");
const restore = document.querySelector("#restore");

chrome.runtime.sendMessage({ type: "get-status" }, response => {
  if (chrome.runtime.lastError) {
    connection.textContent = "Windows 앱 연결을 사용할 수 없습니다";
    return;
  }
  connection.textContent = response?.connected ? "Windows 앱 연결됨" : "Windows 앱 연결 대기 중";
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id === undefined) return;
    chrome.tabs.sendMessage(tab.id, { type: "get-page-status" }, status => {
      if (chrome.runtime.lastError) return;
      pageState.textContent = status?.dark ? "이 페이지에 다크 색상 적용 중" : "이 페이지에는 변경 사항 없음";
    });
  });
});

restore.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "restore-current" });
  pageState.textContent = "원래 모양으로 복원했습니다";
});