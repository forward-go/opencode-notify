#!/bin/bash
echo "=== OpenCode Notify 环境检测 ==="

if grep -qi microsoft /proc/version 2>/dev/null; then
  PLATFORM="wsl"
elif [ "$(uname -s)" = "Darwin" ]; then
  PLATFORM="macos"
elif case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) true;; *) false;; esac; then
  PLATFORM="windows"
elif [ "$(expr substr "$(uname -s)" 1 5)" = "Linux" ]; then
  PLATFORM="linux"
else
  PLATFORM="unknown"
fi
echo "平台: $PLATFORM"

case "$PLATFORM" in
  wsl|windows)
    PS_EXE="powershell.exe"
    command -v "$PS_EXE" &>/dev/null || PS_EXE="powershell"
    if command -v "$PS_EXE" &>/dev/null; then
      echo "$PS_EXE: OK"
      echo "正在发送测试通知..."
      PS='[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null; $d = New-Object Windows.Data.Xml.Dom.XmlDocument; $d.LoadXml('"'"'<toast><visual><binding template="ToastText02"><text id="1">OpenCode Notify</text><text id="2">Test notification - it works!</text></binding></visual></toast>'"'"'); $t = New-Object Windows.UI.Notifications.ToastNotification $d; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('"'"'Windows.SystemToast.PowerShell'"'"').Show($t)'
      ENC=$(echo -n "$PS" | iconv -t UTF-16LE | base64 -w 0)
      "$PS_EXE" -NoProfile -EncodedCommand "$ENC" 2>/dev/null
      echo "OK 已发送 — 检查 Windows 通知中心"
    else
      echo "powershell: 未找到"
      echo "FAIL 不支持"
    fi
    ;;
  linux)
    if command -v notify-send &>/dev/null; then
      echo "notify-send: OK"
      notify-send --app-name=opencode "OpenCode Notify" "Test notification - it works!"
      echo "OK 已发送"
    elif command -v dbus-send &>/dev/null; then
      echo "notify-send 未找到, 尝试 dbus-send..."
      dbus-send --session --print-reply --dest=org.freedesktop.Notifications --type=method_call /org/freedesktop/Notifications org.freedesktop.Notifications.Notify string:opencode uint32:0 string:dialog-information string:"OpenCode Notify" string:"Test" array:string: dict:string:string: int32:5000 2>&1 | grep -q uint32 && echo "OK 已发送" || echo "FAIL 通知守护进程未运行"
    else
      echo "FAIL 请安装: sudo apt install libnotify-bin"
    fi
    ;;
  macos)
    osascript -e 'display notification "Test - it works!" with title "OpenCode Notify"' 2>/dev/null && echo "OK 已发送" || echo "FAIL"
    ;;
  *)
    echo "FAIL 未知平台"
    ;;
esac
