"""Take screenshots of the Client tab after the UI/UX fixes.

Captures:
  /tmp/clients-fixed-1.png             - Initial load
  /tmp/clients-fixed-2-advanced.png     - Advanced filters panel open
  /tmp/clients-fixed-3-dropdown.png     - VENDEUR SOM dropdown open
  /tmp/clients-fixed-4-search.png       - VENDEUR SOM dropdown with "boum" typed

Writes its textual report to C:/Users/DELL/dev/dashboard2027/file-only/clients-fix-report.md
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5099/clients"
REPORT_PATH = r"C:/Users/DELL/dev/dashboard2027/file-only/clients-fix-report.md"

console_messages = []
page_errors = []


def on_console(msg):
    console_messages.append(f"[{msg.type}] {msg.text}")


def on_pageerror(err):
    page_errors.append(str(err))


def describe_table(page):
    return page.evaluate("""() => {
        const ths = Array.from(document.querySelectorAll('#cf-table thead th'));
        const colCount = ths.length;
        const colNames = ths.map(th => th.textContent.replace(/\\s+/g, ' ').trim());
        const tr = document.querySelector('#cf-tbody tr');
        const firstRow = tr ? Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()) : [];
        const badge = document.getElementById('cf-table-badge')?.textContent.trim() || '';
        return { colCount, colNames, firstRow, badge };
    }""")


def describe_advanced_panel(page):
    return page.evaluate("""() => {
        const panel = document.getElementById('cf-advanced-panel');
        const visible = panel && getComputedStyle(panel).display !== 'none';
        const groups = Array.from(panel?.querySelectorAll('.filter-group') || []).map(g => {
            const lbl = g.querySelector('.tech-label')?.textContent.trim() || '';
            const tag = g.querySelector('select, .cf-multi-select, input')?.tagName || '';
            return { label: lbl, control: tag };
        });
        return { visible, groups };
    }""")


def describe_dropdown(page, sel):
    return page.evaluate("""(sel) => {
        const node = document.querySelector(sel);
        if (!node) return { error: 'not found' };
        const menu = node.querySelector('.cf-multi-menu');
        const menuVisible = menu && getComputedStyle(menu).display !== 'none';
        const opts = Array.from(node.querySelectorAll('.cf-multi-option')).map(o => {
            const cb = o.querySelector('input[type=checkbox]');
            const v = o.querySelector('span')?.textContent.trim() || '';
            return { value: v, visible: o.style.display !== 'none', checked: cb?.checked || false };
        });
        const visibleOpts = opts.filter(o => o.visible);
        return { menuVisible, totalOptions: opts.length, visibleCount: visibleOpts.length, options: opts };
    }""", sel)


def main():
    report_lines = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        page.goto(URL, wait_until="domcontentloaded")
        time.sleep(2.0)

        page.screenshot(path="/tmp/clients-fixed-1.png", full_page=True)
        info1 = describe_table(page)
        adv1 = describe_advanced_panel(page)
        report_lines.append("=== STEP 1 (initial load) ===")
        report_lines.append(f"Table cols ({info1['colCount']}): {info1['colNames']}")
        report_lines.append(f"First row: {info1['firstRow']}")
        report_lines.append(f"Badge: {info1['badge']}")
        report_lines.append(f"Advanced panel visible: {adv1['visible']}")

        page.click("#cf-toggle-advanced")
        time.sleep(0.5)
        page.screenshot(path="/tmp/clients-fixed-2-advanced.png", full_page=True)
        adv2 = describe_advanced_panel(page)
        report_lines.append("")
        report_lines.append("=== STEP 2 (advanced open) ===")
        report_lines.append(f"Advanced panel visible: {adv2['visible']}")
        report_lines.append(f"Number of filter groups: {len(adv2['groups'])}")
        for g in adv2['groups']:
            report_lines.append(f"  - {g['label']}  ({g['control']})")

        page.click('.cf-multi-select[data-filter="vendeurs_som"] .cf-multi-toggle')
        time.sleep(0.5)
        page.screenshot(path="/tmp/clients-fixed-3-dropdown.png", full_page=True)
        dd3 = describe_dropdown(page, '.cf-multi-select[data-filter="vendeurs_som"]')
        report_lines.append("")
        report_lines.append("=== STEP 3 (dropdown open) ===")
        report_lines.append(f"Menu visible: {dd3['menuVisible']}")
        report_lines.append(f"Total options: {dd3['totalOptions']}, visible: {dd3['visibleCount']}")
        for o in dd3['options']:
            report_lines.append(f"  - {o['value']!r}  visible={o['visible']}  checked={o['checked']}")

        page.fill('.cf-multi-select[data-filter="vendeurs_som"] .cf-multi-search', 'boum')
        time.sleep(0.5)
        page.screenshot(path="/tmp/clients-fixed-4-search.png", full_page=True)
        dd4 = describe_dropdown(page, '.cf-multi-select[data-filter="vendeurs_som"]')
        report_lines.append("")
        report_lines.append("=== STEP 4 (search 'boum') ===")
        report_lines.append(f"Menu visible: {dd4['menuVisible']}")
        report_lines.append(f"Total options: {dd4['totalOptions']}, visible: {dd4['visibleCount']}")
        for o in dd4['options']:
            report_lines.append(f"  - {o['value']!r}  visible={o['visible']}  checked={o['checked']}")

        report_lines.append("")
        report_lines.append("=== CONSOLE MESSAGES ===")
        if console_messages:
            for m in console_messages:
                report_lines.append(m)
        else:
            report_lines.append("(none)")

        report_lines.append("")
        report_lines.append("=== PAGE ERRORS ===")
        if page_errors:
            for e in page_errors:
                report_lines.append(e)
        else:
            report_lines.append("(none)")

        browser.close()

    # Write report to file
    import os
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    # Also print to console (ASCII-safe)
    for line in report_lines:
        try:
            print(line)
        except UnicodeEncodeError:
            print(line.encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    main()
