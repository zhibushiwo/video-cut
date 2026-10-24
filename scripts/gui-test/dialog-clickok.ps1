Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WinOk {
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("user32.dll", EntryPoint="PostMessageW")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll", EntryPoint="SendMessageW")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
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
    public static IntPtr DefButton(IntPtr dialog) {
        IntPtr found = IntPtr.Zero;
        EnumChildWindows(dialog, (h, lp) => {
            if (found != IntPtr.Zero) return true;
            var cls = new StringBuilder(64); GetClassName(h, cls, 64);
            int style = GetWindowLong(h, -16);
            if (cls.ToString() == "Button" && (style & 1) != 0 && IsWindowVisible(h)) { found = h; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@
$proc = Get-Process video-cut -ErrorAction SilentlyContinue | Select-Object -First 1
$dialogs = [WinOk]::Dialogs([uint32]$proc.Id)
if ($dialogs.Count -eq 0) { Write-Output "no-dialog"; exit 1 }
$btn = [WinOk]::DefButton($dialogs[0])
if ($btn -eq [IntPtr]::Zero) { Write-Output "no-def-button"; exit 1 }
[WinOk]::PostMessage($btn, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 600
Write-Output "ok-clicked"
