<#
.SYNOPSIS
Xác minh xem Planner đã định tuyến skill chính xác trong MSEW chưa.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$MsewPath
)

try {
    if (-not (Test-Path $MsewPath)) {
        Write-Host "[ERROR] Không tìm thấy file: $MsewPath" -ForegroundColor Red
        exit 2
    }

    $lines = Get-Content $MsewPath
    $inStep = $false
    $currentStep = ""
    $errors = 0

    Write-Host "🔍 Đang phân tích Skill Routing..." -ForegroundColor Cyan

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^### Step (\d+): (.*)") {
            $inStep = $true
            $currentStep = $matches[1] + " (" + $matches[2] + ")"
            $hasSkill = $false
            
            # Quét 10 dòng tiếp theo để tìm Skill Invocation
            $end = [math]::Min($i + 15, $lines.Count - 1)
            for ($j = $i; $j -le $end; $j++) {
                if ($lines[$j] -match "Primary: (.*)") {
                    $skill = $matches[1].Trim(" `t`"'\`"")
                    $hasSkill = $true
                    Write-Host "  [+] Step $currentStep định tuyến Skill: [$skill]" -ForegroundColor Green
                    
                    # Logic heuristic đơn giản (ví dụ)
                    if ($currentStep -match "(?i)database|sql|model" -and $skill -notmatch "databases|backend") {
                        Write-Host "      [-] [CẢNH BÁO] Step liên quan DB nhưng không dùng 'databases' skill." -ForegroundColor Yellow
                    }
                    break
                }
            }

            if (-not $hasSkill) {
                Write-Host "  [-] [LỖI] Step $currentStep KHÔNG CÓ Primary Skill!" -ForegroundColor Red
                $errors++
            }
        }
    }

    if ($errors -gt 0) {
        Write-Host "`n❌ Phát hiện $errors lỗi định tuyến skill. Planner phải sửa!" -ForegroundColor Red
        exit 2
    } else {
        Write-Host "`n✅ Toàn bộ Micro-steps đều đã được định tuyến skill." -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "❌ Lỗi: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
