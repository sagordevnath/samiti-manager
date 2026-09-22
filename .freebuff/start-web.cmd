@echo off
rem ── Detached web launcher (preview) ─────────────────────────────────────────
rem Bind 127.0.0.1 explicitly — the preview registration probe requires IPv4.
cd /d "C:\Users\sagor\OneDrive\Desktop\Samity Manager\apps\web"
call npm run dev -- --port 5174 --strictPort --host 127.0.0.1
