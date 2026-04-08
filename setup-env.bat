@echo off
REM Setup script to copy .env.example to .env for all services (Windows)
echo Setting up .env files for all backend services...
echo.

set SERVICE_COUNT=0

for /d %%i in (backend\services\*) do (
  if exist "%%i\.env.example" (
    copy "%%i\.env.example" "%%i\.env" >nul 2>&1
    echo Done: Created .env for %%~ni
    set /a SERVICE_COUNT+=1
  ) else (
    echo Warning: No .env.example found for %%~ni
  )
)

echo.
echo Setup complete! Created .env files for %SERVICE_COUNT% services.
echo.
echo Next steps:
echo 1. Configure AWS credentials and service URLs in each .env file
echo 2. Run: docker-compose up -d --build
echo 3. Check status: docker-compose ps
pause
