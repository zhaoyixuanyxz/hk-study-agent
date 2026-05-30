param(
  [string] $Url = "http://127.0.0.1:5180/"
)
$ErrorActionPreference = "Stop"
try {
  Start-Process $Url
  Write-Host "[OK] Opened browser: $Url"
  exit 0
} catch {
  Write-Host "[WARN] Start-Process failed, trying rundll32..."
  try {
    Start-Process "rundll32.exe" -ArgumentList "url.dll,FileProtocolHandler", $Url
    Write-Host "[OK] Opened via rundll32: $Url"
    exit 0
  } catch {
    Write-Host "[ERROR] Could not open browser. Open manually: $Url"
    exit 1
  }
}
