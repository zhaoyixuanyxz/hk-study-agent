# Stop processes listening on Study Agent ports (used by 关闭项.bat / 启动项.bat)
param(
  [int[]] $Ports = @(8010, 5180)
)

$ErrorActionPreference = "SilentlyContinue"

function Stop-ListenersOnPort {
  param([int] $Port)

  $procIds = @()
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      $procIds += $c.OwningProcess
    }
  }

  if (-not $procIds.Count) {
    $pattern = ":$Port\s"
    netstat -ano | Select-String $pattern | ForEach-Object {
      $parts = ($_.Line -replace "\s+", " ").Trim().Split(" ")
      if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
        $procIds += [int]$parts[4]
      }
    }
  }

  $procIds = $procIds | Sort-Object -Unique
  foreach ($procId in $procIds) {
    if ($procId -le 4) { continue }
    Write-Host "Stopping PID $procId on port $Port"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

foreach ($port in $Ports) {
  Stop-ListenersOnPort -Port $port
}

Start-Sleep -Milliseconds 400
