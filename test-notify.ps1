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

function Send-Mshta {
    try {
        $js = "new ActiveXObject('WScript.Shell').Popup('Test - it works!',10,'OpenCode Notify',64);close()"
        Start-Process -FilePath "mshta.exe" -ArgumentList "javascript:$js" -NoNewWindow -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

Write-Host "Trying WinRT Toast..."
if (Send-Toast) {
    Write-Host "OK Sent via Toast - check notification center"
    exit 0
}
Write-Host "  Toast failed"

Write-Host "Trying mshta.exe popup..."
if (Send-Mshta) {
    Write-Host "OK Sent via mshta.exe (popup dialog)"
    exit 0
}
Write-Host "  mshta failed"

Write-Host "FAIL: No notification method available"
