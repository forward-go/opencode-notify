Write-Host "=== OpenCode Notify Environment Check ==="

function Send-Toast {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $ni = New-Object System.Windows.Forms.NotifyIcon
        $ni.Icon = [System.Drawing.SystemIcons]::Information
        $ni.Visible = $true
        $ni.ShowBalloonTip(10000, 'OpenCode Notify', 'Test - it works!', [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Sleep -Milliseconds 1500
        $ni.Dispose()
        return $true
    } catch {
        return $false
    }
}

function Send-Msg {
    try {
        Start-Process -FilePath "msg.exe" -ArgumentList "*","/TIME:10","OpenCode Notify: Test - it works!" -NoNewWindow -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

Write-Host "Trying msg.exe..."
if (Send-Msg) {
    Write-Host "OK Sent via msg.exe"
} else {
    Write-Host "  msg.exe unavailable, trying BalloonTip..."
    if (Send-Toast) {
        Write-Host "OK Sent via BalloonTip"
    } else {
        Write-Host "  BalloonTip failed"
        Write-Host "FAIL: No notification method available"
    }
}
