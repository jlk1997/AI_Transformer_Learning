@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul

set "HELPER=%~dp0start-classroom.py"
if not exist "%HELPER%" (
  echo The start helper script was not found.
  echo Double-click the start helper inside the complete project folder.
  goto :END
)

where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    py -3.11 "%HELPER%" %*
    exit /b %ERRORLEVEL%
  )
  py -3 -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    py -3 "%HELPER%" %*
    exit /b %ERRORLEVEL%
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  python "%HELPER%" %*
  exit /b %ERRORLEVEL%
)

where python3 >nul 2>nul
if not errorlevel 1 (
  python3 "%HELPER%" %*
  exit /b %ERRORLEVEL%
)

set "PYEXE="
if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PYEXE if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYEXE if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PYEXE if exist "%ProgramFiles%\Python311\python.exe" set "PYEXE=%ProgramFiles%\Python311\python.exe"
if not defined PYEXE if exist "%ProgramFiles%\Python312\python.exe" set "PYEXE=%ProgramFiles%\Python312\python.exe"
if not defined PYEXE if exist "D:\Python311\python.exe" set "PYEXE=D:\Python311\python.exe"
if not defined PYEXE if exist "D:\Python312\python.exe" set "PYEXE=D:\Python312\python.exe"

if defined PYEXE (
  "%PYEXE%" "%HELPER%" %*
  exit /b %ERRORLEVEL%
)

echo Python 3.11 or newer was not found.
echo Install Python 3.11 or newer, add it to PATH, then double-click the start helper again.
goto :END

:END
echo.
pause
exit /b 1
