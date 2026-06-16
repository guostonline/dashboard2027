"""Verify the new single-column layout on the Tableau de bord."""
from playwright.sync_api import sync_playwright
import os
import sys

OUTPUT_DIR = "C:/Users/DELL/dev/dashboard2027/file-only"
os.makedirs(OUTPUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    # Step 1: Open the dashboard
    page.goto("http://127.0.0.1:5099/", wait_until="networkidle", timeout=30000)

    # Step 3: Wait 3 seconds for charts to render
    page.wait_for_timeout(3000)

    # Step 4: Full-page screenshot
    full_page_path = "/tmp/dashboard-1-fullpage.png"
    page.screenshot(path=full_page_path, full_page=True)
    print(f"[OK] Saved full-page screenshot: {full_page_path}")

    # Step 5: Viewport screenshot
    viewport_path = "/tmp/dashboard-2-viewport.png"
    page.screenshot(path=viewport_path, full_page=False)
    print(f"[OK] Saved viewport screenshot: {viewport_path}")

    # Step 6: Inspect the layout structure
    layout_info = page.evaluate("""() => {
        const grid = document.querySelector('.layout-grid');
        const left = document.querySelector('.layout-left');
        const right = document.querySelector('.layout-right');
        const charts = document.querySelectorAll('.layout-left .chart-card');
        const focus = document.querySelector('#focus-card');
        const tables = document.querySelectorAll('.layout-right .table-card, .layout-right .focus-card');
        const sidebar = document.querySelector('.cyber-sidebar');
        const header = document.querySelector('.cyber-header');
        const mainContent = document.querySelector('.main-content');

        // Get bounding boxes
        const getRect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        };

        return {
            grid: getRect(grid),
            gridStyle: grid ? getComputedStyle(grid).gridTemplateColumns : null,
            left: getRect(left),
            right: getRect(right),
            charts: Array.from(charts).map(c => ({
                id: c.id,
                rect: getRect(c)
            })),
            focus: getRect(focus),
            tables: Array.from(tables).map(t => ({
                id: t.id,
                rect: getRect(t)
            })),
            sidebar: getRect(sidebar),
            header: getRect(header),
            mainContent: getRect(mainContent),
            viewport: { width: window.innerWidth, height: window.innerHeight }
        };
    }""")

    print("\n=== LAYOUT INSPECTION ===")
    print(f"Viewport: {layout_info['viewport']}")
    print(f"\nGrid template columns: {layout_info['gridStyle']}")
    print(f"Grid rect: {layout_info['grid']}")
    print(f"\nLeft column rect: {layout_info['left']}")
    print(f"Right column rect: {layout_info['right']}")
    print(f"\nSidebar rect: {layout_info['sidebar']}")
    print(f"Header rect: {layout_info['header']}")
    print(f"Main content rect: {layout_info['mainContent']}")

    print("\n=== CHARTS (in left column) ===")
    for c in layout_info['charts']:
        print(f"  {c['id']:30s} x={c['rect']['x']:.0f}  y={c['rect']['y']:.0f}  w={c['rect']['width']:.0f}  h={c['rect']['height']:.0f}")

    print("\n=== FOCUS + TABLES (in right column) ===")
    for t in layout_info['tables']:
        print(f"  {t['id']:30s} x={t['rect']['x']:.0f}  y={t['rect']['y']:.0f}  w={t['rect']['width']:.0f}  h={t['rect']['height']:.0f}")

    # Determine if the layout is single-column
    left = layout_info['left']
    right = layout_info['right']
    is_single_column = (right is not None and left is not None and
                       (right['y'] > left['y'] + left['height'] - 50))
    is_centered = (left is not None and (left['x'] > 100))
    print(f"\n=== LAYOUT VERDICT ===")
    print(f"Single column (right below left): {is_single_column}")
    print(f"Content is centered (margin on left > 100px): {is_centered}")
    print(f"Max content width: ~{left['width']:.0f}px (should be ~1100)")

    # Element order
    print(f"\n=== ELEMENT ORDER (top to bottom) ===")
    elements = []
    for c in layout_info['charts']:
        elements.append((c['rect']['y'], c['id'], 'chart'))
    if layout_info['focus']:
        elements.append((layout_info['focus']['y'], 'focus-card', 'focus'))
    for t in layout_info['tables']:
        if t['id'] != 'focus-card':
            elements.append((t['rect']['y'], t['id'], 'table'))
    elements.sort()
    for y, name, kind in elements:
        print(f"  y={y:6.0f}  {name:30s}  ({kind})")

    # Check empty space on sides
    if left:
        left_space = left['x']
        right_space = layout_info['viewport']['width'] - (left['x'] + left['width'])
        print(f"\nEmpty space: left={left_space:.0f}px  right={right_space:.0f}px")

    # Capture element order via DOM
    dom_order = page.evaluate("""() => {
        const order = [];
        document.querySelectorAll('.layout-grid > div > .cyber-card, .layout-grid > .cyber-card').forEach((el, i) => {
            const title = el.querySelector('.card-header .tech-label')?.textContent?.trim() || el.id || 'unknown';
            order.push({ idx: i, id: el.id, title: title.substring(0, 60) });
        });
        // Also include the focus card (which is inside layout-right)
        return order;
    }""")
    print(f"\n=== DOM ORDER (in document flow) ===")
    for el in dom_order:
        print(f"  [{el['idx']}] {el['id'] or '(no id)':30s}  {el['title']}")

    # Copy screenshots to file-only
    import shutil
    shutil.copy(full_page_path, os.path.join(OUTPUT_DIR, "dashboard-1-fullpage.png"))
    shutil.copy(viewport_path, os.path.join(OUTPUT_DIR, "dashboard-2-viewport.png"))
    print(f"\n[OK] Screenshots copied to {OUTPUT_DIR}")

    browser.close()
print("\n=== DONE ===")
