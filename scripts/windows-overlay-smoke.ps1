param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$Output = "dist/windows-overlay.png"
)
# Run in the signed-in desktop session; service/SSH session zero cannot capture it.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Split-Path $PSScriptRoot -Parent
$absolute=[IO.Path]::GetFullPath($Output)
$base=Split-Path $absolute -Parent
New-Item -ItemType Directory -Force $base | Out-Null
$originalReady=$env:NAVIGATOR_OVERLAY_READY
$originalPort=$env:NAVIGATOR_OVERLAY_PORT
$env:NAVIGATOR_OVERLAY_PORT='37379'
$failed=$false
$server=$null;$app=$null
try {
  $env:NAVIGATOR_OVERLAY_READY="$base\overlay.ready"
  Remove-Item $env:NAVIGATOR_OVERLAY_READY -ErrorAction SilentlyContinue
  $server=Start-Process (Get-Command node.exe).Source -ArgumentList "$root\scripts\windows-overlay-fixture.mjs" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$base\overlay-server.log" -RedirectStandardError "$base\overlay-server-error.log"
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(!(Test-Path $env:NAVIGATOR_OVERLAY_READY)) {if([DateTime]::UtcNow -gt $deadline){throw 'Fixture did not start'};Start-Sleep -Milliseconds 100}
  $exe=(Resolve-Path $Executable).Path
  $app=Start-Process $exe -ArgumentList '--url http://127.0.0.1:37379' -PassThru
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  do{
    Start-Sleep -Milliseconds 250
    $app.Refresh()
    $log="$env:LOCALAPPDATA\Navigator Desktop\startup.jsonl"
    $events=if(Test-Path $log){@(Get-Content $log | ForEach-Object{$_|ConvertFrom-Json}|Where-Object pid -eq $app.Id)}else{@()}
    if($app.HasExited){throw 'App exited before playback'}
  }while(!($events.stage -contains 'playback-ready') -and [DateTime]::UtcNow -lt $deadline)
  if(!($events.stage -contains 'playback-ready')){throw 'No native playback-ready event'}
  Add-Type -AssemblyName System.Drawing
  Add-Type @'
using System;using System.Runtime.InteropServices;
public static class OverlayWindow {
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [StructLayout(LayoutKind.Sequential)]public struct Point{public int X,Y;}
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("dwmapi.dll")]public static extern int DwmFlush();
 [StructLayout(LayoutKind.Sequential)] public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
}
'@
  [void][OverlayWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
  [void][OverlayWindow]::SetForegroundWindow($app.MainWindowHandle)
  [void][OverlayWindow]::SetWindowPos($app.MainWindowHandle,[IntPtr](-1),0,0,0,0,0x13)
  [void][OverlayWindow]::DwmFlush()
  Start-Sleep -Milliseconds 500
  $rect=New-Object OverlayWindow+Rect
  [void][OverlayWindow]::GetWindowRect($app.MainWindowHandle,[ref]$rect)
  $center=New-Object OverlayWindow+Point
  $center.X=[int](($rect.Left+$rect.Right)/2);$center.Y=[int](($rect.Top+$rect.Bottom)/2)
  if([OverlayWindow]::GetAncestor([OverlayWindow]::WindowFromPoint($center),2) -ne $app.MainWindowHandle){throw 'Another window is covering Navigator'}
  $bitmap=New-Object Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  try{
    $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size)
    $bitmap.Save($absolute,[Drawing.Imaging.ImageFormat]::Png)
    $escaped=0;$samples=0
    $colors=New-Object 'Collections.Generic.HashSet[int]'
    for($y=[int]($bitmap.Height*.15);$y -lt [int]($bitmap.Height*.5);$y+=5){
      for($x=[int]($bitmap.Width*.15);$x -lt [int]($bitmap.Width*.85);$x+=5){
        $p=$bitmap.GetPixel($x,$y);$samples++
        [void]$colors.Add($p.ToArgb())
        if([Math]::Abs($p.R-31) -lt 8 -and [Math]::Abs($p.G-231) -lt 8 -and [Math]::Abs($p.B-117) -lt 8){$escaped++}
      }
    }
    @{escapedPixels=$escaped;samples=$samples;videoColors=$colors.Count;passed=($escaped -eq 0 -and $colors.Count -gt 8)}|ConvertTo-Json|Set-Content ($absolute+".json")
    if($escaped -ne 0){throw "Retained media-page artwork covered $escaped of $samples video samples"}
    if($colors.Count -le 8){throw 'Expected visible native video, not an empty/opaque window'}
  }finally{
    $graphics.Dispose();$bitmap.Dispose()
    [void][OverlayWindow]::SetWindowPos($app.MainWindowHandle,[IntPtr](-2),0,0,0,0,0x13)
  }
}catch{$failed=$true;$_|Out-String|Write-Output}finally{
  if($app -and !$app.HasExited){[void]$app.CloseMainWindow();if(!$app.WaitForExit(10000)){Stop-Process -Id $app.Id -Force}}
  if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
  $env:NAVIGATOR_OVERLAY_READY=$originalReady
  $env:NAVIGATOR_OVERLAY_PORT=$originalPort
}

if($failed){exit 1}
Write-Host "Retained page artwork and backdrop filters stayed out of native video: $absolute"
