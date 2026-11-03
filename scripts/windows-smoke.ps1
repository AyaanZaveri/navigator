param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$Output = "dist/windows-smoke.png",
  [switch]$LaunchApp,
  [ValidateRange(0,15)][int]$StartupDelaySeconds = 0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NavigatorSmokeWindow {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("dwmapi.dll")] public static extern int DwmFlush();
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  public static IntPtr FindClassWindow(IntPtr after,string className) { return FindWindowEx(IntPtr.Zero,after,className,null); }
  [DllImport("user32.dll", EntryPoint="GetWindowThreadProcessId")] public static extern uint WindowProcess(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr h,int index,System.Text.StringBuilder name,uint size,out uint needed);
  public static bool InputDesktopActive() { var h=OpenInputDesktop(0,false,1); if(h==IntPtr.Zero)return false;try{var s=new System.Text.StringBuilder(256);uint n;return GetUserObjectInformation(h,2,s,512,out n)&&s.ToString().Equals("Default",StringComparison.OrdinalIgnoreCase);}finally{CloseDesktop(h);} }
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int count);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
}
'@
# GetWindowRect is virtualized for a DPI-unaware PowerShell process, while
# CopyFromScreen needs physical pixels. Match Navigator's per-monitor context.
[void][NavigatorSmokeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
function Get-NavigatorHandle($app) {
  foreach($class in @('NavigatorDesktop','NavigatorDesktopSmoke')) {
    $handle=[IntPtr]::Zero
    while($true) {
      $handle=[NavigatorSmokeWindow]::FindClassWindow($handle,$class)
      if($handle -eq [IntPtr]::Zero){break}
      [uint32]$owner=0;[void][NavigatorSmokeWindow]::WindowProcess($handle,[ref]$owner)
      if($owner -eq $app.Id -and [NavigatorSmokeWindow]::IsWindowVisible($handle)){return $handle}
    }
  }
  return [IntPtr]::Zero
}
function Close-Navigator($app) {
  if(!$app -or $app.HasExited){return}
  $handle=Get-NavigatorHandle $app
  if($handle -eq [IntPtr]::Zero){throw "No owned Navigator window for shutdown"}
  [void][NavigatorSmokeWindow]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)
  if(!$app.WaitForExit(15000)){throw "Navigator did not complete normal shutdown"}
}
function Focus-Navigator($handle) {
  if(![NavigatorSmokeWindow]::InputDesktopActive()){throw 'Unlock the interactive Windows desktop before measuring'}
  [void][NavigatorSmokeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
  # The fixture has no action at its center. A verified physical click gives
  # foreground permission without guessing a helper HWND or clicking another app.
  [void][NavigatorSmokeWindow]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,0x13)
  try {
    [void][NavigatorSmokeWindow]::DwmFlush();Start-Sleep -Milliseconds 100
    $rect=New-Object NavigatorSmokeWindow+Rect
    [void][NavigatorSmokeWindow]::GetWindowRect($handle,[ref]$rect)
    $point=New-Object NavigatorSmokeWindow+Point
    $point.X=[int](($rect.Left+$rect.Right)/2);$point.Y=[int](($rect.Top+$rect.Bottom)/2)
    if([NavigatorSmokeWindow]::GetAncestor([NavigatorSmokeWindow]::WindowFromPoint($point),2) -ne $handle){throw 'Owned fixture is occluded; refusing to click'}
    [void][NavigatorSmokeWindow]::SetCursorPos($point.X,$point.Y)
    [NavigatorSmokeWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 80
    [NavigatorSmokeWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  }finally{[void][NavigatorSmokeWindow]::SetWindowPos($handle,[IntPtr](-2),0,0,0,0,0x13)}
  for($attempt=0;$attempt -lt 8;$attempt++) {
    $other=[NavigatorSmokeWindow]::GetWindowThreadProcessId([NavigatorSmokeWindow]::GetForegroundWindow(),[IntPtr]::Zero)
    $own=[NavigatorSmokeWindow]::GetCurrentThreadId();$attached=$false
    try {
      if($other -ne 0 -and $other -ne $own){$attached=[NavigatorSmokeWindow]::AttachThreadInput($own,$other,$true)}
      [void][NavigatorSmokeWindow]::SetForegroundWindow($handle)
    }finally{if($attached){[void][NavigatorSmokeWindow]::AttachThreadInput($own,$other,$false)}}
    if([NavigatorSmokeWindow]::GetForegroundWindow() -eq $handle){return}
    Start-Sleep -Milliseconds 100
  }
  $actual=[NavigatorSmokeWindow]::GetForegroundWindow()
  $expectedClass=New-Object Text.StringBuilder 256;$actualClass=New-Object Text.StringBuilder 256
  [void][NavigatorSmokeWindow]::GetClassName($handle,$expectedClass,256);[void][NavigatorSmokeWindow]::GetClassName($actual,$actualClass,256)
  throw "Navigator must be in the foreground: target=$handle ($expectedClass); actual=$actual ($actualClass)"
}
function Save-NavigatorScreenshot($app, $Output, [switch]$CheckBars, [switch]$CheckStartup) {
  if(![NavigatorSmokeWindow]::InputDesktopActive()){throw 'Locked desktop cannot validate pixels'}
  $handle=Get-NavigatorHandle $app
  if($handle -eq [IntPtr]::Zero){throw 'No owned Navigator window'}
  [void][NavigatorSmokeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
  # SetForegroundWindow may be denied while the user interacts with another
  # app. Temporarily expose our test window without taking keyboard focus.
  [void][NavigatorSmokeWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x13)
  [void][NavigatorSmokeWindow]::DwmFlush()
  Start-Sleep -Milliseconds 150
  $rect = New-Object NavigatorSmokeWindow+Rect
  if (-not [NavigatorSmokeWindow]::GetWindowRect($handle, [ref]$rect)) { throw 'No smoke window bounds' }
  $center = New-Object NavigatorSmokeWindow+Point
  $center.X = [int](($rect.Left+$rect.Right)/2); $center.Y = [int](($rect.Top+$rect.Bottom)/2)
  if ([NavigatorSmokeWindow]::GetAncestor([NavigatorSmokeWindow]::WindowFromPoint($center), 2) -ne $handle) { throw 'Another window is covering Navigator; refusing to validate its pixels' }
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
    if ($CheckStartup) {
      # Inspect the central panel, excluding the caption/desktop. The bundled
      # startup document must actually paint text while Node is still blocked.
      $bright = 0
      for ($y = [int]($bitmap.Height*.35); $y -lt [int]($bitmap.Height*.65); $y += 2) {
        for ($x = [int]($bitmap.Width*.25); $x -lt [int]($bitmap.Width*.75); $x += 2) {
          $pixel = $bitmap.GetPixel($x, $y)
          if ($pixel.R -gt 140 -and $pixel.G -gt 140 -and $pixel.B -gt 140) { $bright++ }
        }
      }
      if ($bright -lt 40) { throw "The startup screen is blank while the backend is delayed. Inspect $absolute" }
    }
  } finally {
    $graphics.Dispose(); $bitmap.Dispose()
    [void][NavigatorSmokeWindow]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x13)
  }
}
$launchTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$arguments = @{ FilePath = (Resolve-Path $Executable); PassThru = $true }
if (-not $LaunchApp) { $arguments.ArgumentList = '--smoke-test' }
$fixture = $null
$oldNodeOptions = $env:NODE_OPTIONS
try {
  if ($StartupDelaySeconds -gt 0) {
    if (-not $LaunchApp) { throw 'A startup delay requires -LaunchApp' }
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ("navigator-startup-" + [Guid]::NewGuid().ToString('N') + '.cjs')
    [IO.File]::WriteAllText($fixture, "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,$($StartupDelaySeconds*1000));")
    # NODE_OPTIONS interprets backslashes inside quotes as escape characters.
    $preloadPath = $fixture.Replace('\', '/')
    $env:NODE_OPTIONS = "$oldNodeOptions --require `"$preloadPath`""
  }
  $app = Start-Process @arguments
} finally { $env:NODE_OPTIONS = $oldNodeOptions }
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  $profile = if ($LaunchApp) { 'Navigator Desktop' } else { 'Navigator Desktop\smoke' }
  $log = Join-Path $env:LOCALAPPDATA "$profile\startup.jsonl"
  $played = $false; $ready = $false; $startupPainted = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    $app.Refresh()
    $handle=Get-NavigatorHandle $app
    if ($app.HasExited) { throw "Native smoke exited early: $($app.ExitCode)" }
    # Prevent Chromium's occluded-window throttling from distorting readiness
    # measurements. Only this short-lived test window is raised.
    if ($handle -ne 0) { [void][NavigatorSmokeWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x13) }
    if (Test-Path $log) {
      $events = @(Get-Content -LiteralPath $log | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} } | Where-Object { $_.pid -eq $app.Id -and $_.unix_ms -ge $launchTime })
      $played = $LaunchApp -or @($events | Where-Object stage -eq 'smoke-playing').Count -gt 0
      $ready = @($events | Where-Object stage -eq 'app-ready').Count -gt 0
      if ($StartupDelaySeconds -gt 0 -and -not $startupPainted -and @($events | Where-Object stage -eq 'startup-page-loaded').Count -gt 0 -and $handle -ne 0) {
        if (@($events | Where-Object stage -eq 'backend-ready').Count -gt 0) { throw 'The startup screen did not load independently of the delayed backend' }
        [void][NavigatorSmokeWindow]::SetForegroundWindow($handle)
        Start-Sleep -Milliseconds 1700
        Save-NavigatorScreenshot $app (Join-Path (Split-Path $Output) 'windows-startup.png') -CheckStartup
        $startupPainted = $true
      }
      if ($played -and $ready -and $handle -ne 0) { break }

    }
    Start-Sleep -Milliseconds 200
  }
  if ($StartupDelaySeconds -gt 0 -and -not $startupPainted) { throw 'No painted startup screen was observed while Node was delayed' }
  if (-not ($played -and $ready)) {
    Save-NavigatorScreenshot $app $Output
    if (Test-Path $log) { Get-Content -LiteralPath $log }
    throw 'Native video or the WebView bridge never became ready'
  }
  [void][NavigatorSmokeWindow]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 500
  [void][NavigatorSmokeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
  $client = New-Object NavigatorSmokeWindow+Rect
  [void][NavigatorSmokeWindow]::GetClientRect($handle, [ref]$client)
  $scale = [NavigatorSmokeWindow]::GetDpiForWindow($handle) / 96.0
  $point = New-Object NavigatorSmokeWindow+Point
  $point.X = $client.Right - [int](69 * $scale); $point.Y = [int](16 * $scale)
  [void][NavigatorSmokeWindow]::ClientToScreen($handle, [ref]$point)
  $coordinates = (($point.Y -band 0xffff) -shl 16) -bor ($point.X -band 0xffff)
  $hit = [NavigatorSmokeWindow]::SendMessage($handle, 0x0084, [IntPtr]::Zero, [IntPtr]$coordinates).ToInt64()
  if ($hit -ne 9) {
    $windowClass=New-Object Text.StringBuilder 256
    [void][NavigatorSmokeWindow]::GetClassName($handle,$windowClass,256)
    Save-NavigatorScreenshot $app ($Output+'.hit-test.png')
    throw "Custom maximize control did not expose HTMAXBUTTON for Snap: $hit; class=$windowClass; client=$($client.Right)x$($client.Bottom), scale=$scale, point=$($point.X),$($point.Y)"
  }
  Save-NavigatorScreenshot $app $Output -CheckBars:(!$LaunchApp)
  Close-Navigator $app
  if (-not $app.WaitForExit(15000)) { throw 'Native shutdown did not finish' }
  if ($app.ExitCode -ne 0) { throw "Native smoke exited $($app.ExitCode)" }
  if ($LaunchApp) { Write-Host "Packaged backend, hydrated app, custom frame, and shutdown passed. Screenshot: $Output" }
  else { Write-Host "Native video, transparent WebView, IPC, custom frame, and shutdown passed. Screenshot: $Output" }
} finally {
  $app.Refresh()
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
  if ($fixture) { Remove-Item -LiteralPath $fixture -Force -ErrorAction SilentlyContinue }
}
