<#
.SYNOPSIS
Kiểm định chất lượng của file MSEW.md (Planner output) để chống lỗi/ảo giác.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$MsewPath
)

try {
    if (-not (Test-Path $MsewPath)) {
        Write-Host "[ERROR] Không tìm thấy file MSEW tại: $MsewPath" -ForegroundColor Red
        exit 2
    }

    $content = Get-Content $MsewPath -Raw
    $errors = 0
    $warnings = 0

    Write-Host "🔍 Đang kiểm định file: $MsewPath" -ForegroundColor Cyan

    # 1. Quét từ mơ hồ (Banned words)
    $bannedWords = @("phù hợp", "hợp lý", "tối ưu", "cần thiết", "linh hoạt", "seems", "should", "might", "probably")
    foreach ($word in $bannedWords) {
        if ($content -match "(?i)\b$word\b") {
            Write-Host "  [-] [LỖI] Chứa từ ngữ mơ hồ bị cấm: '$word'" -ForegroundColor Red
            $errors++
        }
    }

    # 2. Check TODO / placeholder
    if ($content -match "TODO" -or $content -match "\.\.\.") {
        Write-Host "  [-] [CẢNH BÁO] Còn chứa placeholder 'TODO' hoặc '...'" -ForegroundColor Yellow
        $warnings++
    }

    # 3. Check cấu trúc 7 trường
    $requiredFields = @("File:", "Vị trí:", "Skill Invocation:", "Import", "Code", "Verify command", "Expected output:")
    foreach ($field in $requiredFields) {
        if ($content -notmatch $field) {
            Write-Host "  [-] [LỖI] Thiếu trường bắt buộc trong MSEW: '$field'" -ForegroundColor Red
            $errors++
        }
    }

    Write-Host "`n📊 KẾT QUẢ KIỂM ĐỊNH:"
    if ($errors -gt 0) {
        Write-Host "❌ CHẤT LƯỢNG KÉM ($errors Lỗi, $warnings Cảnh báo) - Planner phải viết lại!" -ForegroundColor Red
        exit 2
    } elseif ($warnings -gt 0) {
        Write-Host "⚠️ ĐẠT YÊU CẦU ($warnings Cảnh báo) - Có thể tiến hành nhưng cần cẩn thận." -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "✅ XUẤT SẮC - MSEW rõ ràng, sẵn sàng giao cho Coder!" -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "[ERROR] Lỗi khi quét MSEW: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
