<#
.SYNOPSIS
Chạy CodeGraph để lấy baseline (cho Planner) hoặc diff (cho Auditor).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath,
    [Parameter(Mandatory=$true)]
    [string]$OutputPath,
    [ValidateSet("baseline","diff")]
    [string]$Mode = "baseline"
)

try {
    Write-Host "🕸️ Khởi chạy CodeGraph ($Mode mode)..." -ForegroundColor Cyan
    
    if (-not (Get-Command "codegraph" -ErrorAction SilentlyContinue)) {
        Write-Host "[!] CẢNH BÁO: Không tìm thấy 'codegraph' CLI. Đang mô phỏng (Mocking)..." -ForegroundColor Yellow
        $mockData = @{
            status = "CodeGraph CLI missing. Mocked output."
            mode = $Mode
            source = $SourcePath
            time = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        $mockData | ConvertTo-Json | Set-Content -Path $OutputPath -Encoding UTF8
        Write-Host "✅ Đã tạo file giả lập tại: $OutputPath" -ForegroundColor Green
        exit 1
    }

    if ($Mode -eq "baseline") {
        Write-Host "Đang index $SourcePath..."
        codegraph analyze $SourcePath --output $OutputPath 2>$null
    } else {
        Write-Host "Đang quét side-effects (Impact Analysis)..."
        codegraph impact $SourcePath --output $OutputPath 2>$null
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Xuất kết quả thành công: $OutputPath" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "❌ Lỗi thực thi CodeGraph (Exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 2
    }
}
catch {
    Write-Host "❌ Exception: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
