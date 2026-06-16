"""Test the AI report bug:
1. Open dashboard
2. Click ANALYSE IA
3. Select a vendeur
4. Click GENERER LE RAPPORT
5. Inspect the report
"""
import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099/"
# Save outputs into a path we know works on this Windows host
OUT_DIR = r"C:\Users\DELL\dev\dashboard2027\file-only\ia-bug-test"
os.makedirs(OUT_DIR, exist_ok=True)

console_messages = []
js_errors = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            ignore_https_errors=True,
        )
        page = ctx.new_page()

        # Capture console
        def on_console(msg):
            try:
                console_messages.append(f"[{msg.type}] {msg.text}")
            except Exception:
                pass

        def on_pageerror(err):
            js_errors.append(str(err))

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # 1) Open dashboard
        print("1) Opening dashboard...")
        page.goto(URL, wait_until="networkidle", timeout=20000)
        # 2) Wait 3s for dashboard
        time.sleep(3)

        # Take initial screenshot
        page.screenshot(path=f"{OUT_DIR}/ia-0-initial.png", full_page=False)
        print("   Initial screenshot saved")

        # 3) Click ANALYSE IA button
        print("3) Clicking ANALYSE IA button...")
        # First close any open modal (just in case)
        page.evaluate("""
            () => {
                document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
            }
        """)
        time.sleep(0.5)
        # Click by id with short timeout; if it fails the modal is already open
        try:
            page.click("#ai-report-btn", timeout=2000, force=True)
        except Exception as e:
            print(f"   First click failed (expected if modal already open): {e}")
        time.sleep(1.5)

        # 5) Screenshot the modal
        page.screenshot(path=f"{OUT_DIR}/ia-1-modal.png", full_page=False)
        print("   Modal screenshot saved")

        # Check modal is open
        modal_open = page.evaluate("""
            () => {
                const m = document.getElementById('vendeur-selection-modal');
                return m ? m.classList.contains('open') : null;
            }
        """)
        print(f"   Modal open: {modal_open}")

        # 6) Click on the dropdown toggle
        print("6) Clicking dropdown toggle...")
        try:
            page.click("#vendeur-dropdown-toggle", timeout=3000)
        except Exception as e:
            print(f"   Could not click #vendeur-dropdown-toggle: {e}")
            # Try by text
            page.get_by_text("Sélectionner un vendeur").first.click()
        time.sleep(1)

        # 8) Screenshot dropdown open
        page.screenshot(path=f"{OUT_DIR}/ia-2-dropdown.png", full_page=False)
        print("   Dropdown screenshot saved")

        # 9) Click on a vendeur item in the dropdown
        print("9) Clicking on a vendeur item...")
        # Wait for the dropdown items to be rendered
        page.wait_for_selector(".dropdown-item", timeout=5000)
        items = page.query_selector_all(".dropdown-item")
        print(f"   Found {len(items)} vendeur items")
        if not items:
            print("   No items found. Saving HTML for inspection.")
            html = page.content()
            with open(f"{OUT_DIR}/ia-debug-no-items.html", "w", encoding="utf-8") as f:
                f.write(html)
        else:
            # Click the first one
            selected_vendeur = items[0].get_attribute("data-vendeur")
            print(f"   Clicking vendeur: {selected_vendeur}")
            items[0].click()
            time.sleep(1)

            # 11) Verify the modal now shows the vendeur name
            display_text = page.evaluate("""
                () => {
                    const d = document.getElementById('selected-vendeur-text');
                    return d ? d.textContent.trim() : null;
                }
            """)
            print(f"   Selected display text: {display_text!r}")

            # Take screenshot after selecting
            page.screenshot(path=f"{OUT_DIR}/ia-2b-selected.png", full_page=False)

            # 12) Click GÉNÉRER LE RAPPORT
            print("12) Clicking GÉNÉRER LE RAPPORT...")
            try:
                # Check if button is enabled
                is_disabled = page.evaluate("""
                    () => {
                        const b = document.getElementById('generate-vendeur-report-btn');
                        return b ? b.disabled : null;
                    }
                """)
                print(f"   Generate button disabled: {is_disabled}")
                page.click("#generate-vendeur-report-btn", timeout=3000)
            except Exception as e:
                print(f"   Error clicking: {e}")
                # Try by text
                page.get_by_text("GÉNÉRER LE RAPPORT", exact=False).first.click()

            # 13) Wait 5s for report
            print("13) Waiting 5s for report...")
            time.sleep(5)

            # 14) Full-page screenshot
            page.screenshot(path=f"{OUT_DIR}/ia-3-report.png", full_page=True)
            print("   Report screenshot saved")

            # 15) Extract report text
            print("15) Extracting report text...")
            report_html = page.evaluate("""
                () => {
                    const c = document.getElementById('report-content-wrapper');
                    if (!c) return null;
                    return {
                        visible: c.style.display !== 'none',
                        textContent: c.textContent,
                        innerHTML: c.innerHTML,
                    };
                }
            """)
            if report_html:
                with open(f"{OUT_DIR}/ia-report.txt", "w", encoding="utf-8") as f:
                    f.write("=== Visible: " + str(report_html['visible']) + " ===\n\n")
                    f.write("=== Text content ===\n")
                    f.write(report_html['textContent'])
                    f.write("\n\n=== Inner HTML (truncated to 3000) ===\n")
                    f.write(report_html['innerHTML'][:3000])
                print("   Report text saved")
            else:
                print("   No report content found")

            # 16) Save selected vendeur
            with open(f"{OUT_DIR}/ia-selected-vendeur.txt", "w", encoding="utf-8") as f:
                f.write(f"Selected vendeur: {selected_vendeur}\n")
            print(f"   Selected vendeur: {selected_vendeur}")

        # 19) Console messages
        print("\n=== Console messages ===")
        for m in console_messages[-30:]:
            print(m)
        print("\n=== JS errors ===")
        for e in js_errors:
            print(e)

        # Save console log
        with open(f"{OUT_DIR}/ia-console.txt", "w", encoding="utf-8") as f:
            f.write("=== Console ===\n")
            for m in console_messages:
                f.write(m + "\n")
            f.write("\n=== JS errors ===\n")
            for e in js_errors:
                f.write(e + "\n")

        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
