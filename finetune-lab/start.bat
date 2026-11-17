@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
if exist "%~dp0..\start-classroom.cmd" (
  call "%~dp0..\start-classroom.cmd" %*
  exit /b %ERRORLEVEL%
)
echo The start helper was not found. Go back to the project folder and double-click the start helper.
echo.
pause
exit /b 1
