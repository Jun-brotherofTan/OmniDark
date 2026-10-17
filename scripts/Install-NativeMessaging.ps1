param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [Parameter(Mandatory = $true)]
    [string]$ApplicationPath,

    [switch]$MicrosoftEdge
)

$ErrorActionPreference = 'Stop'
$resolvedApplicationPath = (Resolve-Path -LiteralPath $ApplicationPath).Path
$dataDirectory = Join-Path $env:LOCALAPPDATA 'OmniDark'
$manifestPath = Join-Path $dataDirectory 'com.omnidark.bridge.json'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

$manifest = @{
    name = 'com.omnidark.bridge'
    description = 'OmniDark local settings and page status bridge'
    path = $resolvedApplicationPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))
$browserKeys = @('HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.omnidark.bridge')
if ($MicrosoftEdge) {
    $browserKeys += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.omnidark.bridge'
}
foreach ($key in $browserKeys) {
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value $manifestPath
}

Write-Host "OmniDark Native Messaging host 등록 완료: $manifestPath"
Write-Host 'Chrome에서 unpacked 확장을 로드한 뒤 표시된 확장 ID를 사용했는지 확인하세요.'