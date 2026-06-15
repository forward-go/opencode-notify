@echo off
chcp 65001 >nul 2>nul
echo === opencode-notify fallback demo (msg.exe) ===
echo.
echo [1/3] Task Complete
msg * /TIME:10 "OpenCode Task Complete: AI has finished responding"
echo   done.
echo.
echo [2/3] Approval Needed
msg * /TIME:10 "OpenCode Approval Needed: Tool requires permission"
echo   done.
echo.
echo [3/3] Error
msg * /TIME:10 "OpenCode Error: Session encountered an error"
echo   done.
echo.
echo === demo finished ===
pause
