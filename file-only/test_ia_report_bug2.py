"""Test 2: Capture network calls to see what URL is sent"""
import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099/"
OUT_DIR = r"C:\Users\DELL\dev\dashboard2027\file-only\ia-bug-test"
os.makedirs(OUT_DIR, exist_ok=True)

network_calls = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 1000},
        )
        page = ctx.new_page()

        # Capture all network calls
        def on_request(req):
            if "/api/" in req.url:
                network_calls.append({
                    "method": req.method,
                    "url": req.url,
                    "post_data": req.post_data,
                    "resource_type": req.resource_type,
                })

        def on_response(resp):
            if "/api/generate_report" in resp.url:
                network_calls.append({
                    "type": "response",
                    "url": resp.url,
                    "status": resp.status,
                    "request_method": resp.request.method,
                })

        page.on("request", on_request)
        page.on("response", on_response)

        # Capture console
        def on_console(msg):
            try:
                print(f"  CONSOLE [{msg.type}]: {msg.text[:200]}")
            except Exception:
                pass

        def on_pageerror(err):
            print(f"  PAGE ERROR: {err}")

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # 1) Open dashboard
        page.goto(URL, wait_until="networkidle", timeout=20000)
        time.sleep(3)

        # 2) Click ANALYSE IA button (force click to avoid modal interception issues)
        print("=== Clicking ANALYSE IA ===")
        page.evaluate("""
            () => {
                const b = document.getElementById('ai-report-btn');
                if (b) b.click();
            }
        """)
        time.sleep(1.5)

        # 3) Verify modal is open
        is_open = page.evaluate("() => document.getElementById('vendeur-selection-modal').classList.contains('open')")
        print(f"Modal open: {is_open}")

        # 4) Click the dropdown toggle
        print("=== Clicking dropdown toggle ===")
        page.evaluate("() => document.getElementById('vendeur-dropdown-toggle').click()")
        time.sleep(1)

        # 5) Wait for items and click first (use JS click to bypass overlay issues)
        page.wait_for_selector(".dropdown-item", timeout=5000)
        items = page.query_selector_all(".dropdown-item")
        selected_vendeur = items[0].get_attribute("data-vendeur")
        print(f"Selected vendeur: {selected_vendeur}")
        # Use JS click to bypass any overlay
        page.evaluate("""
            () => {
                const items = document.querySelectorAll('.dropdown-item');
                if (items.length) items[0].click();
            }
        """)
        time.sleep(1)

        # 6) Verify selected display
        display_text = page.evaluate("""
            () => {
                const d = document.getElementById('selected-vendeur-text');
                return d ? d.textContent : null;
            }
        """)
        print(f"selected-vendeur-text: {display_text!r}")
        # Also check the JS variable
        js_vendeur = page.evaluate("() => selectedVendeurForReport")
        print(f"JS selectedVendeurForReport: {js_vendeur!r}")
        # And currentSelection
        js_curr = page.evaluate("() => JSON.stringify(currentSelection)")
        print(f"JS currentSelection: {js_curr!r}")

        # 7) Click GENERER LE RAPPORT
        print("=== Clicking GENERER LE RAPPORT ===")
        # Inject a small network monitor
        page.evaluate("""
            () => {
                window.__lastGenerateUrl = null;
                const origFetch = window.fetch;
                window.fetch = function(url, options) {
                    if (typeof url === 'string' && url.includes('generate_report')) {
                        window.__lastGenerateUrl = url;
                        console.log('GENERATE_REPORT URL:', url);
                    }
                    return origFetch.apply(this, arguments);
                };
            }
        """)
        page.evaluate("""
            () => {
                const b = document.getElementById('generate-vendeur-report-btn');
                if (b) b.click();
            }
        """)
        time.sleep(6)

        # Get the URL
        last_url = page.evaluate("() => window.__lastGenerateUrl")
        print(f"Last generate_report URL: {last_url!r}")

        # 8) Take screenshot
        page.screenshot(path=f"{OUT_DIR}/ia-debug-2-report.png", full_page=True)

        # 9) Save network calls
        with open(f"{OUT_DIR}/ia-network.txt", "w", encoding="utf-8") as f:
            f.write("=== Network calls (filtered to /api/) ===\n\n")
            for nc in network_calls:
                f.write(json.dumps(nc, ensure_ascii=False, indent=2) + "\n\n")

        print(f"\n=== {len(network_calls)} network calls captured ===")
        for nc in network_calls:
            if "generate_report" in str(nc.get("url", "")):
                print(json.dumps(nc, ensure_ascii=False))

        # 10) Get report content
        report = page.evaluate("""
            () => {
                const c = document.getElementById('report-content-wrapper');
                if (!c) return null;
                return c.textContent.substring(0, 500);
            }
        """)
        print(f"\n=== Report text (first 500 chars) ===\n{report}")

        # 11) Get title
        title = page.evaluate("""
            () => {
                const t = document.getElementById('report-modal-title');
                return t ? t.textContent : null;
            }
        """)
        print(f"\nReport title: {title!r}")

        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
