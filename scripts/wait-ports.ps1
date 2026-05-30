param(
  [int[]]$Ports = @(8010, 5180),
  [int]$MaxSeconds = 90
)
$ok = $true
foreach ($p in $Ports) {
  $up = $false
  $tries = [Math]::Max(1, [int]($MaxSeconds / 2))
  for ($i = 0; $i -lt $tries; $i++) {
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $c.Connect('127.0.0.1', $p)
      $c.Close()
      $up = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $up) {
    Write-Host "[WARN] Port $p not ready"
    $ok = $false
  } else {
    Write-Host "[OK] Port $p listening"
  }
}
if (-not $ok) { exit 1 }
exit 0
