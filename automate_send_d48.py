import asyncio
from playwright.async_api import async_playwright
import pywhatkit
import time
import os

async def capture_and_send():
    print("Launching Playwright to render D48 preview card...")
    async with async_playwright() as p:
        # Launch browser (use non-headless or headless; headless=True is fine since Flask serves it)
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Navigate to the local dashboard rapport page
        url = "http://127.0.0.1:5000/rapport"
        print(f"Navigating to {url}...")
        await page.goto(url)
        
        # Wait for generate button to be visible
        await page.wait_for_selector("#generate-vendeur-report-btn", state="visible", timeout=20000)
        
        # Execute JS to select vendedor, format, and generate the report
        print("Selecting vendor 'D48 IBACH MOHAMED' and mini format...")
        await page.evaluate("""() => {
            if (typeof selectVendeurForReport === 'function') {
                selectVendeurForReport("D48 IBACH MOHAMED");
            }
            
            const miniBtn = document.querySelector(".report-format-btn[data-format='mini']");
            if (miniBtn) {
                miniBtn.click();
            }
            
            const genBtn = document.getElementById("generate-vendeur-report-btn");
            if (genBtn) {
                genBtn.click();
            }
        }""")
        
        print("Waiting for Reste / Jour values and mini image template to be visible...")
        # Wait for the template card content to be rendered (value inside card populated)
        await page.wait_for_selector("#wa-ca-raf", state="visible", timeout=60000)
        
        # Wait an extra 2 seconds to make sure any animations or network requests are finished
        await asyncio.sleep(3)
        
        os.makedirs("excel", exist_ok=True)
        img_path = os.path.abspath("excel/temp_wa_card.png")
        
        # Take a screenshot of the card
        print(f"Capturing screenshot of #whatsapp-mini-image-template to {img_path}...")
        element = page.locator("#whatsapp-mini-image-template")
        await element.screenshot(path=img_path)
        await browser.close()
        
    print("Image captured successfully. Triggering pywhatkit transfer...")
    
    # Phone number of D48 IBACH MOHAMED
    phone = "+212654076929"
    caption = "Bonjour, Veuillez trouver ci-joint votre rapport de performance du jour."
    
    try:
        pywhatkit.sendwhats_image(
            receiver=phone,
            img_path=img_path,
            caption=caption,
            wait_time=30,
            tab_close=True,
            close_time=4
        )
        print("WhatsApp message automation triggered successfully!")
    except Exception as e:
        print(f"Automation failed: {e}")

if __name__ == "__main__":
    asyncio.run(capture_and_send())
