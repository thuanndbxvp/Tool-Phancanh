<#
.SYNOPSIS
Khởi tạo cấu trúc dự án Multi-AI Pipeline (Windows Edition).
#>
[CmdletBinding()]
param(
    [string]$ProjectPath = $PWD.Path
)

try {
    Write-Host "🚀 Khởi tạo dự án AI Pipeline tại: $ProjectPath" -ForegroundColor Cyan

    $docsPath = Join-Path $ProjectPath "docs"
    $planPath = Join-Path $docsPath "plan"
    $execPath = Join-Path $docsPath "exec"
    $auditPath = Join-Path $docsPath "audit"

    # 1. Tạo thư mục
    $folders = @($planPath, $execPath, $auditPath)
    foreach ($folder in $folders) {
        if (-not (Test-Path $folder)) {
            New-Item -ItemType Directory -Path $folder -Force | Out-Null
            Write-Host "[+] Tạo thư mục: $folder" -ForegroundColor Green
        }
    }

    # 2. Chạy Repomix (nếu có)
    $repomixOut = Join-Path $planPath "repomix-bundle.md"
    if (Get-Command "repomix" -ErrorAction SilentlyContinue -or Get-Command "npx" -ErrorAction SilentlyContinue) {
        Write-Host "[*] Đang chạy Repomix sinh bundle..." -ForegroundColor Yellow
        # Giả định npx repomix
        npx repomix --output $repomixOut --exclude "venv,__pycache__,.git,.ai-pipeline" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[+] Đã sinh Repomix Bundle: $repomixOut" -ForegroundColor Green
        } else {
            Write-Host "[-] Repomix fail, tạo file trống." -ForegroundColor Yellow
            New-Item -ItemType File -Path $repomixOut -Force | Out-Null
        }
    }

    # 3. Chạy CodeGraph (nếu có)
    $codegraphOut = Join-Path $planPath "codegraph-baseline.json"
    if (Get-Command "codegraph" -ErrorAction SilentlyContinue) {
        Write-Host "[*] Đang chạy CodeGraph phân tích..." -ForegroundColor Yellow
        codegraph analyze (Join-Path $ProjectPath "src") --output $codegraphOut 2>$null
        Write-Host "[+] Đã sinh CodeGraph Baseline: $codegraphOut" -ForegroundColor Green
    } else {
        New-Item -ItemType File -Path $codegraphOut -Force | Out-Null
        Set-Content -Path $codegraphOut -Value "{ `"status`": `"CodeGraph not installed`" }" -Encoding UTF8
    }

    # 4. Sinh CONTEXT.md
    $contextFile = Join-Path $planPath "CONTEXT.md"
    $contextContent = @"
# Bối cảnh Khởi tạo (CONTEXT)
- Repomix: .\docs\plan\repomix-bundle.md
- CodeGraph: .\docs\plan\codegraph-baseline.json
"@
    Set-Content -Path $contextFile -Value $contextContent -Encoding UTF8
    Write-Host "[+] Tạo file: $contextFile" -ForegroundColor Green

    # 5. Cài đặt Git Hook commit-msg
    $gitHooksPath = Join-Path $ProjectPath ".git\hooks"
    if (Test-Path $gitHooksPath) {
        $commitMsgHook = Join-Path $gitHooksPath "commit-msg"
        $hookScript = @"
#!/usr/bin/env pwsh
`$commitMsg = Get-Content `$args[0] -Raw
if (`$commitMsg -notmatch "\[MSEW-STEP-\d+\]" -and `$commitMsg -notmatch "Merge") {
    Write-Host "[AI PIPELINE ERROR] Commit message phải chứa tag [MSEW-STEP-N]" -ForegroundColor Red
    exit 1
}
exit 0
"@
        # PowerShell 5.1/7 đều hỗ trợ out file
        Set-Content -Path $commitMsgHook -Value $hookScript -Encoding UTF8
        Write-Host "[+] Đã cài Git Hook commit-msg (yêu cầu MSEW tag)." -ForegroundColor Green
    }

    # 6. Cập nhật README.md
    $readmePath = Join-Path $ProjectPath "README.md"
    if (Test-Path $readmePath) {
        $content = Get-Content $readmePath -Raw
        if ($content -notmatch "## AI Pipeline") {
            Add-Content -Path $readmePath -Value "`r`n## AI Pipeline`r`nDự án được điều phối bởi 3-Tier AI Pipeline.`r`n"
            Write-Host "[+] Cập nhật README.md" -ForegroundColor Green
        }
    }

    Write-Host "`n✅ Khởi tạo hoàn tất! (Exit Code 0)" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n❌ Khởi tạo thất bại: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
