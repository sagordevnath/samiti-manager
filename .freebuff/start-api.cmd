@echo off
rem ── Detached API launcher (preview) ──────────────────────────────────────────
rem The desktop sandbox exports PORT=0, which fails env validation; force a port.
rem 4010: 4000 is occupied by another project's dev server on this machine.
set "PORT=4010"
cd /d "C:\Users\sagor\OneDrive\Desktop\Samity Manager\apps\api"
call npm run dev
