param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$Output='dist/windows-fullscreen.json',
  [ValidateSet('Bridge','F11WebView','F11Parent','Caption')][string]$Trigger='Bridge'
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class FullscreenWindow {
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)]public struct Point{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]public struct MonitorInfo{public int Size;public Rect Monitor,Work;public uint Flags;}
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")]public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern bool GetMonitorInfo(IntPtr h,ref MonitorInfo info);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,IntPtr pid);
 [DllImport("kernel32.dll")]public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,System.Text.StringBuilder text,int count);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint message,UIntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern IntPtr SetFocus(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")]public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("dwmapi.dll")]public static extern int DwmFlush();
}
'@
[void][FullscreenWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
function Activate-Navigator($handle){
 for($attempt=0;$attempt -lt 8;$attempt++){
  $foreground=[FullscreenWindow]::GetForegroundWindow()
  $other=[FullscreenWindow]::GetWindowThreadProcessId($foreground,[IntPtr]::Zero)
  $own=[FullscreenWindow]::GetCurrentThreadId()
  $attached=$false
  try{
   if($own -ne $other -and $other -ne 0){$attached=[FullscreenWindow]::AttachThreadInput($own,$other,$true)}
   [void][FullscreenWindow]::SetForegroundWindow($handle)
  }finally{if($attached){[void][FullscreenWindow]::AttachThreadInput($own,$other,$false)}}
  if([FullscreenWindow]::GetForegroundWindow() -eq $handle){return}
  Start-Sleep -Milliseconds 100
 }
 throw 'Could not activate Navigator for the fullscreen check'
}
function Read-Bounds($handle){
 [void][FullscreenWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
 $outer=New-Object FullscreenWindow+Rect;$client=New-Object FullscreenWindow+Rect
 [void][FullscreenWindow]::GetWindowRect($handle,[ref]$outer)
 [void][FullscreenWindow]::GetClientRect($handle,[ref]$client)
 $point=New-Object FullscreenWindow+Point
 [void][FullscreenWindow]::ClientToScreen($handle,[ref]$point)
 return @{outer=@($outer.Left,$outer.Top,$outer.Right,$outer.Bottom);client=@($point.X,$point.Y,($point.X+$client.Right),($point.Y+$client.Bottom))}
}
function Send-F11($handle,[bool]$ExitFullscreen=$false){
 Activate-Navigator $handle
 if($Trigger -eq 'Caption' -and !$ExitFullscreen){
  $r=Read-Bounds $handle
  $dpi=[FullscreenWindow]::GetDpiForWindow($handle)/96.0
  [void][FullscreenWindow]::SetCursorPos([int]($r.client[2]-69*$dpi),[int]($r.client[1]+16*$dpi))
  [FullscreenWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [FullscreenWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  return
 }
 if($Trigger -eq 'F11Parent' -or ($Trigger -eq 'Caption' -and $ExitFullscreen)){
  # Exercise the parent's actual Tao keyboard handler directly. Attaching an
  # automation thread does not reliably retain focus against WebView2's focus
  # forwarding; the WebView variant below tests physical keyboard delivery.
  if(![FullscreenWindow]::PostMessage($handle,0x100,[UIntPtr]::new([uint64]122),[IntPtr]0x570001)){throw 'Could not post native F11 keydown'}
  Start-Sleep -Milliseconds 80
  if(![FullscreenWindow]::PostMessage($handle,0x101,[UIntPtr]::new([uint64]122),[IntPtr]([long]0xc0570001))){throw 'Could not post native F11 keyup'}
  return
 }
 if($Trigger -eq 'Caption'){
  $own=[FullscreenWindow]::GetCurrentThreadId()
  $other=[FullscreenWindow]::GetWindowThreadProcessId($handle,[IntPtr]::Zero)
  $attached=[FullscreenWindow]::AttachThreadInput($own,$other,$true)
  try{[void][FullscreenWindow]::SetFocus($handle)}finally{if($attached){[void][FullscreenWindow]::AttachThreadInput($own,$other,$false)}}
 }else{
  $rect=Read-Bounds $handle
  [void][FullscreenWindow]::SetCursorPos([int](($rect.client[0]+$rect.client[2])/2),[int](($rect.client[1]+$rect.client[3])/2))
  [FullscreenWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [FullscreenWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 }
 Start-Sleep -Milliseconds 100
 [FullscreenWindow]::keybd_event(122,87,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 80
 [FullscreenWindow]::keybd_event(122,87,2,[UIntPtr]::Zero)
}
$root=Split-Path $PSScriptRoot -Parent
$outputPath=[IO.Path]::GetFullPath($Output)
$directory=Split-Path $outputPath -Parent
New-Item -ItemType Directory -Force $directory | Out-Null
Remove-Item -LiteralPath $outputPath -ErrorAction SilentlyContinue
$app=$null;$server=$null;$failed=$false
try{
 $env:NAVIGATOR_FULLSCREEN_TEST=if($Trigger -eq 'Bridge'){'1'}else{'key'}
 $env:NAVIGATOR_FULLSCREEN_RESULT="$directory\fullscreen-phase.txt"
 $env:NAVIGATOR_OVERLAY_READY="$directory\fullscreen-ready.txt"
 Remove-Item $env:NAVIGATOR_FULLSCREEN_RESULT,$env:NAVIGATOR_OVERLAY_READY -ErrorAction SilentlyContinue
 $server=Start-Process (Get-Command node.exe).Source -ArgumentList "$root\scripts\windows-overlay-fixture.mjs" -PassThru -WindowStyle Hidden
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 while(!(Test-Path $env:NAVIGATOR_OVERLAY_READY)){if([DateTime]::UtcNow -gt $deadline){throw 'Fixture did not start'};Start-Sleep -Milliseconds 100}
 $app=Start-Process (Resolve-Path $Executable).Path -ArgumentList '--url http://127.0.0.1:37379' -PassThru
 do{Start-Sleep -Milliseconds 50;$app.Refresh()}while($app.MainWindowHandle -eq 0 -and !$app.HasExited)
 if($app.HasExited){throw 'App exited before opening a window'}
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 while(!(Test-Path $env:NAVIGATOR_FULLSCREEN_RESULT)){if([DateTime]::UtcNow -gt $deadline){throw 'No native video readiness'};Start-Sleep -Milliseconds 50}
 if((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'ready'){throw 'Missed video readiness'}
 # Establish the starting placement after WebView/DXGI startup, when its HWND
 # messages and the initial window animation have settled.
 [void][FullscreenWindow]::ShowWindow($app.MainWindowHandle,9)
 [void][FullscreenWindow]::ShowWindow($app.MainWindowHandle,3)
 Activate-Navigator $app.MainWindowHandle
 [void][FullscreenWindow]::DwmFlush()
 Start-Sleep -Milliseconds 300
 $before=Read-Bounds $app.MainWindowHandle
 $wasMaximized=[FullscreenWindow]::IsZoomed($app.MainWindowHandle)
 if($Trigger -ne 'Bridge'){
  if((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'ready'){throw 'Missed video readiness'}
  Send-F11 $app.MainWindowHandle
  while((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'entered'){if([DateTime]::UtcNow -gt $deadline){throw 'F11 did not enter native fullscreen'};Start-Sleep -Milliseconds 50}
 }
 while((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'entered'){if([DateTime]::UtcNow -gt $deadline){throw 'Missed fullscreen entry'};Start-Sleep -Milliseconds 50}
 Activate-Navigator $app.MainWindowHandle
 [void][FullscreenWindow]::DwmFlush()
 Start-Sleep -Milliseconds 250
 $during=Read-Bounds $app.MainWindowHandle
 $info=New-Object FullscreenWindow+MonitorInfo
 $info.Size=[Runtime.InteropServices.Marshal]::SizeOf($info)
 [void][FullscreenWindow]::GetMonitorInfo([FullscreenWindow]::MonitorFromWindow($app.MainWindowHandle,2),[ref]$info)
 $expected=@($info.Monitor.Left,$info.Monitor.Top,$info.Monitor.Right,$info.Monitor.Bottom)
 $point=New-Object FullscreenWindow+Point
 $point.X=[int](($info.Monitor.Left+$info.Monitor.Right)/2);$point.Y=$info.Monitor.Bottom-3
 $bottomWindow=[FullscreenWindow]::WindowFromPoint($point)
 $bottomClass=New-Object Text.StringBuilder 256
 [void][FullscreenWindow]::GetClassName($bottomWindow,$bottomClass,256)
 $coversTaskbar=[FullscreenWindow]::GetAncestor($bottomWindow,2) -eq $app.MainWindowHandle
 $clientFillsMonitor=($during.client -join ',') -eq ($expected -join ',')
 if($Trigger -ne 'Bridge'){Send-F11 $app.MainWindowHandle $true}
 $deadline=[DateTime]::UtcNow.AddSeconds(12)
 while((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'exited'){if([DateTime]::UtcNow -gt $deadline){throw 'No native fullscreen exit response'};Start-Sleep -Milliseconds 100}
 Start-Sleep -Milliseconds 250
 $after=Read-Bounds $app.MainWindowHandle
 $restored=[FullscreenWindow]::IsZoomed($app.MainWindowHandle) -and (($before.client -join ',') -eq ($after.client -join ','))
 $passed=$wasMaximized -and $clientFillsMonitor -and $coversTaskbar -and $restored
 @{passed=$passed;bottomClass=$bottomClass.ToString();bottomWindow=$bottomWindow.ToInt64();window=$app.MainWindowHandle.ToInt64();trigger=$Trigger;startedMaximized=$wasMaximized;before=$before;during=$during;monitor=$expected;coversTaskbar=$coversTaskbar;clientFillsMonitor=$clientFillsMonitor;restored=$restored;after=$after}|ConvertTo-Json -Depth 5|Set-Content $outputPath
 if(!$passed){throw "Native fullscreen did not cover the monitor and restore correctly; see $outputPath"}
}catch{$failed=$true;$_|Out-String|Write-Output}finally{
 if($app -and !$app.HasExited){[void]$app.CloseMainWindow();if(!$app.WaitForExit(10000)){Stop-Process -Id $app.Id -Force}}
 if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
}
if($failed){exit 1}
Write-Host 'Maximized entry, monitor-sized video/webview, taskbar coverage, and exit restoration passed.'
