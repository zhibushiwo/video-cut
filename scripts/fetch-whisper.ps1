# 下载 whisper.cpp v1.8.4 CPU sidecar + 内置模型（tiny q5_1 / silero VAD），并放置为
# Tauri externalBin / resources（DESIGN §3.9，ADR-039）。全部文件做 SHA256 校验。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1
# 升级版本：改 $tag 与 $assets 各项 sha256（从官方 release 页 / 模型文件页重新取值）；
#           注意 v1.9.x 的 release 资产曾为空（ADR-039③），升级前先确认资产齐全。
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$tag = "v1.8.4"
$triple = "x86_64-pc-windows-msvc"
$root = Split-Path -Parent $PSScriptRoot
$binDest = Join-Path $root "src-tauri/binaries"
$dllDest = Join-Path $binDest "whisper-dll"
$modelDest = Join-Path $root "src-tauri/resources/models"
$tmp = Join-Path $env:TEMP "whisper-spike-fetch"

# SHA256 校验表：zip 来自 GitHub Releases（ggml-org 官方）；模型来自 HuggingFace LFS
# （文件不可变）。模型下载优先 hf-mirror.com（国内直连 HF 不通，ADR-040），失败回退官方源。
$assets = @(
  @{
    Name   = "whisper-bin-x64.zip"
    Urls   = @("https://github.com/ggml-org/whisper.cpp/releases/download/$tag/whisper-bin-x64.zip")
    Sha256 = "74f973345cb52ef5ba3ec9e7e7af8e48cc8c71722d1528603b80588a11f82e3e"
  },
  @{
    Name   = "ggml-tiny-q5_1.bin"
    Urls   = @(
      "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin"
    )
    Sha256 = "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"
  },
  @{
    Name   = "ggml-silero-v5.1.2.bin"
    Urls   = @(
      "https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
      "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin"
    )
    Sha256 = "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf"
  }
)

function Get-Asset([string]$name, [string[]]$urls, [string]$sha256, [string]$outPath) {
  if ((Test-Path $outPath) -and (Get-FileHash $outPath -Algorithm SHA256).Hash -ieq $sha256) {
    Write-Host "跳过（已就绪且校验通过）: $name"
    return
  }
  $lastErr = $null
  foreach ($url in $urls) {
    try {
      Write-Host "下载 $name <- $url ..."
      # curl.exe（Win10 1803+ 自带）：跟随 308 重定向（hf-mirror 需要，PS5.1 的
      # Invoke-WebRequest 不跟）、断点续传 + 失速重连（ADR-040）
      & curl.exe -L --fail --silent --show-error --connect-timeout 15 `
        --speed-time 30 --speed-limit 10240 --retry 8 --retry-delay 2 --retry-all-errors `
        -C - -o $outPath $url
      if ($LASTEXITCODE -eq 0) { break }
      throw "curl 退出码 $LASTEXITCODE"
    } catch {
      $lastErr = $_
      Write-Host "  失败：$($_.Exception.Message)"
      if (Test-Path $outPath) { Remove-Item -Force $outPath }
    }
  }
  if (-not (Test-Path $outPath)) { throw "$name 下载失败：$lastErr" }
  $actual = (Get-FileHash $outPath -Algorithm SHA256).Hash
  if ($actual -ine $sha256) {
    Remove-Item -Force $outPath
    throw "$name SHA256 不符（期望 $sha256，实际 $actual），已删除损坏文件"
  }
  Write-Host "  SHA256 校验通过"
}

New-Item -ItemType Directory -Force -Path $binDest, $dllDest, $modelDest, $tmp | Out-Null

$zipPath = Join-Path $tmp "whisper-bin-x64.zip"
Get-Asset $assets[0].Name $assets[0].Urls $assets[0].Sha256 $zipPath
Get-Asset $assets[1].Name $assets[1].Urls $assets[1].Sha256 (Join-Path $modelDest "ggml-tiny-q5_1.bin")
Get-Asset $assets[2].Name $assets[2].Urls $assets[2].Sha256 (Join-Path $modelDest "ggml-silero-v5.1.2.bin")

# 解压：whisper-cli.exe → sidecar 命名；全部 DLL → whisper-dll/（经 tauri resources
# 铺到运行目录，whisper-cli 硬依赖 whisper.dll/ggml*.dll，见 ADR-039）
$extract = Join-Path $tmp "extract"
if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
Expand-Archive -Path $zipPath -DestinationPath $extract -Force
$cli = Get-ChildItem -Path $extract -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
if (-not $cli) { throw "压缩包内未找到 whisper-cli.exe" }
Copy-Item $cli.FullName (Join-Path $binDest "whisper-cli-$triple.exe") -Force
Get-ChildItem -Path $cli.DirectoryName -Filter "*.dll" | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $dllDest $_.Name) -Force
}

# 冒烟：在解压目录跑 -h（该目录 exe 与 DLL 相邻），验证引擎自身可用。
# whisper-cli 把 usage 打到 stderr，PS5.1 的 EAP=Stop 会把重定向的 stderr 当错误——
# 借道 cmd 重定向，只看退出码。
Push-Location $cli.DirectoryName
try {
  cmd /c ".\whisper-cli.exe -h >NUL 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "whisper-cli -h 退出码 $LASTEXITCODE" }
  Write-Host "冒烟通过：whisper-cli -h 正常"
} finally {
  Pop-Location
}
Write-Host "完成：whisper-cli sidecar + DLL + 内置模型已就绪 -> $binDest / $modelDest"
