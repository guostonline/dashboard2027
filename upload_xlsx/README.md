# 📦 upload_xlsx — MADEC Stock Sync (Streamlit)

This folder contains:
- **`sync_stock_to_gsheet.py`** — Streamlit app that reads stock Excel files and syncs them to Google Sheets (same as the **SYNC GOOGLE** button in the main dashboard).
- **`requirements.txt`** — Python dependencies.
- Any `.xlsx` / `.xls` stock files you drop here will be auto-detected by the app.

---

## 🚀 Quick Start

### 1. Install dependencies (first time only)
```powershell
pip install -r requirements.txt
```

### 2. Make sure you're authenticated
Open the main dashboard (`http://127.0.0.1:5000`) → **Stock** tab → click **SYNC GOOGLE** once to complete the Google OAuth flow. This creates `token.json` in the project root. You only need to do this once.

### 3. Run the app
```powershell
cd C:\Users\DELL\Dev\dashboard2027\upload_xlsx
streamlit run sync_stock_to_gsheet.py
```
The browser will open automatically at `http://localhost:8501`.

---

## 📋 How it works

| Step | Action |
|------|--------|
| 1 | Drop your `.xlsx` stock file in this folder (or upload it in the app) |
| 2 | Select the file and a **stock date** |
| 3 | Click **🚀 Synchroniser vers Google Sheets** |
| 4 | The app filters rows to **ACT CODE = AG_AGDR**, then clears and rewrites the `STock Speed-X3` sheet in the configured spreadsheet |

---

## 🔧 Configuration

Edit the constants at the top of `sync_stock_to_gsheet.py`:
```python
SPREADSHEET_ID = "17Q3DoTjLdGwAmztk3LWaC2Z69_ZrGYlAsLHXTusrHIk"
SHEET_NAME     = "STock Speed-X3"
```
