"""
Playwright verification of the AI report bug fix.

Bug: When the user is in a CATEGORY view (e.g., "Chakib Equipe") and selects
a specific vendeur in the AI modal, the report used to be generated for the
whole category instead of the selected vendeur. The fix reordered the code
so the vendeur name is captured BEFORE the modal close.
"""

import sys
import time
import json
import io
from pathlib import Path

# Force UTF-8 stdout for emoji characters
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
    except Exception:
        pass

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099/"
OUT_DIR = Path("/tmp")

network_log = []
console_errors = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Network monitor
        def on_request(request):
            if "/api/" in request.url:
                network_log.append({
                    "method": request.method,
                    "url": request.url,
                    "post_data": request.post_data,
                })

        def on_console(msg):
            if msg.type in ("error", "warning"):
                console_errors.append(f"[{msg.type}] {msg.text}")

        page.on("request", on_request)
        page.on("console", on_console)

        # Step 1: Open fresh
        print("Step 1: Open", URL)
        page.goto(URL, wait_until="domcontentloaded")
        # Step 2: Wait for dashboard
        time.sleep(3)

        # Step 3: Set sidebar category to "Chakib Equipe" (reproduces the bug scenario)
        print("Step 3: Set category to 'Chakib Equipe'")
        page.select_option("#category-select", value="Chakib Equipe")
        time.sleep(1)

        # Step 5: Click ANALYSE IA button
        print("Step 5: Click 'ANALYSE IA'")
        page.click("#ai-report-btn")
        time.sleep(1.5)

        # Verify modal is open
        modal_open = page.evaluate(
            "() => document.getElementById('vendeur-selection-modal').classList.contains('open')"
        )
        print("  Vendeur selection modal open:", modal_open)
        assert modal_open, "Expected the vendeur selection modal to be open"

        # Step 7: Click the dropdown toggle
        print("Step 7: Click dropdown toggle 'Sélectionner un vendeur'")
        page.click("#vendeur-dropdown-toggle")
        time.sleep(1.5)

        # Step 9: Click on a vendeur in the dropdown
        # Wait for the list to populate
        page.wait_for_selector(".dropdown-item", timeout=5000)
        vendeurs = page.eval_on_selector_all(
            ".dropdown-item",
            "els => els.map(e => ({ name: e.getAttribute('data-vendeur'), text: e.textContent.trim() }))"
        )
        print("  Vendeurs found in dropdown:", len(vendeurs))
        # Pick the first one
        target_vendeur = vendeurs[0]["name"]
        print(f"Step 9: Click on vendeur '{target_vendeur}'")
        page.click(f'.dropdown-item[data-vendeur="{target_vendeur}"]')
        time.sleep(1)

        # Step 11: Verify the modal shows the vendeur name
        bottom_text = page.text_content("#selected-vendeur-display")
        print(f"Step 11: Bottom area says: {bottom_text!r}")
        assert target_vendeur in bottom_text, (
            f"Expected '{target_vendeur}' in the modal bottom, got: {bottom_text!r}"
        )

        # Step 13: Click "GÉNÉRER LE RAPPORT"
        print("Step 13: Click 'GÉNÉRER LE RAPPORT'")
        # Clear the network log first so we only capture the report request
        network_log.clear()
        page.click("#generate-vendeur-report-btn")
        # Step 14: wait for the AI report modal to open and load
        time.sleep(5)

        # Step 15: full-page screenshot
        print("Step 15: Take screenshot")
        page.screenshot(path=str(OUT_DIR / "ia-fixed-1-report.png"), full_page=True)
        print(f"  Saved to {OUT_DIR / 'ia-fixed-1-report.png'}")

        # Step 16: Save network log
        with open(OUT_DIR / "ia-fixed-network.txt", "w", encoding="utf-8") as f:
            for entry in network_log:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"Step 16: Saved network log to {OUT_DIR / 'ia-fixed-network.txt'}")

        # Step 17: extract report text
        # The AI report content is inside #report-content-wrapper
        report_html = page.eval_on_selector(
            "#report-content-wrapper", "el => el.innerText"
        )
        with open(OUT_DIR / "ia-fixed-report.txt", "w", encoding="utf-8") as f:
            f.write(report_html)
        print(f"Step 17: Saved report text to {OUT_DIR / 'ia-fixed-report.txt'}")
        print(f"  Report length: {len(report_html)} chars")

        # Step 19: assertions
        print()
        print("=" * 60)
        print("VERIFICATION CHECKS")
        print("=" * 60)

        # Check the modal title
        title = page.text_content("#report-modal-title")
        print(f"\n[1] Modal title: {title!r}")
        title_ok = target_vendeur in (title or "")
        print(f"    Contains selected vendeur '{target_vendeur}': {title_ok}")
        assert title_ok, f"Expected '{target_vendeur}' in title, got: {title!r}"

        # Check the body
        print(f"\n[2] Report body contains:")
        body_ok_vendeur = target_vendeur in report_html
        body_ok_individual = "RAPPORT DE PERFORMANCE INDIVIDUEL" in report_html
        body_ok_categorie = "RAPPORT DE PERFORMANCE - CATÉGORIE" in report_html
        print(f"    - '{target_vendeur}' in body: {body_ok_vendeur}")
        print(f"    - 'RAPPORT DE PERFORMANCE INDIVIDUEL' in body: {body_ok_individual}")
        print(f"    - 'RAPPORT DE PERFORMANCE - CATÉGORIE' in body: {body_ok_categorie}")
        assert body_ok_vendeur, f"Expected '{target_vendeur}' in report body"
        assert body_ok_individual, "Expected INDIVIDUEL report (not CATEGORIE)"
        assert not body_ok_categorie, "Report should NOT be a CATEGORIE report"

        # Phrase check
        phrase_present = (
            f"le vendeur {target_vendeur}" in report_html
            or f"vendeur {target_vendeur}" in report_html
        )
        print(f"    - 'le vendeur {target_vendeur}' phrase: {phrase_present}")
        assert phrase_present, f"Expected 'le vendeur {target_vendeur}' phrase"

        # Check for the comparison section 1.5 (this is expected/normal)
        has_comparison = "1.5" in report_html and "Comparaison agence" in report_html
        print(f"    - 'Comparaison agence' section 1.5: {has_comparison} (expected: True)")

        # Step 20: network log check
        print(f"\n[3] Network log:")
        for entry in network_log:
            print(f"    {entry['method']} {entry['url']}")

        report_calls = [e for e in network_log if "/api/generate_report" in e["url"]]
        print(f"\n    /api/generate_report calls: {len(report_calls)}")
        assert len(report_calls) >= 1, "Expected at least one call to /api/generate_report"

        report_url = report_calls[0]["url"]
        print(f"    URL: {report_url}")
        url_has_vendeur = "vendeur=" in report_url
        url_has_category_chakib = "category=Chakib" in report_url or "category=Chakib%20Equipe" in report_url
        print(f"    Contains 'vendeur=': {url_has_vendeur}")
        print(f"    Contains 'category=Chakib' (should be False): {url_has_category_chakib}")
        assert url_has_vendeur, f"Expected 'vendeur=' in URL: {report_url}"
        assert not url_has_category_chakib, (
            f"BUG STILL PRESENT: URL still contains 'category=Chakib': {report_url}"
        )

        # Verify the vendeur in the URL matches what we selected
        import re
        m = re.search(r"vendeur=([^&]+)", report_url)
        if m:
            url_vendeur = m.group(1)
            print(f"    vendeur in URL: '{url_vendeur}'")
            # URL-decode for comparison
            from urllib.parse import unquote
            decoded = unquote(url_vendeur)
            print(f"    URL-decoded: '{decoded}'")
            assert decoded == target_vendeur, (
                f"vendeur in URL ({decoded!r}) doesn't match selected ({target_vendeur!r})"
            )

        # Step 21: console errors
        print(f"\n[4] Console errors/warnings:")
        for e in console_errors:
            print(f"    {e}")
        # Filter out expected "Live reload check" debug messages
        real_errors = [e for e in console_errors if "Live reload" not in e]
        if real_errors:
            print(f"\n    {len(real_errors)} real error(s)/warning(s) detected:")
            for e in real_errors:
                print(f"      {e}")
        else:
            print("    No real errors detected")

        print()
        print("=" * 60)
        print("RESULT: ✅ ALL CHECKS PASSED")
        print("=" * 60)

        browser.close()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n❌ ASSERTION FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n❌ ERROR: {e}")
        sys.exit(2)
