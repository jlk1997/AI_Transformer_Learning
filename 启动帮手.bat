@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0start-classroom.cmd" %*
exit /b %ERRORLEVEL%
