# 生成测试视频夹具（PLAN M1-1）。用内置 sidecar ffmpeg 生成，不依赖网络。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/gen-fixtures.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$ffmpeg = Get-ChildItem (Join-Path $root "src-tauri/binaries") -Filter "ffmpeg-*.exe" | Select-Object -First 1
if (-not $ffmpeg) { throw "未找到 ffmpeg sidecar，请先运行 scripts/fetch-ffmpeg.ps1" }
$ffmpeg = $ffmpeg.FullName

$dest = Join-Path $PSScriptRoot "fixtures"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 各夹具覆盖 DESIGN §10 的格式矩阵分支
$fixtures = @(
    @{ name = "h264_aac_1080p.mp4";  args = @("-f","lavfi","-i","testsrc=duration=6:size=1280x720:rate=30","-f","lavfi","-i","sine=frequency=440:duration=6","-c:v","libx264","-preset","veryfast","-crf","28","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k") },  # 原生可预览（主用）
    @{ name = "hevc_mp4.mp4";        args = @("-f","lavfi","-i","testsrc=duration=5:size=640x360:rate=30","-c:v","libx265","-preset","veryfast","-pix_fmt","yuv420p","-an") },                                                        # HEVC：无系统扩展时代理
    @{ name = "legacy_avi_mpeg4.avi"; args = @("-f","lavfi","-i","testsrc=duration=5:size=640x360:rate=30","-f","lavfi","-i","sine=frequency=440:duration=5","-c:v","mpeg4","-q:v","5","-c:a","libmp3lame") },                        # AVI 容器：必代理
    @{ name = "tenbit_h264.mp4";     args = @("-f","lavfi","-i","testsrc=duration=5:size=640x360:rate=30","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p10le","-an") }                                                    # 10bit：代理
)

foreach ($f in $fixtures) {
    $out = Join-Path $dest $f.name
    Write-Host "生成 $($f.name) ..."
    & $ffmpeg -hide_banner -loglevel error -y @($f.args + $out)
}

Write-Host "完成：夹具位于 $dest"
