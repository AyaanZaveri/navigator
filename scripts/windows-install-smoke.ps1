param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
# Delay only this installation helper, then terminate its owner abruptly. The
# already-running user's Node processes are never selected or terminated.
$oldOptions=$env:NODE_OPTIONS
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('navigator-preparation-delay-'+[Guid]::NewGuid().ToString('N')+'.cjs')
[IO.File]::WriteAllText($fixture,'if(process.argv[1]?.endsWith("server.js")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);')
$app=$null;$childIds=@()
try{
 $env:NODE_OPTIONS="$oldOptions --require `"$($fixture.Replace('\','/'))`""
 $app=Start-Process $Executable -ArgumentList '--prepare-install' -PassThru
 $env:NODE_OPTIONS=$oldOptions
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do{
  Start-Sleep -Milliseconds 100
  $childIds=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($app.Id)"|Where-Object Name -eq 'node.exe'|ForEach-Object ProcessId)
  if($app.HasExited){throw 'Preparation exited before the ownership check'}
 }while(!$childIds.Count -and [DateTime]::UtcNow -lt $deadline)
 if(!$childIds.Count){throw 'Preparation helper did not start'}
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 do{
  $grandchildren=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($childIds[0])"|Where-Object Name -eq 'node.exe'|ForEach-Object ProcessId)
  if($grandchildren.Count){break}
  Start-Sleep -Milliseconds 100
 }while([DateTime]::UtcNow -lt $deadline)
 if(!$grandchildren.Count){throw 'Preparation did not start its local service'}
 $childIds+=$grandchildren
 Stop-Process -Id $app.Id -Force
 [void]$app.WaitForExit(5000)
 Start-Sleep -Milliseconds 500
 foreach($childId in $childIds){if(Get-Process -Id $childId -ErrorAction SilentlyContinue){throw "Unowned installation helper survived: $childId"}}
 'Installation preparation helper terminated with its owning app.'
}finally{
 $env:NODE_OPTIONS=$oldOptions
 if($app -and !$app.HasExited){Stop-Process -Id $app.Id -Force}
 Remove-Item -LiteralPath $fixture -Force -ErrorAction SilentlyContinue
}
