@rem Gradle start up script for Windows
@if "%DEBUG%" == "" @echo off
@rem delegates to gradle if present
where gradle >nul 2>&1 && gradle %* || echo Gradle not found. Install Android SDK.
