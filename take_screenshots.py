"""Take screenshots of the Client tab to verify the UI."""
import sys
import time
import io
# Force UTF-8 stdout
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099/clients"
OUT_DIR = "C:/Users/DELL/dev/dashboard2027"

def main():
    errors = []
    warnings = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage']
        )
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()

        # Capture console messages
        page.on("console", lambda msg: (
            errors.append(f"[{msg.type}] {msg.text}")
            if msg.type == "error"
            else warnings.append(f"[{msg.type}] {msg.text}")
            if msg.type == "warning"
            else None
        ))
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

        print("Navigating to", URL)
        page.goto(URL, wait_until="networkidle", timeout=30000)

        # Wait extra for JS to populate table
        time.sleep(2.5)

        # Screenshot 1: initial
        page.screenshot(path=f"{OUT_DIR}/clients-tab-1.png", full_page=True)
        print("Screenshot 1 saved: clients-tab-1.png")

        # Verify the elements
        checks = []
        # Sidebar active
        nav_clients = page.query_selector("#nav-clients")
        if nav_clients:
            cls = nav_clients.get_attribute("class") or ""
            checks.append(("nav-clients has active class", "active" in cls))
        # KPI cards
        cf_total = page.query_selector("#cf-total")
        cf_unique = page.query_selector("#cf-unique")
        cf_repeats = page.query_selector("#cf-repeats")
        cf_filtered = page.query_selector("#cf-filtered")
        for el_id, name in [(cf_total, "Total clients"), (cf_unique, "Codes uniques"),
                            (cf_repeats, "Dont répétés"), (cf_filtered, "Résultats filtrés")]:
            if el_id:
                txt = (el_id.inner_text() or "").strip()
                checks.append((f"{name} shows a number", txt != "" and txt != "0"))
                print(f"  {name} = {txt!r}")
        # Search bar
        search = page.query_selector("#cf-search")
        checks.append(("Search bar present", search is not None))
        # Advanced filter button
        adv_btn = page.query_selector("#cf-toggle-advanced")
        checks.append(("FILTRES AVANCÉS button visible", adv_btn is not None and adv_btn.is_visible()))
        # Table columns
        headers = page.query_selector_all("#cf-table thead th")
        col_names = [h.inner_text().strip() for h in headers]
        print("  Columns:", col_names)
        expected = ["Code", "Nom", "Secteur", "Localité", "Vendeur SOM", "Vendeur VMM", "DONT REPETE", "Code Client"]
        for exp in expected:
            checks.append((f"Column '{exp}' present", any(exp in c for c in col_names)))
        # Table data
        rows = page.query_selector_all("#cf-tbody tr")
        checks.append((f"Table has data rows (got {len(rows)})", len(rows) > 0))
        # Pagination
        page_info = page.query_selector("#cf-pagination-info")
        if page_info:
            txt = (page_info.inner_text() or "").strip()
            print("  Pagination info:", repr(txt))
            checks.append(("Pagination info shown", "Affichage" in txt or "0" not in txt))
        page_indicator = page.query_selector("#cf-page-indicator")
        if page_indicator:
            txt = (page_indicator.inner_text() or "").strip()
            print("  Page indicator:", repr(txt))
            checks.append(("Page indicator shown", "Page" in txt))

        print("\n--- Initial checks ---")
        for desc, ok in checks:
            print(f"  [{'OK' if ok else 'FAIL'}] {desc}")

        # Screenshot 2: search
        print("\nTyping 'MOHAMED' in search bar...")
        search.click()
        search.fill("MOHAMED")
        time.sleep(1.2)
        page.screenshot(path=f"{OUT_DIR}/clients-tab-2-search.png", full_page=True)
        print("Screenshot 2 saved: clients-tab-2-search.png")

        # Check that table filtered
        rows_after = page.query_selector_all("#cf-tbody tr")
        print(f"  Rows after search: {len(rows_after)}")
        if rows_after:
            sample = rows_after[0].inner_text()
            print(f"  First row sample: {sample[:150]}")

        # Screenshot 3: advanced filters
        print("\nClicking FILTRES AVANCÉS...")
        adv_btn.click()
        time.sleep(0.6)
        # The advanced panel should now be visible
        adv_panel = page.query_selector("#cf-advanced-panel")
        if adv_panel:
            visible = adv_panel.is_visible()
            print(f"  Advanced panel visible: {visible}")
        page.screenshot(path=f"{OUT_DIR}/clients-tab-3-advanced.png", full_page=True)
        print("Screenshot 3 saved: clients-tab-3-advanced.png")

        print("\n--- Console errors ---")
        if errors:
            for e in errors:
                print(f"  {e}")
        else:
            print("  (none)")

        print("\n--- Console warnings (first 5) ---")
        for w in warnings[:5]:
            print(f"  {w}")
        if not warnings:
            print("  (none)")

        browser.close()
        print("\nDone.")

if __name__ == "__main__":
    main()
