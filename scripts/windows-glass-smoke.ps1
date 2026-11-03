param([Parameter(Mandatory=$true)][string]$Executable,[string]$Output='dist/windows-glass.png')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$outputPath=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force (Split-Path $outputPath)|Out-Null
$env:NAVIGATOR_GLASS_RESULT=$outputPath
Remove-Item "$outputPath.ready","$outputPath.painted.json","$outputPath.completed.json" -ErrorAction SilentlyContinue
$server=$null;$app=$null
try{
 $server=Start-Process (Get-Command node.exe).Source -ArgumentList "$root\scripts\windows-glass-fixture.mjs" -PassThru -WindowStyle Hidden -RedirectStandardError "$outputPath.server-error.log"
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(!(Test-Path "$outputPath.ready")){if([DateTime]::UtcNow -gt $deadline){throw 'Glass fixture server failed'};Start-Sleep -Milliseconds 100}
 $app=Start-Process (Resolve-Path $Executable).Path -ArgumentList '--url http://127.0.0.1:37381' -PassThru
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 while(!(Test-Path "$outputPath.painted.json")){if($app.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'No actual video samples reached the production glass effect'};Start-Sleep -Milliseconds 100}
 # Reuse the capture helper's physical-coordinate and window-ownership checks.
 $source=Get-Content "$root\scripts\windows-smoke.ps1" -Raw
 $start=$source.IndexOf("Add-Type -AssemblyName System.Drawing")
 $end=$source.IndexOf('$launchTime =')
 Invoke-Expression $source.Substring($start,$end-$start)
 $app.Refresh()
 Save-NavigatorScreenshot $app $outputPath
 $material=Get-Content "$outputPath.painted.json" -Raw|ConvertFrom-Json
 if($material.bytes -gt 64*1024 -or $material.material.Count -ne 3 -or @($material.material|Where-Object {!$_.painted -or !$_.image}).Count){throw 'Preview/menu/subtitle video glass did not paint correctly'}
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 while(!(Test-Path "$outputPath.completed.json")){if([DateTime]::UtcNow -gt $deadline){throw 'Glass demand did not stop'};Start-Sleep -Milliseconds 100}
 $result=Get-Content "$outputPath.completed.json" -Raw|ConvertFrom-Json
 if(!$result.stopped){throw 'Hidden controls continued native image capture'}
 'Preview, menu and subtitle glass painted actual video; hidden surfaces stopped sampling.'
}finally{
 if($app -and !$app.HasExited){[void]$app.CloseMainWindow();if(!$app.WaitForExit(15000)){Stop-Process -Id $app.Id -Force}}
 if($server -and !$server.HasExited){Stop-Process -Id $server.Id -Force}
}
