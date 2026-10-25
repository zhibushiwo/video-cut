param([string]$Mode)
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WinMsg3 {
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr SendMessageText(IntPtr h, uint msg, IntPtr w, string l);
    [DllImport("user32.dll", EntryPoint="SendMessageW")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll", EntryPoint="PostMessageW")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    public static List<IntPtr> Dialogs(uint targetPid) {
        var result = new List<IntPtr>();
        EnumWindows((h, lp) => {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (pid == targetPid && IsWindowVisible(h)) {
                var cls = new StringBuilder(256); GetClassName(h, cls, 256);
                if (cls.ToString() == "#32770") result.Add(h);
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
    public static IntPtr FirstEdit(IntPtr dialog) {
        IntPtr found = IntPtr.Zero;
        EnumChildWindows(dialog, (h, lp) => {
            if (found != IntPtr.Zero) return true;
            var cls = new StringBuilder(64); GetClassName(h, cls, 64);
            if (cls.ToString() == "Edit") { found = h; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@
# 多实例并存时优先取调试实例（target\debug 路径）；M27 起用户安装版可能同时在跑
$proc = Get-Process video-cut -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*target\debug*' } | Select-Object -First 1
if (-not $proc) { $proc = Get-Process video-cut -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $proc) { Write-Output "no-process"; exit 1 }
$dialogs = [WinMsg3]::Dialogs([uint32]$proc.Id)
switch ($Mode) {
  "count" { Write-Output ("count=" + $dialogs.Count) }
  "close-all" {
    foreach ($d in $dialogs) { [WinMsg3]::SendMessage($d, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
    Start-Sleep -Milliseconds 600
    Write-Output ("count=" + [WinMsg3]::Dialogs([uint32]$proc.Id).Count)
  }
  "fill" {
    if ($dialogs.Count -ne 1) { Write-Output ("dialog-count=" + $dialogs.Count); exit 1 }
    Write-Output "f1-dialogs-ok"
    $edit = [WinMsg3]::FirstEdit($dialogs[0])
    Write-Output "f2-edit-found"
    if ($edit -eq [IntPtr]::Zero) { Write-Output "edit-not-found"; exit 1 }
    Write-Output "f3-before-settext"
    [WinMsg3]::SendMessageText($edit, 0x000C, [IntPtr]::Zero, $env:DIALOG_PATH) | Out-Null
    Write-Output "f4-after-settext"
    Start-Sleep -Milliseconds 300
    Write-Output "f5-before-enter"
    [WinMsg3]::SendMessage($edit, 0x0100, [IntPtr]13, [IntPtr]::Zero) | Out-Null
    [WinMsg3]::SendMessage($edit, 0x0101, [IntPtr]13, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 500
    Write-Output "f6-after-enter"
    Write-Output "filled"
  }
}
