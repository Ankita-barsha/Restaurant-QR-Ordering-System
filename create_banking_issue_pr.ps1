# PowerShell Script to Create Issue & PR on Satyajit-Codys/restaurant-manager

$OWNER  = "Satyajit-Codys"
$REPO   = "restaurant-manager"
$HEAD   = "Ankita-barsha:feat/banking-settings-and-checkout-gateway"
$BASE   = "main"
$API    = "https://api.github.com"

# Read PAT Token securely or from env
$PAT = $env:GITHUB_TOKEN

if (-not $PAT) {
    Write-Host "Please set `$env:GITHUB_TOKEN or enter your Personal Access Token below:" -ForegroundColor Yellow
    $TOKEN = Read-Host -Prompt "GitHub PAT Token" -AsSecureString
    $BSTR  = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($TOKEN)
    $PAT   = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

$Headers = @{
    "Authorization"        = "Bearer $PAT"
    "Accept"               = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

# 1. Create GitHub Issue
Write-Host "Creating GitHub Issue on $OWNER/$REPO..." -ForegroundColor Magenta
$issuePayload = @{
    title = "feat(banking): Add Banking & UPI Gateway Settings page and interactive diner checkout"
    body  = "### Problem Statement / Feature Request`nRestauranteurs require a dedicated Banking Settings page (/admin/banking) to configure their registered Merchant Banking Name, UPI VPA ID, and Bank Account details for diner payment checkout.`n`n### Proposed Solution`n1. Created `AdminBanking.tsx` route (/admin/banking) accessible by Admin and Manager roles.`n2. Updated Prisma schema and `settings.service.ts` to persist `bankingName`, `merchantVpa`, `bankAccountNo`, `bankIfscCode`, and Razorpay/Paytm credentials.`n3. Upgraded `DemoCheckout.tsx` with clean 1:1 official brand SVG logos (GPay, PhonePe, Paytm, BHIM) and real pending payment authorization flow.`n4. Updated `TrackOrder.tsx` to hide payment action buttons once order is marked PAID."
    labels = @("enhancement", "feature", "payments")
} | ConvertTo-Json -Depth 5

try {
    $issueResp = Invoke-RestMethod -Uri "$API/repos/$OWNER/$REPO/issues" -Method POST -Headers $Headers -Body $issuePayload -ContentType "application/json"
    $issueNum = $issueResp.number
    Write-Host "SUCCESS: Created Issue #$issueNum" -ForegroundColor Green

    # Save Issue Number to env or output
    Set-Content -Path "created_issue_num.txt" -Value $issueNum

    # 2. Open PR linked to Issue
    Write-Host "Opening PR on $OWNER/$REPO linking Closes #$issueNum..." -ForegroundColor Cyan
    $prPayload = @{
        title = "feat(banking): Add Banking Settings route & interactive diner checkout (PR #$issueNum)"
        body  = "Closes #$issueNum`n`n### Summary of Changes`n- Created `AdminBanking.tsx` (/admin/banking) for managing merchant banking details.`n- Added Prisma model fields for `bankingName`, `merchantVpa`, `bankAccountNo`, `bankIfscCode`.`n- Added 1:1 authentic mobile app brand logos for GPay, PhonePe, Paytm, and BHIM.`n- Implemented real pending payment status validation logic.`n`nTested locally with zero build/lint errors."
        head  = $HEAD
        base  = $BASE
        draft = $false
    } | ConvertTo-Json -Depth 5

    $prResp = Invoke-RestMethod -Uri "$API/repos/$OWNER/$REPO/pulls" -Method POST -Headers $Headers -Body $prPayload -ContentType "application/json"
    Write-Host "SUCCESS: Opened PR #$($prResp.number)" -ForegroundColor Green

} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
