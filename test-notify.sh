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

build_encoded() {
  local PS='[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null; $d = New-Object Windows.Data.Xml.Dom.XmlDocument; $d.LoadXml('"'"'<toast><visual><binding template="ToastText02"><text id="1">OpenCode Notify</text><text id="2">Test - it works!</text></binding></visual></toast>'"'"'); $t = New-Object Windows.UI.Notifications.ToastNotification $d; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('"'"'Windows.SystemToast.PowerShell'"'"').Show($t)'
  echo -n "$PS" | iconv -t UTF-16LE | base64 -w 0
}

try_mshta() {
  if command -v mshta.exe &>/dev/null; then
    mshta.exe "javascript:new ActiveXObject('WScript.Shell').Popup('Test - it works!',10,'OpenCode Notify',64);close()" 2>/dev/null
    echo "OK 已发送 via mshta.exe (popup)"
    return 0
  fi
  return 1
}

case "$PLATFORM" in
  wsl|windows)
    ENC=$(build_encoded)
    SENT=0
    for PS_EXE in powershell.exe pwsh.exe; do
      if command -v "$PS_EXE" &>/dev/null; then
        echo "尝试 $PS_EXE..."
        if "$PS_EXE" -NoProfile -EncodedCommand "$ENC" 2>/dev/null; then
          echo "OK 已发送 via $PS_EXE (toast)"
          SENT=1
          break
        else
          echo "  $PS_EXE 执行失败"
        fi
      fi
    done
    if [ "$SENT" = "0" ]; then
      echo "所有 PowerShell 不可用, 尝试 mshta.exe..."
      try_mshta || echo "FAIL 所有通知方式均不可用"
    fi
    ;;
  linux)
    if command -v notify-send &>/dev/null; then
      echo "notify-send: OK"
      notify-send --app-name=opencode "OpenCode Notify" "Test - it works!"
      echo "OK 已发送 via notify-send"
    elif command -v dbus-send &>/dev/null; then
      echo "notify-send 未找到, 尝试 dbus-send..."
      dbus-send --session --print-reply --dest=org.freedesktop.Notifications --type=method_call /org/freedesktop/Notifications org.freedesktop.Notifications.Notify string:opencode uint32:0 string:dialog-information string:"OpenCode Notify" string:"Test" array:string: dict:string:string: int32:5000 2>&1 | grep -q uint32 && echo "OK 已发送 via dbus-send" || echo "FAIL 通知守护进程未运行"
    else
      echo "FAIL 请安装: sudo apt install libnotify-bin"
    fi
    ;;
  macos)
    osascript -e 'display notification "Test - it works!" with title "OpenCode Notify"' 2>/dev/null && echo "OK 已发送 via osascript" || echo "FAIL"
    ;;
  *)
    echo "FAIL 未知平台"
    ;;
esac
