# Measures RAM (private working set) and CPU of the running widget on Windows. Run in CI after build.
# usage: powershell -File scripts/measure.ps1 -Exe "dist\win-unpacked\Daily News Widget.exe"
param([string]$Exe, [int]$IdleSeconds = 90, [int]$BudgetIdleMB = 100, [int]$BudgetOpenMB = 220, [double]$BudgetCpuPct = 1.0)
$ErrorActionPreference = 'Stop'
# Private working set per process (what Task Manager calls "Memory"), from the perf counters.
# PrivateMemorySize64 is commit charge and overstates idle RAM, so it is no longer used.
function Snap($name) {
  $exeLeaf = Split-Path $Exe -Leaf
  $p = @(Get-Process | Where-Object { $_.Path -and (Split-Path $_.Path -Leaf) -eq $exeLeaf })
  $ids = $p.Id
  $perf = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids -contains $_.IDProcess })
  $cmd = @{}; Get-CimInstance Win32_Process | Where-Object { $ids -contains $_.ProcessId } | ForEach-Object { $cmd[[int]$_.ProcessId] = $_.CommandLine }
  $rows = foreach ($r in $perf) {
    $c = [string]$cmd[[int]$r.IDProcess]
    $type = if ($c -match '--type=([\w-]+)') { $Matches[1] } else { 'browser' }
    if ($c -match '--utility-sub-type=([\w.]+)') { $type = "utility:$($Matches[1])" }
    [pscustomobject]@{ Pid = $r.IDProcess; Type = $type; PrivateMB = [math]::Round($r.WorkingSetPrivate / 1MB, 1) }
  }
  if ($p.Count -eq 0 -or $perf.Count -ne $p.Count) { throw "Snap '$name' measured nothing valid: $($p.Count) processes, $($perf.Count) perf rows" }
  $mb = [math]::Round([double](($rows | Measure-Object -Property PrivateMB -Sum).Sum), 1)
  $cpu = ($p | Measure-Object -Property CPU -Sum).Sum
  Write-Host "--- ${name}: per-process private working set ---"
  $rows | Sort-Object PrivateMB -Descending | Format-Table -AutoSize | Out-String | Write-Host
  [pscustomobject]@{ Name = $name; Processes = $p.Count; PrivateMB = $mb; CpuSec = $cpu }
}
function Run($label, $args) {
  $proc = Start-Process -FilePath $Exe -ArgumentList $args -PassThru
  Start-Sleep -Seconds 40                      # first fetch + settle
  $a = Snap "$label after-refresh"
  $t0 = Get-Date; Start-Sleep -Seconds $IdleSeconds
  $b = Snap "$label idle"
  $cpuPct = [math]::Round((($b.CpuSec - $a.CpuSec) / ((Get-Date) - $t0).TotalSeconds) * 100, 2)
  Get-Process | Where-Object { $_.Path -and (Split-Path $_.Path -Leaf) -eq (Split-Path $Exe -Leaf) } | Stop-Process -Force
  Start-Sleep -Seconds 3
  [pscustomobject]@{ Label = $label; AfterRefreshMB = $a.PrivateMB; IdleMB = $b.PrivateMB; Procs = $b.Processes; IdleCpuPct = $cpuPct }
}
# Active-fetch measurement: sample every second while the app does its cold startup refresh and then
# repeated polls (interval shortened via DNW_TEST_INTERVAL_MS; same code path as the 15-minute check).
function Active {
  $env:DNW_TEST_INTERVAL_MS = '20000'
  $proc = Start-Process -FilePath $Exe -ArgumentList '--start-hidden' -PassThru
  $leaf = Split-Path $Exe -Leaf; $samples = @(); $crashed = $false; $t0 = Get-Date; $t0Ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); $prevCpu = 0; $prevT = $t0
  while (((Get-Date) - $t0).TotalSeconds -lt 150) {
    $p = @(Get-Process | Where-Object { $_.Path -and (Split-Path $_.Path -Leaf) -eq $leaf }); $ids = $p.Id
    if ($p.Count -eq 0) { Write-Host 'Active: app is not running'; $crashed = $true; break }
    $mb = [math]::Round((Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids -contains $_.IDProcess } | Measure-Object WorkingSetPrivate -Sum).Sum / 1MB, 1)
    $cpu = ($p | Measure-Object CPU -Sum).Sum; $now = Get-Date
    $pct = if ($samples.Count) { [math]::Round((($cpu - $prevCpu) / ($now - $prevT).TotalSeconds) * 100, 1) } else { 0 }
    $samples += [pscustomobject]@{ T = [int]($now - $t0).TotalSeconds; MB = $mb; Cpu = $pct }
    $prevCpu = $cpu; $prevT = $now; Start-Sleep -Milliseconds 700
  }
  $state = Join-Path $env:APPDATA 'daily-news-widget\state.json'
  if (-not (Test-Path $state)) { $state = Get-ChildItem $env:APPDATA -Recurse -Filter state.json -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
  $stories = 'unknown'
  if ($state) { try { $d = (Get-Content $state -Raw | ConvertFrom-Json).data; if ([double]$d.fetchedAt -lt $t0Ms) { throw 'stale state.json' }; $stories = "world=$(@($d.world).Count) country=$(@($d.country).Count) state=$(@($d.state).Count) tech=$(@($d.tech).Count)" } catch {} }
  Get-Process | Where-Object { $_.Path -and (Split-Path $_.Path -Leaf) -eq $leaf } | Stop-Process -Force
  Remove-Item Env:DNW_TEST_INTERVAL_MS
  Write-Host '--- active timeline (sec, MB, cpu%) ---'
  ($samples | ForEach-Object { "$($_.T)s $($_.MB)MB $($_.Cpu)%" }) -join ' | ' | Write-Host
  $cold = $samples | Where-Object { $_.T -le 40 }; $warm = $samples | Where-Object { $_.T -gt 40 -and $_.T -le 110 }; $end = $samples | Where-Object { $_.T -gt 125 }
  $f = { param($a) [pscustomobject]@{ PeakMB = ($a | Measure-Object MB -Maximum).Maximum; AvgMB = [math]::Round(($a | Measure-Object MB -Average).Average, 1); PeakCpu = ($a | Measure-Object Cpu -Maximum).Maximum; AvgCpu = [math]::Round(($a | Measure-Object Cpu -Average).Average, 1) } }
  $c = & $f $cold; $w = & $f $warm; $e = & $f $end
  Write-Host "LIVE FETCH stories: $stories"
  $total = 0; foreach ($m in [regex]::Matches($stories, '=(\d+)')) { $total += [int]$m.Groups[1].Value }
  if ($crashed) { throw 'Active: the app exited during the measurement' }
  if (@($end).Count -eq 0) { throw 'Active: no samples after 125s' }
  if ($samples.Count -lt 20) { throw "Active: only $($samples.Count) samples taken" }
  if ($total -eq 0) { throw "Active: no live stories were fetched ($stories); the refresh was not verified" }
  Write-Host "ACTIVE cold-start(0-40s): peak_mb=$($c.PeakMB) avg_mb=$($c.AvgMB) peak_cpu=$($c.PeakCpu)% avg_cpu=$($c.AvgCpu)%"
  Write-Host "ACTIVE repeat-polls(40-110s, every 20s): peak_mb=$($w.PeakMB) avg_mb=$($w.AvgMB) peak_cpu=$($w.PeakCpu)% avg_cpu=$($w.AvgCpu)%"
  Write-Host "ACTIVE settled(125-150s): avg_mb=$($e.AvgMB) peak_mb=$($e.PeakMB)"
  [pscustomobject]@{ ColdPeak = $c.PeakMB; WarmPeak = $w.PeakMB; Settled = $e.AvgMB }
}
$act = Active
Start-Sleep -Seconds 3
$tray = Run 'tray-only (window closed)' '--start-hidden'
$open = Run 'window open' ''
$tray | Format-List; $open | Format-List
"RESULT tray_idle_mb=$($tray.IdleMB) tray_cpu_pct=$($tray.IdleCpuPct) open_idle_mb=$($open.IdleMB) open_cpu_pct=$($open.IdleCpuPct)"
$fail = $false
if ($tray.IdleMB -gt $BudgetIdleMB) { Write-Host "OVER BUDGET: tray idle $($tray.IdleMB) MB > $BudgetIdleMB"; $fail = $true }
if ($open.IdleMB -gt $BudgetOpenMB) { Write-Host "OVER BUDGET: window open $($open.IdleMB) MB > $BudgetOpenMB"; $fail = $true }
if ($tray.IdleCpuPct -gt $BudgetCpuPct -or $open.IdleCpuPct -gt $BudgetCpuPct) { Write-Host "OVER BUDGET: idle CPU"; $fail = $true }
if ($act.Settled -gt $BudgetIdleMB) { Write-Host "OVER BUDGET: memory did not return to idle ($($act.Settled) MB)"; $fail = $true }
if ($fail) { exit 1 }
