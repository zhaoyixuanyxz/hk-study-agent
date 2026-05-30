param([int[]]$Ports = @(8010, 5180))
foreach ($p in $Ports) {
  $busy = $false
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $p)
    $c.Close()
    $busy = $true
  } catch {}
  if ($busy) {
    Write-Host "[WARN] Port $p still in use"
  } else {
    Write-Host "[OK] Port $p free"
  }
}
