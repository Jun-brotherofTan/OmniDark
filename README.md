# OmniDark

Windows 10/11용 사용자 권한 트레이 유틸리티입니다. Windows API만으로 임의의 앱 창을 안전하게 다시 칠할 수는 없으므로, 일반 앱은 창을 감지하는 데 그치고 DOM을 판독할 수 있는 Chrome 웹페이지에 한해 선택적 어두운 색상 스타일을 적용합니다. 화면 캡처, 전역 색상 반전, 프로세스 주입, 문서 변경은 사용하지 않습니다.

## 아키텍처와 실현 가능성

- `OmniDark.Core`: 설정 저장, 표본 밝기 계산, 역할별 색상 매핑. OS 비의존 .NET 코드입니다.
- `OmniDark.App`: WinForms 시스템 트레이, `SetWinEventHook` 창 감지, 사용자 설정, Chrome Native Messaging 호스트입니다. `LocalAppData/OmniDark` 아래에서 설정과 확장 상태를 로컬로만 교환합니다.
- `chrome-extension`: Manifest V3 콘텐츠 스크립트가 현재 표시 영역의 DOM 배경색을 표본 분석하고, 밝은 페이지의 배경/어두운 텍스트 색상만 바꿉니다. `img`, `video`, `canvas`, `svg`, iframe, 이미지 배경은 대상에서 제외합니다.
- `tests/OmniDark.Core.Tests`: 외부 테스트 패키지 없이 실행하는 코어 회귀 검사입니다.

| 앱 | 상태 | 동작과 한계 |
| --- | --- | --- |
| Google Chrome 웹페이지 | 부분 지원 | 확장이 가시 영역의 DOM 배경을 표본 검사해 임계값 초과 시 색상 속성을 조정합니다. 이미지·영상·SVG·캔버스·iframe·CSS 배경 이미지는 제외합니다. 레이아웃/시각 효과에 따라 일부 웹사이트의 색상이 완벽하지 않을 수 있습니다. |
| Chrome PDF 뷰어 | 미지원 | `chrome://` 내부 PDF 렌더러에 일반 웹 확장을 주입할 수 없고, 이미지와 텍스트를 안정적으로 분리하는 범용 API도 없습니다. |
| Microsoft Word | 창 감지만 지원 | Office의 어두운 테마와 문서 페이지 색 전환은 Word에서 사용자가 직접 선택할 수 있습니다. OmniDark는 문서나 Office 설정을 바꾸지 않습니다. |
| PDF 리더 (Acrobat, SumatraPDF, Foxit) | 창 감지만 지원 | PDF 뷰어별 렌더링/접근성 인터페이스가 달라 범용 자동 변환을 하지 않습니다. 원본 파일은 읽거나 수정하지 않습니다. |
| Windows 파일 탐색기 | 창 감지만 지원 | Windows의 탐색기 다크 테마는 사용자/시스템 테마 설정에 연동됩니다. 전역 테마나 레지스트리를 자동으로 변경하지 않습니다. |
| Microsoft Edge | 창 감지만 지원 | 이 배포본의 콘텐츠 어댑터는 Chrome Native Messaging 호스트에 등록됩니다. Edge용 확장은 별도 등록/검증하지 않았습니다. |

밝기 비율을 화면 캡처에서 계산하는 방식은 의도적으로 사용하지 않습니다. Chrome은 `elementFromPoint`와 computed style로 현재 뷰포트의 24×16 표본을 계산하고 식별 가능한 미디어 위 표본을 제외합니다. 코어의 픽셀 분석 API는 마스크가 주어진 입력을 처리하며, 일반 Windows 앱에 이미지 분할을 제공한다고 주장하지 않습니다.

## 빌드 및 설치

필요 조건: Windows 10/11 x64, .NET 10 SDK. 일반 실행에는 관리자 권한이 필요하지 않습니다. Linux 개발 환경에서도 Windows 타깃 교차 게시가 가능합니다.

```powershell
dotnet publish src/OmniDark.App/OmniDark.App.csproj -c Release
```

게시된 단일 실행 파일은 `src/OmniDark.App/bin/Release/net10.0-windows/win-x64/publish/OmniDark.exe`에 생성됩니다. 앱을 실행하면 트레이에 방패 아이콘이 나타납니다. 저장소에서 직접 실행하려면 `dotnet run --project src/OmniDark.App/OmniDark.App.csproj`를 사용합니다.

