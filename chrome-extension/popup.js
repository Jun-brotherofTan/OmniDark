const connection = document.querySelector("#connection");
const pageState = document.querySelector("#page-state");
const brightness = document.querySelector("#brightness");
const reason = document.querySelector("#reason");
const restore = document.querySelector("#restore");

function showDiagnostics(status) {
  if (!status?.injected) {
    pageState.textContent = "콘텐츠 스크립트 응답 없음";
    brightness.textContent = "밝은 배경 비율: 확인할 수 없음";
    reason.textContent = "이 페이지를 새로고침하세요. chrome:// 페이지 등에서는 확장이 동작하지 않습니다.";
    return;
  }

  pageState.textContent = status.applied ? "이 페이지에 다크 색상 적용 중" : "이 페이지에는 변경 사항 없음";
  const percent = status.brightBackgroundPercent;
  const ratio = percent === null ? "측정 불가" : `${percent.toFixed(1)}%`;
  brightness.textContent = `밝은 배경 비율: ${ratio} (${status.analyzedSamples}/${status.totalSamples} 표본, 임계값 ${status.threshold ?? "미수신"}%)`;
  reason.textContent = status.reasonMessage || `미적용 이유: ${status.reason || "진단 정보 없음"}`;
}

chrome.runtime.sendMessage({ type: "get-status" }, response => {
  if (chrome.runtime.lastError) {
    connection.textContent = "Windows 앱 연결을 사용할 수 없습니다";
    return;
  }
  if (!response?.connected) connection.textContent = "Windows 앱 연결 대기 중";
  else if (!response.settings) connection.textContent = "Windows 앱 연결됨 (설정 수신 대기 중)";
  else connection.textContent = "Windows 앱 연결됨";

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id === undefined) {
      showDiagnostics(null);
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "get-page-status" }, status => {
      if (chrome.runtime.lastError) {
        showDiagnostics(null);
        return;
      }
      showDiagnostics(status);
    });
  });
});

restore.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "restore-current" }, status => {
    if (chrome.runtime.lastError || !status) {
      reason.textContent = "복원 요청 실패: 페이지를 새로고침한 뒤 다시 시도하세요.";
      return;
    }
    showDiagnostics(status);
  });
});
