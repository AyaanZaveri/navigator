param([Parameter(Mandatory=$true)][string]$Executable,[string]$Output='dist/windows-glass.png',[double]$MinimumFps=50,[double]$MaximumGapMs=50)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$outputPath=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force (Split-Path $outputPath)|Out-Null
$env:NAVIGATOR_GLASS_RESULT=$outputPath
Remove-Item "$outputPath.ready","$outputPath.painted.json","$outputPath.completed.json" -ErrorAction SilentlyContinue
$server=$null;$app=$null
$oldLog=$env:RUST_LOG
try{
 $server=Start-Process (Get-Command node.exe).Source -ArgumentList "$root\scripts\windows-glass-fixture.mjs" -PassThru -WindowStyle Hidden -RedirectStandardError "$outputPath.server-error.log"
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(!(Test-Path "$outputPath.ready")){if([DateTime]::UtcNow -gt $deadline){throw 'Glass fixture server failed'};Start-Sleep -Milliseconds 100}
 $env:RUST_LOG='navigator_desktop::windows_glass=debug,navigator_desktop::glass=debug,navigator_desktop::platform::windows_video=debug'
 if($env:NAVIGATOR_GLASS_TRACE -eq '1'){$env:RUST_LOG='navigator_desktop::glass=trace,navigator_desktop::windows_glass=trace,navigator_desktop::platform::windows_video=trace'}
 $app=Start-Process (Resolve-Path $Executable).Path -ArgumentList '--url http://127.0.0.1:37381' -PassThru -RedirectStandardError "$outputPath.native.log"
 $env:RUST_LOG=$oldLog
 # Extract the common physical-pixel helpers before timing. A background
 # scheduled task must not benchmark Chromium's occluded-window throttle.
 $source=Get-Content "$root\scripts\windows-smoke.ps1" -Raw
 $start=$source.IndexOf("Add-Type -AssemblyName System.Drawing")
 $end=$source.IndexOf('$launchTime =')
 Invoke-Expression $source.Substring($start,$end-$start)
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do{$app.Refresh();if($app.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'No player window'};if(!$app.MainWindowHandle){Start-Sleep -Milliseconds 50}}while(!$app.MainWindowHandle)
 Focus-Navigator $app.MainWindowHandle
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 while(!(Test-Path "$outputPath.painted.json")){if($app.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'No actual video samples reached the production glass effect'};Start-Sleep -Milliseconds 100}
 # Reuse the capture helper's physical-coordinate and window-ownership checks.
 $app.Refresh()
 Save-NavigatorScreenshot $app $outputPath
 $material=Get-Content "$outputPath.painted.json" -Raw|ConvertFrom-Json
 if($material.bytes -gt 640*360*4 -or $material.material.Count -ne 3 -or @($material.material|Where-Object {!$_.painted -or !$_.image}).Count){throw 'Preview/menu/subtitle video glass did not paint correctly'}
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(!(Test-Path "$outputPath.completed.json")){if([DateTime]::UtcNow -gt $deadline){throw 'Glass demand did not stop'};Start-Sleep -Milliseconds 100}
 $result=Get-Content "$outputPath.completed.json" -Raw|ConvertFrom-Json
 if(!$result.stopped){throw 'Hidden controls continued native image capture'}
 if(!$result.pausedCached -or !$result.pausedSeekUpdated -or !$result.resumed){throw 'Pause cache, paused seek refresh or resume failed'}
 if($result.fps -lt $MinimumFps -or $result.p95GapMs -gt $MaximumGapMs){throw "Glass is visibly slow: $($result.fps) fps, p95 gap $($result.p95GapMs) ms"}
 if($result.paintFps -lt $MinimumFps -or $result.p95PaintGapMs -gt $MaximumGapMs){throw "Glass paint is stalling: $($result.paintFps) fps, p95 gap $($result.p95PaintGapMs) ms"}
 if($material.material[1].dropdownOpacity.Trim() -ne '68%'){throw 'Player menu tint hides the video glass'}
 "Preview, real dropdown CSS and subtitle glass painted actual video at $([Math]::Round($result.fps,1)) fps; hidden surfaces stopped sampling."
}finally{
 $env:RUST_LOG=$oldLog
 if($app -and !$app.HasExited){[void]$app.CloseMainWindow();if(!$app.WaitForExit(15000)){Stop-Process -Id $app.Id -Force}}
 if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
}