Chrome 확장 설치:

1. Chrome에서 `chrome://extensions`를 열고 개발자 모드를 켠 후 `압축해제된 확장 프로그램을 로드합니다`를 선택해 `chrome-extension` 폴더를 지정합니다.
2. 확장 상세 화면에서 표시된 확장 ID를 복사합니다.
3. 게시된 OmniDark 앱을 실행한 뒤 PowerShell에서 저장소의 설치 스크립트를 실행합니다.

```powershell
.\scripts\Install-NativeMessaging.ps1 `
  -ExtensionId '확장_ID_32자' `
  -ApplicationPath 'C:\경로\OmniDark.exe'
```

이 스크립트는 명시적으로 실행할 때만 현재 사용자(`HKCU`)의 Chrome Native Messaging 등록을 추가합니다. 확장 ID는 Chrome에서 발급된 32자리 소문자 `a`~`p`여야 합니다. 설치 후 Chrome을 다시 시작하면 설정 화면의 확장 연결 상태가 갱신됩니다. 제거할 때는 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.omnidark.bridge` 키와 `%LOCALAPPDATA%\OmniDark`를 사용자가 직접 삭제할 수 있습니다.

압축해제 확장은 전체 HTTP/HTTPS 사이트에서 동작하기 위해 호스트 권한을 요청합니다. 분석은 브라우저와 PC 안에서만 이루어지며, 화면 캡처나 페이지 본문을 외부로 전송하지 않습니다. 현재 적용 상태를 트레이에 표시하기 위해 페이지 제목과 다크 적용 여부가 로컬 상태 파일에 기록됩니다.

## 사용 및 설정

트레이 메뉴에서 OmniDark 사용 여부, 설정, 원래 모양 복원, 종료를 선택합니다. 설정 창에서 자동 감지, 감지 대상 앱, 흰색 배경 비율 임계값(기본 60%), 흰색 최소 RGB(235), 검정 최대 RGB(40), 복원 옵션을 조정합니다. 설정은 `%LOCALAPPDATA%\OmniDark\settings.json`에 저장됩니다.

Chrome 확장은 브라우저 메시지를 통해 설정을 읽습니다. 앱 설정 변경은 최대 약 30초 내 웹페이지에 반영됩니다. 확장 팝업에서 현재 페이지 상태를 확인하고 해당 페이지만 즉시 복원할 수 있습니다. 트레이의 전체 복원 요청도 확장의 Native Messaging 동기화 시 전달됩니다.

## 테스트

```powershell
dotnet run --project tests/OmniDark.Core.Tests/OmniDark.Core.Tests.csproj
dotnet build src/OmniDark.App/OmniDark.App.csproj
node --check chrome-extension/content.js
node --check chrome-extension/service-worker.js
node --check chrome-extension/popup.js
```

코어 검사에는 기본 설정, 마스크 처리된 이미지 표본 제외, 임계값 판정, 역할별 색상 변환, 설정 저장/불러오기가 포함됩니다. 브라우저에서 실제 이미지 보존과 레이아웃 호환성을 확인하려면 확장을 로드한 뒤 사진/영상이 있는 밝은 페이지와 어두운 페이지, 동적 콘텐츠를 열어 원본 미디어 색상 및 복원 동작을 확인해야 합니다. 현재 Linux 환경에서는 Chrome GUI와 Windows 트레이 동작을 자동화 검증할 수 없습니다.

## 알려진 제한 및 문제 해결

- 모든 프로세스 창의 밝기를 계산하거나 어둡게 하지는 않습니다. 창 감지 목록은 자동 테마 적용 목록이 아닙니다.
- Chrome은 뷰포트 안의 DOM 색상만 처리합니다. CSS 필터, 복잡한 합성, 캔버스 기반 사이트, 웹앱 자체 테마와 충돌할 수 있습니다.
- 지원하지 않는 페이지나 민감한 내부 페이지(`chrome://`, Chrome PDF 뷰어 등)는 변경하지 않습니다.
- Native Messaging 연결이 안 되면 확장 ID와 설치 스크립트 실행 경로를 확인하고, Chrome 및 OmniDark를 다시 시작합니다.
- 게시 실행 파일은 Windows x64용입니다. 이 Linux 컨테이너에서 컴파일 결과를 만들 수 있지만 Windows UI/Chrome 동작 자체는 Windows에서 확인해야 합니다.
