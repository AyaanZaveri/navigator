param([Parameter(Mandatory=$true)][string]$Executable,[string]$Output='dist/windows-glass.png',[double]$MinimumFps=50,[double]$MaximumGapMs=50,[switch]$SubtitlesOnly)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$outputPath=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force (Split-Path $outputPath)|Out-Null
$env:NAVIGATOR_GLASS_RESULT=$outputPath
Remove-Item "$outputPath.ready","$outputPath.painted.json","$outputPath.completed.json" -ErrorAction SilentlyContinue
$server=$null;$app=$null
$oldLog=$env:RUST_LOG
$oldSubtitlesOnly=$env:NAVIGATOR_GLASS_SUBTITLES_ONLY
if($SubtitlesOnly){$env:NAVIGATOR_GLASS_SUBTITLES_ONLY='1'}
try{
 $server=Start-Process (Get-Command node.exe).Source -ArgumentList "$root\scripts\windows-glass-fixture.mjs" -PassThru -WindowStyle Hidden -RedirectStandardError "$outputPath.server-error.log"
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(!(Test-Path "$outputPath.ready")){if([DateTime]::UtcNow -gt $deadline){throw 'Glass fixture server failed'};Start-Sleep -Milliseconds 100}
 $env:RUST_LOG='navigator_desktop::windows_glass=debug,navigator_desktop::glass=debug,navigator_desktop::platform::windows_video=debug'
 if($env:NAVIGATOR_GLASS_TRACE -eq '1'){$env:RUST_LOG='navigator_desktop::glass=trace,navigator_desktop::windows_glass=trace,navigator_desktop::platform::windows_video=trace'}
 $app=Start-Process (Resolve-Path $Executable).Path -ArgumentList '--url http://127.0.0.1:37381' -PassThru -RedirectStandardError "$outputPath.native.log"
 $app.Refresh();"Native process scheduling priority: $($app.PriorityClass)"
 $env:RUST_LOG=$oldLog
 # Extract the common physical-pixel helpers before timing. A background
 # scheduled task must not benchmark Chromium's occluded-window throttle.
 $source=Get-Content "$root\scripts\windows-smoke.ps1" -Raw
 $start=$source.IndexOf("Add-Type -AssemblyName System.Drawing")
 $end=$source.IndexOf('$launchTime =')
 Invoke-Expression $source.Substring($start,$end-$start)
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do{$app.Refresh();$handle=Get-NavigatorHandle $app;if($app.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'No owned player window'};if($handle -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 50}}while($handle -eq [IntPtr]::Zero)
 [void][NavigatorSmokeWindow]::SetThreadExecutionState([uint32]2147483651)
 Focus-Navigator $handle
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 while(!(Test-Path "$outputPath.painted.json")){if($app.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'No actual video samples reached the production glass effect'};Start-Sleep -Milliseconds 100}
 # Reuse the capture helper's physical-coordinate and window-ownership checks.
 $app.Refresh()
 Save-NavigatorScreenshot $app $outputPath
 if($SubtitlesOnly){
  $deadline=[DateTime]::UtcNow.AddSeconds(12)
  while(!(Test-Path "$outputPath.completed.json")){if([DateTime]::UtcNow -gt $deadline){throw 'Subtitle-only playback did not finish'};Start-Sleep -Milliseconds 100}
  $result=Get-Content "$outputPath.completed.json" -Raw|ConvertFrom-Json
  if($result.frames -ne 0 -or $result.position -lt 3){throw 'Subtitle-only playback sampled glass or did not advance'}
  $painted=Get-Content "$outputPath.painted.json" -Raw|ConvertFrom-Json
  if($painted.subtitle.sampling -or $painted.subtitle.stroke -ne '1.5px'){throw 'Subtitle outline did not render'}
  'Outlined subtitles remain visible while video advances, with zero glass frames.'
  return
 }
 $material=Get-Content "$outputPath.painted.json" -Raw|ConvertFrom-Json
 if($material.bytes -gt 640*360*4 -or $material.material.Count -ne 2 -or @($material.material|Where-Object {!$_.painted -or !$_.image}).Count){throw 'Preview/menu glass did not paint correctly'}
 if($material.subtitle.sampling -or $material.subtitle.stroke -ne '1.5px' -or $material.subtitle.blur -ne 'none' -or $material.subtitle.background -ne 'rgba(0, 0, 0, 0)'){throw 'Subtitles must have a thin outline without glass or a background box'}
 if($env:NAVIGATOR_GLASS_TESTSRC -eq '1') {
  $red=@(for($i=0;$i -lt $material.pixels.Count;$i+=4){$material.pixels[$i]})
  if(@($red|Select-Object -Unique).Count -lt 8){throw 'The canvas contains a sharp edge instead of the expected blur gradient'}
 }
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(!(Test-Path "$outputPath.completed.json")){if(![NavigatorSmokeWindow]::InputDesktopActive()){throw "Desktop locked during glass timing"};if([DateTime]::UtcNow -gt $deadline){throw 'Glass demand did not stop'};Start-Sleep -Milliseconds 100}
 $result=Get-Content "$outputPath.completed.json" -Raw|ConvertFrom-Json
 if(!$result.stopped){throw 'Hidden controls continued native image capture'}
 if(!$result.fullscreenUpdated -or !$result.fullscreenRestored){throw 'Canvas glass did not follow fullscreen resize and restoration'}
 if(!$result.pausedCached -or !$result.pausedSeekUpdated -or !$result.resumed){throw 'Pause cache, paused seek refresh or resume failed'}
 if($result.fps -lt $MinimumFps -or $result.p95GapMs -gt $MaximumGapMs){throw "Glass is visibly slow: $($result.fps) fps, p95 gap $($result.p95GapMs) ms"}
 if($result.paintFps -lt $MinimumFps -or $result.p95PaintGapMs -gt $MaximumGapMs){throw "Glass paint is stalling: $($result.paintFps) fps, p95 gap $($result.p95PaintGapMs) ms"}
 if($material.material[1].dropdownOpacity.Trim() -ne '68%'){throw 'Player menu tint hides the video glass'}
 "Preview and dropdown glass painted actual video; subtitles use an outline. Glass ran at $([Math]::Round($result.fps,1)) fps; hidden surfaces stopped sampling."
}finally{
 $env:RUST_LOG=$oldLog
 $env:NAVIGATOR_GLASS_SUBTITLES_ONLY=$oldSubtitlesOnly
 if("NavigatorSmokeWindow" -as [type]){[void][NavigatorSmokeWindow]::SetThreadExecutionState([uint32]2147483648);if($app -and !$app.HasExited){Close-Navigator $app}}
 if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
}
