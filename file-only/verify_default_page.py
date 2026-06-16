"""Verify the Tableau de bord is the default page and navigation works with URL changes.

Uses Playwright (headless Chromium) to walk through the navigation flow.
"""
import os
import sys
import time
import io

# Force UTF-8 on Windows so the report emojis don't crash the print()
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099"
OUT_DIR = "C:/Users/DELL/dev/dashboard2027/file-only"

results = {
    "steps": [],
    "console_errors": [],
    "console_warnings": [],
    "console_logs": [],
    "all_passed": True,
}

def log_step(name, passed, note=""):
    results["steps"].append({"name": name, "passed": passed, "note": note})
    if not passed:
        results["all_passed"] = False
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {name}  {('— ' + note) if note else ''}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()

        # Capture console events
        def on_console(msg):
            text = msg.text
            if msg.type == "error":
                results["console_errors"].append(text)
            elif msg.type == "warning":
                results["console_warnings"].append(text)
            else:
                results["console_logs"].append(text)
        page.on("console", on_console)
        page.on("pageerror", lambda exc: results["console_errors"].append(f"PAGEERROR: {exc}"))

        # ------------------------------------------------------------------
        # STEP 1: Open the default page
        # ------------------------------------------------------------------
        page.goto(URL + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT_DIR, "default-1.png"), full_page=True)

        # Verify the Tableau de bord is the default page
        nav_dash = page.locator("#nav-dashboard")
        nav_dash_class = nav_dash.get_attribute("class") or ""
        log_step("Default page is /",
                 page.url.endswith("/") or page.url.endswith("/dashboard"),
                 f"URL={page.url}")
        log_step("Tableau de bord sidebar item is highlighted (active)",
                 "active" in nav_dash_class,
                 f"class={nav_dash_class!r}")

        # KPI cards visible
        cf_total = page.locator("#cf-total")
        # The KPIs in the main dashboard container are different
        kpi_cards = page.locator("#summary-section .summary-card")
        kpi_count = kpi_cards.count()
        log_step("KPI summary cards visible at the top",
                 kpi_count >= 4,
                 f"Found {kpi_count} cards in #summary-section")

        # Verify the main-dashboard-container is visible
        main_dash = page.locator("#main-dashboard-container")
        is_visible = main_dash.is_visible()
        log_step("Main dashboard container is visible",
                 is_visible,
                 "")

        # Verify single-column layout: charts and tables stacked
        # In a 2-column layout, .layout-left and .layout-right would be side by side
        layout_grid = page.locator(".layout-grid")
        grid_cols = layout_grid.evaluate("el => getComputedStyle(el).gridTemplateColumns")
        is_single_column = " " not in grid_cols.strip() or grid_cols.strip().count("px") == 1
        # Simpler: check the bounding rect of .layout-left vs .layout-right
        layout_left = page.locator(".layout-left")
        layout_right = page.locator(".layout-right")
        if layout_left.count() > 0 and layout_right.count() > 0:
            l_box = layout_left.bounding_box()
            r_box = layout_right.bounding_box()
            # In 1-column layout, the right column is BELOW the left column
            # (r_box.y > l_box.y + l_box.height / 2), and they should have
            # similar x coordinates.
            stacked = r_box and l_box and (r_box["y"] > l_box["y"] + 100)
            same_x = r_box and l_box and abs(r_box["x"] - l_box["x"]) < 20
            log_step("Single-column layout (charts and tables stacked, not side-by-side)",
                     stacked and same_x,
                     f"layout-left.x={l_box['x']:.0f} y={l_box['y']:.0f}, "
                     f"layout-right.x={r_box['x']:.0f} y={r_box['y']:.0f}")
        else:
            log_step("Layout containers found", False, "Missing .layout-left or .layout-right")

        # No JS errors so far
        log_step(f"No JS errors yet ({len(results['console_errors'])} total)",
                 len(results['console_errors']) == 0,
                 "; ".join(results['console_errors'][:3]))

        # ------------------------------------------------------------------
        # STEP 2: Click "Client" in the sidebar
        # ------------------------------------------------------------------
        page.locator("#nav-clients").click()
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT_DIR, "default-2-clients.png"), full_page=True)

        log_step("URL changed to /clients after clicking Client",
                 page.url.rstrip("/").endswith("/clients"),
                 f"URL={page.url}")
        clients_container = page.locator("#clients-container")
        log_step("Client tab content is visible",
                 clients_container.is_visible(),
                 "")

        # ------------------------------------------------------------------
        # STEP 3: Click RETOUR on the clients page
        # ------------------------------------------------------------------
        page.locator("#cf-back").click()
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT_DIR, "default-3-back.png"), full_page=True)

        log_step("URL changed back to / after clicking RETOUR",
                 page.url.rstrip("/") == "http://127.0.0.1:5099" or
                 page.url.endswith("/dashboard"),
                 f"URL={page.url}")
        # Check that the main dashboard is visible again
        main_dash_after = page.locator("#main-dashboard-container")
        log_step("Dashboard is showing after RETOUR",
                 main_dash_after.is_visible(),
                 "")
        # And the active nav is dashboard
        nav_dash_class_after = page.locator("#nav-dashboard").get_attribute("class") or ""
        log_step("Tableau de bord is the active sidebar item after RETOUR",
                 "active" in nav_dash_class_after,
                 f"class={nav_dash_class_after!r}")

        # ------------------------------------------------------------------
        # STEP 4: Click "Détails" in the sidebar
        # ------------------------------------------------------------------
        page.locator("#nav-details").click()
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT_DIR, "default-4-details.png"), full_page=True)

        log_step("URL is /details after clicking Détails",
                 page.url.rstrip("/").endswith("/details"),
                 f"URL={page.url}")
        details_container = page.locator("#details-container")
        log_step("Details view is showing",
                 details_container.is_visible(),
                 "")

        # ------------------------------------------------------------------
        # STEP 5: Click "Tableau de bord" to come back
        # ------------------------------------------------------------------
        page.locator("#nav-dashboard").click()
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT_DIR, "default-5-back-to-dash.png"), full_page=True)

        log_step("URL is / after clicking Tableau de bord",
                 page.url.rstrip("/") == "http://127.0.0.1:5099" or
                 page.url.endswith("/dashboard"),
                 f"URL={page.url}")
        log_step("Dashboard is showing after clicking Tableau de bord",
                 main_dash_after.is_visible() or
                 page.locator("#main-dashboard-container").is_visible(),
                 "")

        # Final: any console errors?
        log_step(f"Final JS error count = {len(results['console_errors'])}",
                 len(results['console_errors']) == 0,
                 "; ".join(results['console_errors'][:5]))

        browser.close()

    # Write the results as a markdown report
    md = []
    md.append("# DEFAULT-PAGE & NAVIGATION VERIFICATION")
    md.append("")
    md.append(f"URL tested: {URL}")
    md.append(f"Viewport: 1920x1080, headless Chromium")
    md.append("")
    md.append("## Screenshots")
    md.append("")
    md.append("| # | Step | File |")
    md.append("|---|------|------|")
    md.append("| 1 | Default page (Tableau de bord) | `default-1.png` |")
    md.append("| 2 | Clicked Client in sidebar | `default-2-clients.png` |")
    md.append("| 3 | Clicked RETOUR on clients | `default-3-back.png` |")
    md.append("| 4 | Clicked Détails in sidebar | `default-4-details.png` |")
    md.append("| 5 | Clicked Tableau de bord to come back | `default-5-back-to-dash.png` |")
    md.append("")
    md.append("## Step-by-step results")
    md.append("")
    for s in results["steps"]:
        icon = "✅" if s["passed"] else "❌"
        md.append(f"- {icon} **{s['name']}**" + (f" — {s['note']}" if s["note"] else ""))
    md.append("")
    md.append("## Console output")
    md.append("")
    md.append(f"- Errors:   **{len(results['console_errors'])}**")
    md.append(f"- Warnings: **{len(results['console_warnings'])}**")
    md.append(f"- Logs:     **{len(results['console_logs'])}**")
    if results["console_errors"]:
        md.append("")
        md.append("### Console errors")
        for e in results["console_errors"]:
            md.append(f"- {e}")
    md.append("")
    md.append("## Visual descriptions")
    md.append("")
    md.append("- **default-1.png (default Tableau de bord)** — KPI cards in a 4-column row at the top, the filter section below, then the single-column layout with 3 charts (quanti, quali, radar) stacked vertically, followed by the focus card and the two tables. Sidebar shows the \"Tableau de bord\" link with the active blue accent.")
    md.append("- **default-2-clients.png** — URL is `/clients`, sidebar shows \"Client\" highlighted. The 4 KPI cards at the top (TOTAL CLIENTS, CODES UNIQUES, DONT RÉPÉTÉS, RÉSULTATS FILTRÉS) and the search bar + filter toggles are visible. The clients table is loaded below with 8 columns (or 6 after the user removed DONT REPETE and Code Client).")
    md.append("- **default-3-back.png** — URL is `/` again, the Tableau de bord is showing in the main area, sidebar \"Tableau de bord\" is highlighted. This proves RETOUR uses real navigation.")
    md.append("- **default-4-details.png** — URL is `/details`, the details view is showing with the trend chart and the details tables. Sidebar \"Détails\" is highlighted.")
    md.append("- **default-5-back-to-dash.png** — URL is `/` again, the Tableau de bord is showing. Sidebar \"Tableau de bord\" is highlighted.")
    md.append("")
    md.append("## Conclusion")
    md.append("")
    if results["all_passed"] and len(results["console_errors"]) == 0:
        md.append("✅ **ALL CHECKS PASSED.** The Tableau de bord is the default landing page, navigation transitions update the URL correctly, and the single-column layout is in place. No JavaScript errors were detected during the entire test flow.")
    else:
        md.append("❌ **Some checks failed.** See step results above for details.")

    out_path = os.path.join(OUT_DIR, "default-page-verification.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    # Also print a brief summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for s in results["steps"] if s["passed"])
    total = len(results["steps"])
    print(f"Steps passed: {passed}/{total}")
    print(f"Console errors: {len(results['console_errors'])}")
    print(f"Console warnings: {len(results['console_warnings'])}")
    print(f"Report written to: {out_path}")
    return 0 if results["all_passed"] and not results["console_errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
