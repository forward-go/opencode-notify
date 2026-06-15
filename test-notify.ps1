Write-Host "=== OpenCode Notify Environment Check ==="

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
    Write-Host "WinRT Toast API: OK"

    $xml = '<toast><visual><binding template="ToastText02"><text id="1">OpenCode Notify</text><text id="2">Test notification - it works!</text></binding></visual></toast>'
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows.SystemToast.PowerShell').Show($toast)
    Write-Host "OK Sent - check Windows notification center"
} catch {
    Write-Host "FAIL: $_"
}
