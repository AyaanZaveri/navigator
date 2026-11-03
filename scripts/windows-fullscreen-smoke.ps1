param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$Output='dist/windows-fullscreen.json',
  [ValidateSet('Bridge','F11WebView','F11Parent')][string]$Trigger='Bridge'
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
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr SetFocus(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")]public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("dwmapi.dll")]public static extern int DwmFlush();
}
'@
[void][FullscreenWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
function Activate-Navigator($handle){
 $foreground=[FullscreenWindow]::GetForegroundWindow()
 $other=[FullscreenWindow]::GetWindowThreadProcessId($foreground,[IntPtr]::Zero)
 $own=[FullscreenWindow]::GetCurrentThreadId()
 $attached=$false
 try{
  if($own -ne $other){$attached=[FullscreenWindow]::AttachThreadInput($own,$other,$true)}
  [void][FullscreenWindow]::SetForegroundWindow($handle)
 }finally{if($attached){[void][FullscreenWindow]::AttachThreadInput($own,$other,$false)}}
 if([FullscreenWindow]::GetForegroundWindow() -ne $handle){throw 'Could not activate Navigator for the fullscreen check'}
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
function Send-F11($handle){
 Activate-Navigator $handle
 if($Trigger -eq 'F11Parent'){
  $own=[FullscreenWindow]::GetCurrentThreadId()
  $other=[FullscreenWindow]::GetWindowThreadProcessId($handle,[IntPtr]::Zero)
  $attached=[FullscreenWindow]::AttachThreadInput($own,$other,$true)
  try{[void][FullscreenWindow]::SetFocus($handle)}finally{if($attached){[void][FullscreenWindow]::AttachThreadInput($own,$other,$false)}}
 }else{
  $rect=Read-Bounds $handle
  [void][FullscreenWindow]::SetCursorPos([int](($rect.client[0]+$rect.client[2])/2),[int](($rect.client[1]+$rect.client[3])/2))
  [FullscreenWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [FullscreenWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 }
 [FullscreenWindow]::keybd_event(122,87,0,[UIntPtr]::Zero)
 [FullscreenWindow]::keybd_event(122,87,2,[UIntPtr]::Zero)
}
$root=Split-Path $PSScriptRoot -Parent
$outputPath=[IO.Path]::GetFullPath($Output)
$directory=Split-Path $outputPath -Parent
New-Item -ItemType Directory -Force $directory | Out-Null
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
 [void][FullscreenWindow]::ShowWindow($app.MainWindowHandle,3)
 Activate-Navigator $app.MainWindowHandle
 Start-Sleep -Milliseconds 200
 $before=Read-Bounds $app.MainWindowHandle
 $wasMaximized=[FullscreenWindow]::IsZoomed($app.MainWindowHandle)
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 while(!(Test-Path $env:NAVIGATOR_FULLSCREEN_RESULT)){if([DateTime]::UtcNow -gt $deadline){throw 'No native fullscreen response'};Start-Sleep -Milliseconds 50}
 if($Trigger -ne 'Bridge'){
  if((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'ready'){throw 'Missed video readiness'}
  Send-F11 $app.MainWindowHandle
  while((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'entered'){if([DateTime]::UtcNow -gt $deadline){throw 'F11 did not enter native fullscreen'};Start-Sleep -Milliseconds 50}
 }
 if((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'entered'){throw 'Missed fullscreen entry'}
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
 $coversTaskbar=[FullscreenWindow]::GetAncestor([FullscreenWindow]::WindowFromPoint($point),2) -eq $app.MainWindowHandle
 $clientFillsMonitor=($during.client -join ',') -eq ($expected -join ',')
 if($Trigger -ne 'Bridge'){Send-F11 $app.MainWindowHandle}
 $deadline=[DateTime]::UtcNow.AddSeconds(12)
 while((Get-Content $env:NAVIGATOR_FULLSCREEN_RESULT) -ne 'exited'){if([DateTime]::UtcNow -gt $deadline){throw 'No native fullscreen exit response'};Start-Sleep -Milliseconds 100}
 Start-Sleep -Milliseconds 250
 $after=Read-Bounds $app.MainWindowHandle
 $restored=[FullscreenWindow]::IsZoomed($app.MainWindowHandle) -and (($before.client -join ',') -eq ($after.client -join ','))
 $passed=$wasMaximized -and $clientFillsMonitor -and $coversTaskbar -and $restored
 @{passed=$passed;trigger=$Trigger;startedMaximized=$wasMaximized;before=$before;during=$during;monitor=$expected;coversTaskbar=$coversTaskbar;clientFillsMonitor=$clientFillsMonitor;restored=$restored;after=$after}|ConvertTo-Json -Depth 5|Set-Content $outputPath
 if(!$passed){throw "Native fullscreen did not cover the monitor and restore correctly; see $outputPath"}
}catch{$failed=$true;$_|Out-String|Write-Output}finally{
 if($app -and !$app.HasExited){[void]$app.CloseMainWindow();if(!$app.WaitForExit(10000)){Stop-Process -Id $app.Id -Force}}
 if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
}
if($failed){exit 1}
Write-Host 'Maximized entry, monitor-sized video/webview, taskbar coverage, and exit restoration passed.'
