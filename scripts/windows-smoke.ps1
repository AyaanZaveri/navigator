param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$Output = "dist/windows-smoke.png",
  [switch]$LaunchApp
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NavigatorSmokeWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
}
'@
function Save-NavigatorScreenshot($app, $Output, [switch]$CheckBars) {
  $rect = New-Object NavigatorSmokeWindow+Rect
  if (-not [NavigatorSmokeWindow]::GetWindowRect($app.MainWindowHandle, [ref]$rect)) { throw 'No smoke window bounds' }
  $bitmap = New-Object Drawing.Bitmap ($rect.Right-$rect.Left), ($rect.Bottom-$rect.Top)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $absolute = [IO.Path]::GetFullPath($Output)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute))
    $bitmap.Save($absolute, [Drawing.Imaging.ImageFormat]::Png)
    # Sample well below the caption and above the HTML panel. A black/opaque
    # webview hiding the native video cannot produce these distinct bar values.
    $colors = New-Object 'Collections.Generic.HashSet[int]'
    $sampleY = [int]($bitmap.Height * 0.35)
    for ($x = 40; $x -lt ($bitmap.Width-40); $x += 20) { [void]$colors.Add($bitmap.GetPixel($x, $sampleY).ToArgb()) }
    if ($CheckBars -and $colors.Count -lt 4) { throw "Expected visible native color bars beneath WebView2; got $($colors.Count) colors. Inspect $absolute" }
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
$launchTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$arguments = @{ FilePath = (Resolve-Path $Executable); PassThru = $true }
if (-not $LaunchApp) { $arguments.ArgumentList = '--smoke-test' }
$app = Start-Process @arguments
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  $profile = if ($LaunchApp) { 'Navigator Desktop' } else { 'Navigator Desktop\smoke' }
  $log = Join-Path $env:LOCALAPPDATA "$profile\startup.jsonl"
  $played = $false; $ready = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    $app.Refresh()
    if ($app.HasExited) { throw "Native smoke exited early: $($app.ExitCode)" }
    if (Test-Path $log) {
      $events = @(Get-Content -LiteralPath $log | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} } | Where-Object { $_.pid -eq $app.Id -and $_.unix_ms -ge $launchTime })
      $played = $LaunchApp -or @($events | Where-Object stage -eq 'smoke-playing').Count -gt 0
      $ready = @($events | Where-Object stage -eq 'app-ready').Count -gt 0
      if ($played -and $ready -and $app.MainWindowHandle -ne 0) { break }

    }
    Start-Sleep -Milliseconds 200
  }
  if (-not ($played -and $ready)) {
    Save-NavigatorScreenshot $app $Output
    if (Test-Path $log) { Get-Content -LiteralPath $log }
    throw 'Native video or the WebView bridge never became ready'
  }
  [void][NavigatorSmokeWindow]::SetForegroundWindow($app.MainWindowHandle)
  Start-Sleep -Milliseconds 500
  $client = New-Object NavigatorSmokeWindow+Rect
  [void][NavigatorSmokeWindow]::GetClientRect($app.MainWindowHandle, [ref]$client)
  $scale = [NavigatorSmokeWindow]::GetDpiForWindow($app.MainWindowHandle) / 96.0
  $point = New-Object NavigatorSmokeWindow+Point
  $point.X = $client.Right - [int](69 * $scale); $point.Y = [int](16 * $scale)
  [void][NavigatorSmokeWindow]::ClientToScreen($app.MainWindowHandle, [ref]$point)
  $coordinates = (($point.Y -band 0xffff) -shl 16) -bor ($point.X -band 0xffff)
  $hit = [NavigatorSmokeWindow]::SendMessage($app.MainWindowHandle, 0x0084, [IntPtr]::Zero, [IntPtr]$coordinates).ToInt64()
  if ($hit -ne 9) { throw "Custom maximize control did not expose HTMAXBUTTON for Snap: $hit" }
  Save-NavigatorScreenshot $app $Output -CheckBars:(!$LaunchApp)
  if (-not $app.CloseMainWindow()) { throw 'Could not request normal shutdown' }
  if (-not $app.WaitForExit(15000)) { throw 'Native shutdown did not finish' }
  if ($app.ExitCode -ne 0) { throw "Native smoke exited $($app.ExitCode)" }
  if ($LaunchApp) { Write-Host "Packaged backend, hydrated app, custom frame, and shutdown passed. Screenshot: $Output" }
  else { Write-Host "Native video, transparent WebView, IPC, custom frame, and shutdown passed. Screenshot: $Output" }
} finally {
  $app.Refresh()
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
}
