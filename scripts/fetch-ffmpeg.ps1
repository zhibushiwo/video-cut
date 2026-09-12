# 下载 FFmpeg release-essentials 并放置为 Tauri sidecar 命名（DESIGN §6.1）。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File scripts/fetch-ffmpeg.ps1
# 说明：gyan.dev 的历史版本包已下架，此处跟踪 release 链接；实际版本以脚本输出为准，
#       升级后运行 cargo check 确认 tauri-build 能复制 sidecar。
$ErrorActionPreference = "Stop"

$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "src-tauri/binaries"
$zip = Join-Path $env:TEMP "ffmpeg-release-essentials.zip"
$tmp = Join-Path $env:TEMP "ffmpeg-release-essentials"

New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "下载 $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$bin = Get-ChildItem -Path $tmp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $bin) { throw "压缩包内未找到 ffmpeg.exe" }
$binDir = $bin.DirectoryName

$triple = "x86_64-pc-windows-msvc"
Copy-Item (Join-Path $binDir "ffmpeg.exe")  (Join-Path $dest "ffmpeg-$triple.exe")  -Force
Copy-Item (Join-Path $binDir "ffprobe.exe") (Join-Path $dest "ffprobe-$triple.exe") -Force

& (Join-Path $dest "ffmpeg-$triple.exe") -version | Select-Object -First 1
Write-Host "完成：sidecar 已就绪 -> $dest"
