import sys
import pywhatkit
import time
import os

def send_image(phone, image_path):
    print(f"Starting WhatsApp send task to {phone} for image {image_path}...")
    
    # Sanitize phone number: ensure country code (default to Morocco +212 if not present and starts with 06/07/05)
    phone_clean = phone.strip().replace(" ", "").replace("-", "")
    if not phone_clean.startswith("+"):
        if phone_clean.startswith("0"):
            phone_clean = "+212" + phone_clean[1:]
        elif phone_clean.startswith("212"):
            phone_clean = "+" + phone_clean
        else:
            # Fallback Moroccan prefix
            phone_clean = "+212" + phone_clean
            
    if not os.path.exists(image_path):
        print(f"Error: Image path {image_path} does not exist!")
        sys.exit(1)
        
    try:
        # Send image via pywhatkit (opens browser, waits 15s to load WA Web, attaches image, sends, closes tab after 3s)
        caption = "Bonjour, Veuillez trouver ci-joint votre rapport de performance du jour."
        print(f"Sending image to {phone_clean}...")
        pywhatkit.sendwhats_image(
            receiver=phone_clean,
            img_path=image_path,
            caption=caption,
            wait_time=30,  # Slightly higher load buffer time for reliability
            tab_close=True,
            close_time=4
        )
        print("WhatsApp image sent successfully!")
    except Exception as e:
        print(f"Error sending WhatsApp message: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python send_whatsapp.py <phone> <image_path>")
        sys.exit(1)
        
    phone_num = sys.argv[1]
    img = sys.argv[2]
    send_image(phone_num, img)
