# Weather Prediction - PowerShell Setup and Run Script
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       WEATHER PREDICTION PROJECT" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow
python --version

# Create virtual environment if needed
if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    Write-Host "[2/5] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
} else {
    Write-Host "[2/5] Virtual environment already exists." -ForegroundColor Green
}

$Python = Join-Path $PSScriptRoot "venv\Scripts\python.exe"

# Install requirements
Write-Host "[3/5] Installing/checking requirements..." -ForegroundColor Yellow
& $Python -m pip install -r requirements.txt

# Preprocess dataset
Write-Host "[4/5] Checking preprocessing/model files..." -ForegroundColor Yellow
if (-not (Test-Path ".\models\scaler.pkl")) {
    & $Python preprocess.py
} else {
    Write-Host "Scaler already exists; skipping preprocessing." -ForegroundColor Green
}

# Train model if weights do not exist
if (-not (Test-Path ".\models\model_weights.npz")) {
    Write-Host "Training neural network model..." -ForegroundColor Yellow
    & $Python train_model.py
} else {
    Write-Host "Model weights already exist; skipping training." -ForegroundColor Green
}

# Start Flask
Write-Host "[5/5] Starting Flask application..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Open: http://127.0.0.1:5000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host ""

& $Python app.py
