import sys
import json
import os
import sqlite3
import asyncio
import time
from PIL import Image
from playwright.async_api import async_playwright
import pywhatkit

# Confirmed by WhatsApp Web: these telephone numbers are not WhatsApp accounts.
# Keep the number in the FDV phone book, but do not open a blocking send dialog
# during a bulk campaign. Remove an entry once a verified WhatsApp number is set.
UNREGISTERED_WHATSAPP_NUMBERS = {"212626508898"}
REPORT_IMAGE_SCALE = 0.8

def reduce_report_image(img_path):
    """Export the captured report at 80% of its original dimensions."""
    with Image.open(img_path) as image:
        original_size = image.size
        resized_size = tuple(max(1, round(dimension * REPORT_IMAGE_SCALE)) for dimension in original_size)
        resized = image.resize(resized_size, Image.Resampling.LANCZOS)
        resized.save(img_path, format="PNG", optimize=True)
    print(f"Report image resized from {original_size[0]}x{original_size[1]} to {resized_size[0]}x{resized_size[1]}.")

def normalize_phone(raw_phone):
    """Return a Moroccan E.164 phone number, or None when it is malformed."""
    digits = "".join(ch for ch in str(raw_phone or "") if ch.isdigit())
    if digits.startswith("0"):
        digits = "212" + digits[1:]
    elif not digits.startswith("212"):
        digits = "212" + digits

    # Morocco: country code 212 plus a nine-digit mobile number.
    if len(digits) != 12 or digits[3] not in {"5", "6", "7"}:
        return None
    return "+" + digits

def get_vendeur_phone(vendeur):
    try:
        conn = sqlite3.connect("database.db")
        cursor = conn.cursor()
        cursor.execute("SELECT whatsapp, telephone FROM fdv WHERE vendeur = ?", (vendeur,))
        row = cursor.fetchone()
        conn.close()
        if row:
            raw_phone = row[0] or row[1] or ""
            phone_clean = normalize_phone(raw_phone)
            if phone_clean and phone_clean[1:] in UNREGISTERED_WHATSAPP_NUMBERS:
                print(f"Skipping {vendeur}: {phone_clean} is not registered on WhatsApp.")
                return None
            return phone_clean
    except Exception as e:
        print(f"Error fetching phone for {vendeur}: {e}")
    return None

async def capture_vendeur_card(vendeur, date, img_path):
    print(f"Capturing card for {vendeur}...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Navigate to dashboard
        url = f"http://127.0.0.1:5000/rapport?date={date}"
        await page.goto(url)
        
        # Wait for generate button
        await page.wait_for_selector("#generate-vendeur-report-btn", state="visible", timeout=20000)
        
        # Execute JS to select vendor and click generate in mini format
        await page.evaluate(f"""() => {{
            if (typeof selectVendeur === 'function') {{
                selectVendeur("{vendeur}");
            }}
            const htTax = document.getElementById("report-tax-mode-ht");
            if (htTax && !htTax.checked) htTax.click();
            const miniBtn = document.querySelector(".report-format-btn[data-format='mini']");
            if (miniBtn) miniBtn.click();
            const genBtn = document.getElementById("generate-vendeur-report-btn");
            if (genBtn) genBtn.click();
        }}""")
        
        # Wait for card rendering to finish
        await page.wait_for_selector("#wa-ca-raf", state="visible", timeout=60000)
        await asyncio.sleep(3)
        
        # Capture element screenshot
        element = page.locator("#whatsapp-mini-image-template")
        await element.screenshot(path=img_path)
        reduce_report_image(img_path)
        await browser.close()
    print(f"Card captured successfully for {vendeur}!")

def send_whatsapp_image_with_retry(phone, img_path, caption):
    print(f"Sending image via PyWhatKit to {phone}...")
    pywhatkit.sendwhats_image(
        receiver=phone,
        img_path=img_path,
        caption=caption,
        wait_time=30,
        tab_close=True,
        close_time=4
    )
    print(f"Message sent to {phone}!")

async def main():
    if len(sys.argv) < 2:
        print("Usage: python send_bulk_whatsapp_task.py <json_path>")
        sys.exit(1)
        
    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"Error: JSON file {json_path} not found.")
        sys.exit(1)
        
    with open(json_path, "r", encoding="utf-8") as f:
        task_data = json.load(f)
        
    vendeurs = task_data.get("vendeurs", [])
    date = task_data.get("date", "")
    
    print(f"Starting bulk send task for {len(vendeurs)} vendeurs...")
    
    os.makedirs("excel", exist_ok=True)
    img_path = os.path.abspath("excel/bulk_vendeur_temp.png")
    
    for idx, vendeur in enumerate(vendeurs):
        print(f"[{idx+1}/{len(vendeurs)}] Processing {vendeur}...")
        
        # 1. Fetch phone
        phone = get_vendeur_phone(vendeur)
        if not phone:
            print(f"Skipping {vendeur}: No phone number found in database.")
            continue
            
        try:
            # 2. Capture screenshot
            await capture_vendeur_card(vendeur, date, img_path)
            
            # 3. Send WhatsApp
            caption = f"Bonjour {vendeur}, Veuillez trouver ci-joint votre rapport de performance du jour."
            send_whatsapp_image_with_retry(phone, img_path, caption)
            
            # 4. Wait 30 seconds to avoid overlapping browser windows and allow browser tab to close properly
            if idx < len(vendeurs) - 1:
                print("Waiting 30 seconds before the next vendor...")
                await asyncio.sleep(30)
                
        except Exception as e:
            print(f"Error sending message to {vendeur}: {e}")
            if idx < len(vendeurs) - 1:
                print("Waiting 30 seconds after error before the next vendor...")
                await asyncio.sleep(30)
                
    print("Bulk envoi task completed successfully!")
    
    # Cleanup json file
    try:
        os.remove(json_path)
    except:
        pass

if __name__ == "__main__":
    asyncio.run(main())
