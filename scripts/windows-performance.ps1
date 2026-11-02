param(
  [Parameter(Mandatory=$true)][int]$AppProcessId,
  [ValidateRange(1,3600)][int]$Seconds = 30,
  [string]$Output = "dist/windows-performance.csv"
)
$ErrorActionPreference = 'Stop'
$root = Get-Process -Id $AppProcessId
$started = $root.StartTime
$samples = @()
$timer = [Diagnostics.Stopwatch]::StartNew()
$previousCpu = $null; $previousTime = 0
while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
  $root.Refresh()
  if ($root.HasExited -or $root.StartTime -ne $started) { break }
  $processes = @(Get-CimInstance Win32_Process)
  $ids = New-Object 'Collections.Generic.HashSet[int]'
  [void]$ids.Add($AppProcessId)
  do {
    $added = $false
    foreach ($entry in $processes) {
      if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $added = $true }
    }
  } while ($added)
  $working = 0L; $private = 0L; $cpu = 0.0; $count = 0
  foreach ($id in $ids) {
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      $working += $process.WorkingSet64; $private += $process.PrivateMemorySize64
      $cpu += $process.TotalProcessorTime.TotalSeconds; $count++
    }
  }
  $now = $timer.Elapsed.TotalSeconds
  $percent = if ($null -ne $previousCpu -and $now -gt $previousTime) { [Math]::Max(0, 100 * ($cpu-$previousCpu) / ($now-$previousTime) / [Environment]::ProcessorCount) } else { 0 }
  $decode = $null; $render = $null
  try {
    $engines = @((Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples | Where-Object {
      $_.InstanceName -match '^pid_(\d+)_' -and $ids.Contains([int]$Matches[1])
    })
    $decode = [Math]::Round(($engines | Where-Object InstanceName -match 'engtype_VideoDecode' | Measure-Object CookedValue -Sum).Sum, 2)
    $render = [Math]::Round(($engines | Where-Object InstanceName -match 'engtype_3D' | Measure-Object CookedValue -Sum).Sum, 2)
  } catch { } # Localized/missing GPU counters remain blank, rather than claiming zero usage.
  $samples += [pscustomobject]@{ Seconds=[Math]::Round($now,2); Processes=$count; WorkingSetMiB=[Math]::Round($working/1MB,1); PrivateMiB=[Math]::Round($private/1MB,1); CpuPercent=[Math]::Round($percent,2); GpuDecodePercentSum=$decode; Gpu3DPercentSum=$render }
  $previousCpu = $cpu; $previousTime = $now
  Start-Sleep -Milliseconds 500
}
$absolute = [IO.Path]::GetFullPath($Output)
[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute))
$samples | Export-Csv -LiteralPath $absolute -NoTypeInformation
Write-Host "Recorded the Navigator + Node + WebView2 process tree: $absolute"
