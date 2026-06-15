Write-Host "=== OpenCode Notify Environment Check ==="

function Send-Toast {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
        $xml = '<toast><visual><binding template="ToastText02"><text id="1">OpenCode Notify</text><text id="2">Test - it works!</text></binding></visual></toast>'
        $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
        $doc.LoadXml($xml)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows.SystemToast.PowerShell').Show($toast)
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

Write-Host "Trying WinRT Toast..."
if (Send-Toast) {
    Write-Host "OK Sent via Toast"
    exit 0
}
Write-Host "  Toast failed"

Write-Host "Trying msg.exe..."
if (Send-Msg) {
    Write-Host "OK Sent via msg.exe"
    exit 0
}
Write-Host "  msg.exe failed"

Write-Host "FAIL: No notification method available"
