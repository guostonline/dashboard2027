import sys
import os
import time
import socket
import webbrowser
import threading

sys.path.insert(0, '.')
from app import app

def open_browser_when_ready():
    url = "http://127.0.0.1:5000"
    print("[+] Waiting for Flask server on port 5000 to be ready...")
    for _ in range(40):
        try:
            with socket.create_connection(("127.0.0.1", 5000), timeout=1):
                print(f"[OK] Server is active! Opening browser at {url}...")
                time.sleep(0.8)
                webbrowser.open(url)
                break
        except (OSError, ConnectionRefusedError):
            time.sleep(0.5)

if __name__ == '__main__':
    threading.Thread(target=open_browser_when_ready, daemon=True).start()
    print("[+] Starting MADEC KPI Analytics Server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False, threaded=True)
