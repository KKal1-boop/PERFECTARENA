@echo off
rem PERFECTARENA - double-click this file to play.
rem
rem It only has to find a Node binary; every decision after that is in
rem tools\launch.mjs, which is the same file the other platforms run.
setlocal
cd /d "%~dp0"

set "PA_NODE="
if defined PERFECTARENA_NODE if exist "%PERFECTARENA_NODE%" set "PA_NODE=%PERFECTARENA_NODE%"

rem The project's own copy of Node, if it is still here (it is what the tests use).
if not defined PA_NODE if exist "%~dp0.devtools\node-v22.11.0-win-x64\node.exe" set "PA_NODE=%~dp0.devtools\node-v22.11.0-win-x64\node.exe"

rem A normal installation, wherever it lives.
if not defined PA_NODE for /f "delims=" %%i in ('where node 2^>nul') do if not defined PA_NODE set "PA_NODE=%%i"
if not defined PA_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "PA_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined PA_NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PA_NODE=%ProgramFiles(x86)%\nodejs\node.exe"

if not defined PA_NODE (
  echo PERFECTARENA needs Node 22 or newer to serve the game.
  echo Install it from https://nodejs.org/ and run this file again,
  echo or set PERFECTARENA_NODE to a full path to node.exe.
  echo.
  pause
  exit /b 1
)

"%PA_NODE%" "%~dp0tools\launch.mjs" %*
if errorlevel 1 (
  echo.
  echo The game stopped with an error - the messages above say why.
  pause
)
endlocal
