#!/usr/bin/env pwsh
# ============================================================
# TAFDIL ERP — Script de démarrage développement
# Usage : .\start-dev.ps1
# Pré-requis : Docker Desktop démarré
# ============================================================

$ROOT    = $PSScriptRoot
$SUPA    = "$env:USERPROFILE\AppData\Local\supabase\supabase.exe"
$BACKEND = "$ROOT\backend"
$FRONT   = "$ROOT\frontend"

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         TAFDIL ERP — Démarrage Dev       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Supabase local ──────────────────────────────────────────
Write-Host "`n[1/4] Supabase local..." -ForegroundColor Yellow
Set-Location $ROOT
$supaStatus = & $SUPA status 2>&1
if ($supaStatus -match "API URL") {
  Write-Host "  ✅ Déjà démarré" -ForegroundColor Green
} else {
  Write-Host "  Démarrage (peut prendre 2-3 min)..."
  & $SUPA start 2>&1 | Where-Object { $_ -match "(Started|Error|URL|Key)" }
}

# Récupère les credentials
$status = & $SUPA status 2>&1
$apiUrl     = ($status | Select-String "API URL:\s+(.+)").Matches.Groups[1].Value.Trim()
$anonKey    = ($status | Select-String "anon key:\s+(.+)").Matches.Groups[1].Value.Trim()
$serviceKey = ($status | Select-String "service_role key:\s+(.+)").Matches.Groups[1].Value.Trim()

Write-Host "  API URL  : $apiUrl"
Write-Host "  Anon key : $($anonKey.Substring(0,30))..."

# ── 2. Mise à jour .env avec vraies clés ───────────────────────
Write-Host "`n[2/4] Mise à jour des .env..." -ForegroundColor Yellow
if ($anonKey) {
  @"
SUPABASE_URL=$apiUrl
SUPABASE_SERVICE_KEY=$serviceKey
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:3002
ERP_API_KEY=tafdil-dev-api-key-2024
BASE_URL_RECUS=http://localhost:3000/recus
NOTCHPAY_HMAC_SECRET=dev-hmac-secret
"@ | Set-Content "$BACKEND\.env" -Encoding utf8

  @"
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=$apiUrl
VITE_SUPABASE_ANON_KEY=$anonKey
"@ | Set-Content "$FRONT\.env" -Encoding utf8
  Write-Host "  ✅ .env mis à jour" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  Impossible de lire les clés Supabase — .env existants conservés" -ForegroundColor DarkYellow
}

# ── 3. Migrations SQL ──────────────────────────────────────────
Write-Host "`n[3/4] Application des migrations (db reset --local)..." -ForegroundColor Yellow
$migResult = & $SUPA db reset --local 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✅ Migrations appliquées" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  $migResult" -ForegroundColor DarkYellow
}

# ── 4. Démarrage services ──────────────────────────────────────
Write-Host "`n[4/4] Démarrage Backend + Frontend..." -ForegroundColor Yellow

# Backend dans un terminal séparé
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$BACKEND'; Write-Host '[BACKEND] Port 3000' -ForegroundColor Cyan; npm run dev"
)

Start-Sleep 3

# Frontend dans un terminal séparé
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$FRONT'; Write-Host '[FRONTEND] Port 5173' -ForegroundColor Cyan; npm run dev"
)

Start-Sleep 5

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅  TAFDIL ERP démarré                                  ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║  🌐  Frontend  →  http://localhost:5173                  ║" -ForegroundColor Green
Write-Host "║  ⚙️   Backend   →  http://localhost:3000                  ║" -ForegroundColor Green
Write-Host "║  🏗️   Supabase  →  http://localhost:54321                 ║" -ForegroundColor Green
Write-Host "║  🧰  Studio    →  http://localhost:54323                 ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║  Health check  →  http://localhost:3000/health           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green

Start-Process "http://localhost:5173"
