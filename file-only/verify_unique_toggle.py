"""Verify the TOUS/UNIQUES toggle on the Client tab via Playwright.

Steps:
1. Open /clients
2. Wait 2s
3. Screenshot 1: full page (ALL view)
4. Verify TOUS/UNIQUES toggle is visible
5. Click UNIQUES
6. Wait 1s
7. Screenshot 2: full page (UNIQUE view)
8. Screenshot 3: top toolbar (cropped) showing the toggle
9. Read 3 screenshots
10. Report findings
"""

import json
import sys
from playwright.sync_api import sync_playwright


def main():
    url = "http://127.0.0.1:5099/clients"

    findings = {
        "url": url,
        "console_errors": [],
        "all_view": {},
        "unique_view": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()

        # Capture console errors
        def on_console(msg):
            if msg.type in ("error", "warning"):
                findings["console_errors"].append(
                    f"[{msg.type}] {msg.text}"
                )

        page.on("console", on_console)
        page.on("pageerror", lambda exc: findings["console_errors"].append(f"[pageerror] {exc}"))

        # 1. Open URL
        page.goto(url, wait_until="networkidle", timeout=30000)
        # 2. Wait 2s for the table to populate
        page.wait_for_timeout(2000)

        # 4. Verify the TOUS/UNIQUES toggle is visible
        tous_btn = page.locator('.cf-view-btn[data-view="all"]')
        unique_btn = page.locator('.cf-view-btn[data-view="unique"]')
        toggle_visible = tous_btn.is_visible() and unique_btn.is_visible()
        findings["all_view"]["toggle_visible"] = toggle_visible

        # 5. Verify TOUS is active by default
        tous_class = tous_btn.get_attribute("class") or ""
        unique_class = unique_btn.get_attribute("class") or ""
        findings["all_view"]["tous_class"] = tous_class
        findings["all_view"]["unique_class"] = unique_class
        findings["all_view"]["tous_is_active"] = "is-active" in tous_class
        findings["all_view"]["unique_is_active"] = "is-active" in unique_class

        # 6. Verify counts shown on toggle
        tous_count = page.locator("#cf-view-count-all").text_content() or ""
        unique_count = page.locator("#cf-view-count-unique").text_content() or ""
        findings["all_view"]["tous_count"] = tous_count.strip()
        findings["all_view"]["unique_count"] = unique_count.strip()

        # Also get the table-level info
        table_badge = page.locator("#cf-table-badge").text_content() or ""
        pagination_info = page.locator("#cf-pagination-info").text_content() or ""
        page_indicator = page.locator("#cf-page-indicator").text_content() or ""
        filtered_kpi = page.locator("#cf-filtered").text_content() or ""
        total_kpi = page.locator("#cf-total").text_content() or ""
        unique_kpi = page.locator("#cf-unique").text_content() or ""
        findings["all_view"]["table_badge"] = table_badge.strip()
        findings["all_view"]["pagination_info"] = pagination_info.strip()
        findings["all_view"]["page_indicator"] = page_indicator.strip()
        findings["all_view"]["filtered_kpi"] = filtered_kpi.strip()
        findings["all_view"]["total_kpi"] = total_kpi.strip()
        findings["all_view"]["unique_kpi"] = unique_kpi.strip()

        # Get first 3 rows of the table
        first_rows_all = page.evaluate("""() => {
            const rows = document.querySelectorAll('#cf-tbody tr');
            return Array.from(rows).slice(0, 3).map(r => {
                const cells = r.querySelectorAll('td');
                return Array.from(cells).map(c => c.textContent.trim());
            });
        }""")
        findings["all_view"]["first_3_rows"] = first_rows_all

        # 3. Full-page screenshot
        page.screenshot(path="/tmp/clients-unique-1-all.png", full_page=True)

        # 7. Click UNIQUES toggle
        unique_btn.click()

        # 8. Wait 1s for reload
        page.wait_for_timeout(1000)

        # 9. Full-page screenshot (UNIQUE view)
        page.screenshot(path="/tmp/clients-unique-2-unique.png", full_page=True)

        # Read the new toggle state and counts
        tous_class = tous_btn.get_attribute("class") or ""
        unique_class = unique_btn.get_attribute("class") or ""
        tous_count = page.locator("#cf-view-count-all").text_content() or ""
        unique_count = page.locator("#cf-view-count-unique").text_content() or ""
        table_badge = page.locator("#cf-table-badge").text_content() or ""
        pagination_info = page.locator("#cf-pagination-info").text_content() or ""
        page_indicator = page.locator("#cf-page-indicator").text_content() or ""
        filtered_kpi = page.locator("#cf-filtered").text_content() or ""

        findings["unique_view"]["tous_class"] = tous_class
        findings["unique_view"]["unique_class"] = unique_class
        findings["unique_view"]["tous_is_active"] = "is-active" in tous_class
        findings["unique_view"]["unique_is_active"] = "is-active" in unique_class
        findings["unique_view"]["tous_count"] = tous_count.strip()
        findings["unique_view"]["unique_count"] = unique_count.strip()
        findings["unique_view"]["table_badge"] = table_badge.strip()
        findings["unique_view"]["pagination_info"] = pagination_info.strip()
        findings["unique_view"]["page_indicator"] = page_indicator.strip()
        findings["unique_view"]["filtered_kpi"] = filtered_kpi.strip()

        # Get first 5 rows of the table after toggle
        first_rows_unique = page.evaluate("""() => {
            const rows = document.querySelectorAll('#cf-tbody tr');
            return Array.from(rows).slice(0, 5).map(r => {
                const cells = r.querySelectorAll('td');
                return Array.from(cells).map(c => c.textContent.trim());
            });
        }""")
        findings["unique_view"]["first_5_rows"] = first_rows_unique

        # Count distinct codes in the first page to ensure no dupes
        codes_in_page = page.evaluate("""() => {
            const rows = document.querySelectorAll('#cf-tbody tr');
            const codes = Array.from(rows).map(r => r.querySelector('td').textContent.trim());
            return { total: codes.length, unique: new Set(codes).size };
        }""")
        findings["unique_view"]["page_codes"] = codes_in_page

        # 11. Screenshot of the top toolbar
        toolbar = page.locator("#clients-filter-section")
        if toolbar.is_visible():
            toolbar.screenshot(path="/tmp/clients-unique-3-toggle.png")

        # 12. Read all 3 screenshots
        # We don't need to read them in the script — we'll just print the file paths
        findings["screenshots"] = {
            "all_view": "/tmp/clients-unique-1-all.png",
            "unique_view": "/tmp/clients-unique-2-unique.png",
            "toolbar": "/tmp/clients-unique-3-toggle.png",
        }

        # 13. Final console errors
        # (already captured)

        browser.close()

    # Print findings
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(findings, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
