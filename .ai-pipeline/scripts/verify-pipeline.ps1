<#
.SYNOPSIS
Health check toàn diện cho hệ thống AI Pipeline trên Windows.
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = (Resolve-Path ".\.ai-pipeline").Path
)

try {
    Write-Host "`n🩺 KỂM TRA SỨC KHỎE PIPELINE (Health Check)`n" -ForegroundColor Cyan

    $failCount = 0

    function Check-Folder {
        param([string]$Path, [string]$Name)
        if (Test-Path $Path) {
            Write-Host "  [OK] Thư mục $Name tồn tại." -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Không tìm thấy thư mục $Name ($Path)." -ForegroundColor Red
            $script:failCount++
        }
    }

    function Check-Cli {
        param([string]$Tool)
        if (Get-Command $Tool -ErrorAction SilentlyContinue) {
            Write-Host "  [OK] Tìm thấy công cụ CLI: $Tool" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Chưa cài đặt công cụ: $Tool" -ForegroundColor Yellow
        }
    }

    # 1. Folder Check
    Check-Folder -Path (Join-Path $PipelineRoot "rules") -Name "Rules"
    Check-Folder -Path (Join-Path $PipelineRoot "skills") -Name "Skills"
    Check-Folder -Path (Join-Path $PipelineRoot "templates") -Name "Templates"
    Check-Folder -Path (Join-Path $PipelineRoot "scripts") -Name "Scripts"

    # 2. Files Check (Mẫu)
    $msewTemplate = Join-Path $PipelineRoot "templates\MSEW.template.md"
    if (Test-Path $msewTemplate) {
        Write-Host "  [OK] Tìm thấy MSEW.template.md" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Mất file lõi MSEW.template.md!" -ForegroundColor Red
        $failCount++
    }

    # 3. CLI Check
    Write-Host ""
    Check-Cli -Tool "repomix"
    Check-Cli -Tool "npx"
    Check-Cli -Tool "pytest"
    Check-Cli -Tool "ruff"
    Check-Cli -Tool "black"
    Check-Cli -Tool "codegraph"

    Write-Host "`n📊 KẾT LUẬN"
    if ($failCount -gt 0) {
        Write-Host "❌ Pipeline bị hỏng ($failCount lỗi). Xin hãy cài đặt/khởi tạo lại." -ForegroundColor Red
        exit 2
    } else {
        Write-Host "✅ Pipeline hoàn hảo! Hệ thống đã sẵn sàng cho Tầng 1 (Kiến trúc sư)." -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "❌ Lỗi script: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
