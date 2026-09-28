@echo off
rem ── Detached web launcher (preview) ─────────────────────────────────────────
rem Bind 127.0.0.1 explicitly — the preview registration probe requires IPv4.
rem VITE_API_PROXY routes /api/v1 to the API on 4010 (4000 is taken by another
rem project on this machine).
cd /d "C:\Users\sagor\OneDrive\Desktop\Samity Manager\apps\web"
set "VITE_API_PROXY=http://localhost:4010"
call npm run dev -- --port 5174 --strictPort --host 127.0.0.1
