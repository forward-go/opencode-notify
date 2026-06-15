@echo off
chcp 65001 >nul 2>nul
echo === opencode-notify mshta demo ===
echo.
echo [1/3] Task Complete
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('AI has finished responding',10,'OpenCode - Task Complete',64);close()"
echo   done.
echo.
echo [2/3] Approval Needed
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('Tool execution requires permission',10,'OpenCode - Approval Needed',48);close()"
echo   done.
echo.
echo [3/3] Error
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('Session encountered an error',10,'OpenCode - Error',16);close()"
echo   done.
echo.
echo === demo finished ===
pause
