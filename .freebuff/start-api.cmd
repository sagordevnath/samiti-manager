@echo off
rem ── Detached API launcher (preview) ──────────────────────────────────────────
rem The desktop sandbox exports PORT=0, which fails env validation; force 4000.
set "PORT=4000"
cd /d "C:\Users\sagor\OneDrive\Desktop\Samity Manager\apps\api"
call npm run dev
