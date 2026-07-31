
# ============================================================
# GitHub Issue + PR Creator for Restaurant-QR-Ordering-System
# Run: .\create_issues_prs.ps1
# You will be prompted for your GitHub Personal Access Token
# ============================================================

$OWNER  = "Ankita-barsha"
$REPO   = "Restaurant-QR-Ordering-System"
$BRANCH = "feat/enterprise-admin-dashboard-overhaul"
$BASE   = "ankita"
$API    = "https://api.github.com"

$TOKEN = Read-Host -Prompt "Enter your GitHub Personal Access Token (PAT)" -AsSecureString
$BSTR  = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($TOKEN)
$PAT   = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$Headers = @{
    "Authorization"        = "Bearer $PAT"
    "Accept"               = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function New-GHIssue {
    param($title, $body, $labels)
    $payload = @{ title = $title; body = $body; labels = $labels } | ConvertTo-Json -Depth 5
    try {
        $resp = Invoke-RestMethod -Uri "$API/repos/$OWNER/$REPO/issues" `
            -Method POST -Headers $Headers -Body $payload -ContentType "application/json"
        Write-Host "  OK Issue #$($resp.number): $title" -ForegroundColor Green
        return $resp.number
    } catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
        return $null
    }
}

function New-GHPR {
    param($title, $body, $head, $base)
    $payload = @{ title = $title; body = $body; head = $head; base = $base; draft = $false } | ConvertTo-Json -Depth 5
    try {
        $resp = Invoke-RestMethod -Uri "$API/repos/$OWNER/$REPO/pulls" `
            -Method POST -Headers $Headers -Body $payload -ContentType "application/json"
        Write-Host "  OK PR #$($resp.number): $title" -ForegroundColor Cyan
        return $resp.number
    } catch {
        Write-Host "  FAIL PR: $_" -ForegroundColor Yellow
        return $null
    }
}

Write-Host "`nCreating GitHub Issues..." -ForegroundColor Magenta

$i1 = New-GHIssue -title "feat(admin): Enterprise ERP Admin Dashboard and Staff UI Overhaul" `
    -body "Complete enterprise-grade overhaul of all admin and staff-facing pages.`n`nIncludes: AdminDashboard (real-time KPI cards, live order feed), AdminMenu (CRUD + image upload + offers), AdminPayments (reconciliation ledger), AdminReports (analytics), AdminReservations, AdminRoles (permission matrix), AdminSettings, AdminTables (QR gen), AdminUsers, AdminAuditLogs, StaffLayout (RBAC sidebar), shared ui.tsx component library." `
    -labels @("feature","admin","ERP")
Start-Sleep -Milliseconds 600

$i2 = New-GHIssue -title "feat(kitchen): Enterprise Kitchen Display System with Integrated Kitchen Manager" `
    -body "Enterprise KDS replacing the basic kitchen screen. Kitchen Manager functionality integrated directly into KDS.`n`nIncludes: real-time ticket board (PENDING to COOKING to READY), chef task assignment, cooking timer with urgency rings, priority reordering, KOT print, StaffOrders full state machine." `
    -labels @("feature","kitchen","real-time")
Start-Sleep -Milliseconds 600

$i3 = New-GHIssue -title "feat(waiter): Enterprise Waiter Dashboard with Real-time Order Serving and Cash Payment" `
    -body "Brand-new WaiterServe.tsx built from scratch.`n`nIncludes: real-time WAITER_ORDER_READY socket alerts with visual + audio notification, age-based urgency rings (amber 10 min / red 20 min), tabbed interface (Ready to Serve / Served / All Open), cash payment modal with auto change calculation, invoice preview modal with GST tax invoice, RBAC-aware access control." `
    -labels @("feature","waiter","real-time","payment")
Start-Sleep -Milliseconds 600

$i4 = New-GHIssue -title "feat(socket): Add WAITER Room, WAITER_ORDER_READY and PAYMENT_STATUS_CHANGED Socket Events" `
    -body "Backend and frontend socket infrastructure for waiter real-time alerts.`n`nServer: events.ts adds WAITER_ORDER_READY + PAYMENT_STATUS_CHANGED + ROOMS.WAITER; index.ts registers WAITER room in joinStaffRooms; order.service emits on READY transition; payment.service emits after successful payment. Client: socket.ts registers the new event listeners." `
    -labels @("feature","backend","socket","real-time")
Start-Sleep -Milliseconds 600

$i5 = New-GHIssue -title "feat(theme): Global Light/Dark Mode Toggle with WCAG AAA Contrast and Remove Smoke Effects in Light Mode" `
    -body "Full light/dark mode system implemented with WCAG AAA accessibility.`n`nIncludes: index.css light mode CSS variable overrides; WCAG AAA input/label safeguards; Sun/Moon toggle in Navbar; theme-aware classes across luxe.tsx, Modal.tsx, DishSheet.tsx, DemoCheckout, ErrorBoundary, CustomerFooter; smoke/glass effects disabled in light mode." `
    -labels @("feature","theme","accessibility","UI")
Start-Sleep -Milliseconds 600

$i6 = New-GHIssue -title "fix(invoice): Isolate InvoiceSheet from Dark Mode CSS Variables for Correct Rendering" `
    -body "InvoiceSheet rendered with invisible text in dark mode because text-white-* classes resolved to the ivory CSS variable which becomes white in dark mode.`n`nFix: Replace all text-white-* with hardcoded text-slate-* classes; add style color:#0f172a on invoice root; update print CSS to force white background and dark text." `
    -labels @("bug","invoice","dark-mode","UI")
Start-Sleep -Milliseconds 600

$i7 = New-GHIssue -title "feat(reviews): Customer Review Moderation Workflow with Real-time Admin Alert" `
    -body "End-to-end review moderation: customer submits from phone, admin gets real-time alert and approves before it goes live.`n`nServer: createReview accepts pendingApproval flag; unauthenticated callers get isVisible=false. Client: AdminContent socket handler auto-switches to Reviews tab and shows amber notification banner with customer name, rating, comment preview and direct approve button. Customer modal updated with correct pending-approval messaging." `
    -labels @("feature","reviews","moderation","real-time")
Start-Sleep -Milliseconds 600

$i8 = New-GHIssue -title "feat(customer): UX Improvements Across Customer-Facing Pages" `
    -body "Multiple UX and theme improvements across customer pages.`n`nIncludes: CustomerCart inline quantity stepper and modifier display; CustomerMenu dish card stepper and category filter; TrackOrder live status timeline and SERVED state upsell actions; Reserve form light mode contrast; ScanTable theme-aware styling; PrivacyPolicy DPDP light/dark contrast." `
    -labels @("feature","customer","UX")

Write-Host "`nCreating Pull Request..." -ForegroundColor Magenta

$allIssues = @($i1,$i2,$i3,$i4,$i5,$i6,$i7,$i8) | Where-Object { $_ }
$closesLines = ($allIssues | ForEach-Object { "Closes #$_" }) -join "`n"

$prBody = "## Enterprise Restaurant ERP - Full Implementation`n`n" +
          "This PR contains 8 commits covering the complete enterprise restaurant management system.`n`n" +
          "### Commits`n" +
          "- 39ed1f8 feat(admin): Enterprise ERP admin dashboard overhaul`n" +
          "- 5d0997b feat(kitchen): KDS with integrated kitchen manager`n" +
          "- c53deb0 feat(waiter): Enterprise Waiter Dashboard`n" +
          "- 4298be7 feat(socket): WAITER room and new socket events`n" +
          "- db3dd85 feat(theme): Global Light/Dark mode and WCAG AAA`n" +
          "- d53cdb3 fix(invoice): Dark mode isolation for InvoiceSheet`n" +
          "- 5a63d85 feat(reviews): Customer review moderation workflow`n" +
          "- 4b06046 feat(customer): UX improvements across customer pages`n`n" +
          "### CI`n" +
          "- Server build: PASS`n" +
          "- Client typecheck: PASS`n" +
          "- ESLint: zero errors`n`n" +
          $closesLines

$prNum = New-GHPR `
    -title "feat: Enterprise Restaurant ERP - Admin, Kitchen, Waiter, Theme, Reviews and Socket Infrastructure" `
    -body $prBody `
    -head $BRANCH `
    -base $BASE

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Branch : $BRANCH" -ForegroundColor White
if ($prNum) {
    Write-Host "PR     : https://github.com/$OWNER/$REPO/pull/$prNum" -ForegroundColor Cyan
}
$nums = ($allIssues) -join ", "
Write-Host "Issues : #$nums" -ForegroundColor White
