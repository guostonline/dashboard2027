# -*- coding: utf-8 -*-
"""MADEC Stock Sync - Streamlit app"""

import datetime
import pathlib

import pandas as pd
import streamlit as st

# --- Paths ---
THIS_DIR   = pathlib.Path(__file__).parent
ROOT_DIR   = THIS_DIR.parent
TOKEN_PATH = ROOT_DIR / "token.json"

# --- Google Sheets config ---
SPREADSHEET_ID = "17Q3DoTjLdGwAmztk3LWaC2Z69_ZrGYlAsLHXTusrHIk"
SHEET_NAME     = "STock Speed-X3"
SCOPES         = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.modify"
]

# --- Page config ---
st.set_page_config(
    page_title="MADEC Stock Sync",
    page_icon="📦",
    layout="centered",
)

# --- CSS ---
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

.stApp { background: #f6f8fa; color: #24292f; }

.top-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 1.4rem 0 1rem;
    border-bottom: 1px solid #d0d7de;
    margin-bottom: 1.8rem;
}
.top-bar h1 { font-size: 1.4rem; font-weight: 700; color: #0969da; margin: 0; }
.top-bar span { font-size: 0.85rem; color: #57606a; }

.count-row {
    display: flex;
    gap: 12px;
    margin: 1rem 0 0.6rem;
}
.chip {
    background: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 0.35rem 0.8rem;
    font-size: 0.8rem;
    color: #57606a;
}
.chip b { color: #24292f; }
</style>
""", unsafe_allow_html=True)

# --- Header ---
st.markdown("""
<div class="top-bar">
  <span style="font-size:1.8rem">📦</span>
  <div>
    <h1>Stock Sync</h1>
    <span>Upload Excel &rarr; Verifier &rarr; Envoyer vers Google Sheets</span>
  </div>
</div>
""", unsafe_allow_html=True)


# ===========================================================================
# Google Sheets helpers
# ===========================================================================

def _load_creds():
    import json
    import google.oauth2.credentials
    from google.auth.transport.requests import Request
    
    token_data = None
    
    # 1. Try loading from local file
    if TOKEN_PATH.exists():
        try:
            with open(TOKEN_PATH, "r") as f:
                token_data = json.load(f)
        except Exception:
            pass
            
    # 2. Try loading from Streamlit Secrets (for cloud deployment)
    if not token_data:
        try:
            if "google_token" in st.secrets:
                secret_val = st.secrets["google_token"]
                if isinstance(secret_val, str):
                    token_data = json.loads(secret_val)
                else:
                    token_data = dict(secret_val)
        except Exception:
            pass
            
    if not token_data:
        return None
        
    try:
        # Load credentials using the scopes present in the token to avoid ValueError
        token_scopes = token_data.get("scopes", SCOPES)
        creds = google.oauth2.credentials.Credentials.from_authorized_user_info(
            token_data, token_scopes
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Maintain the scopes list in refreshed token and save to file if local
            if TOKEN_PATH.exists():
                refreshed_data = json.loads(creds.to_json())
                if "scopes" not in refreshed_data:
                    refreshed_data["scopes"] = token_scopes
                TOKEN_PATH.write_text(json.dumps(refreshed_data))
        return creds
    except Exception:
        return None


def get_latest_excel_from_gmail():
    """Fetches the latest .xlsx / .xls attachment from Gmail."""
    import io
    import base64
    try:
        from googleapiclient.discovery import build
        
        creds = _load_creds()
        if not creds:
            return None, "Token Google introuvable. Authentifiez-vous d'abord.", None, None, None, None
            
        token_scopes = getattr(creds, "scopes", [])
        if "https://www.googleapis.com/auth/gmail.modify" not in token_scopes:
            return None, "Permissions Gmail manquantes. Veuillez supprimer 'token.json' et vous re-authentifier sur le dashboard principal.", None, None, None, None
            
        gmail_service = build("gmail", "v1", credentials=creds)
        
        # Search for messages with an Excel attachment matching "STock Speed-X3"
        query = 'has:attachment (filename:xlsx OR filename:xls) "STock Speed-X3"'
        results = gmail_service.users().messages().list(userId="me", q=query, maxResults=5).execute()
        messages = results.get("messages", [])
        
        if not messages:
            return None, "Aucun email avec fichier Excel (.xlsx / .xls) trouvé dans votre Gmail.", None, None, None, None
            
        for msg_summary in messages:
            msg_id = msg_summary["id"]
            message = gmail_service.users().messages().get(userId="me", id=msg_id).execute()
            
            payload = message.get("payload", {})
            headers = payload.get("headers", [])
            subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "Inconnu")
            date_str = next((h["value"] for h in headers if h["name"].lower() == "date"), "Inconnu")
            sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "Inconnu")
            
            parts = [payload]
            attachments = []
            
            # Recursive check to cover nested parts (e.g. multipart/mixed)
            while parts:
                part = parts.pop()
                if part.get("parts"):
                    parts.extend(part["parts"])
                fn = part.get("filename", "")
                if fn and (fn.lower().endswith(".xlsx") or fn.lower().endswith(".xls")):
                    att_id = part["body"].get("attachmentId")
                    if att_id:
                        attachments.append((fn, att_id))
            
            if attachments:
                filename, att_id = attachments[0]
                attachment = gmail_service.users().messages().attachments().get(
                    userId="me", messageId=msg_id, id=att_id
                ).execute()
                
                file_data = base64.urlsafe_b64decode(attachment["data"].encode("UTF-8"))
                return io.BytesIO(file_data), filename, subject, date_str, sender, msg_id
                
        return None, "Aucune pièce jointe Excel valide trouvée dans les derniers messages Gmail.", None, None, None, None
        
    except Exception as e:
        return None, f"Erreur Gmail : {e}", None, None, None, None


def send_telegram_notification(text, chat_id=None):
    """Sends a message via Telegram bot."""
    import requests
    import os
    import json
    token = "8932059052:AAEbwgRvpDlofG49OxY-9TWVdwT7MfaWdJk"
    
    # Try to load chat_id from environment or cache file if not provided
    if not chat_id:
        try:
            import pathlib
            from dotenv import load_dotenv
            load_dotenv(dotenv_path=pathlib.Path(__file__).parent.parent / ".env")
        except Exception:
            pass
            
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram_chat_cache.json")
        
        if not chat_id and os.path.exists(cache_path):
            try:
                with open(cache_path, "r") as f:
                    chat_id = json.load(f).get("chat_id")
            except Exception:
                pass
            
    # Fetch from getUpdates if not cached
    if not chat_id:
        try:
            res = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=5).json()
            results = res.get("result", [])
            if results:
                for r in reversed(results):
                    cid = r.get("message", {}).get("chat", {}).get("id") or r.get("my_chat_member", {}).get("chat", {}).get("id")
                    if cid:
                        chat_id = cid
                        try:
                            with open(cache_path, "w") as f:
                                json.dump({"chat_id": chat_id}, f)
                        except Exception:
                            pass
                        break
        except Exception:
            pass
            
    if chat_id:
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown"
            }
            requests.post(url, json=payload, timeout=5)
            return True
        except Exception:
            pass
    return False


def delete_gmail_message(msg_id):
    """Moves a Gmail message to trash."""
    try:
        from googleapiclient.discovery import build
        creds = _load_creds()
        if not creds:
            return False, "Token Google introuvable."
        gmail_service = build("gmail", "v1", credentials=creds)
        gmail_service.users().messages().trash(userId="me", id=msg_id).execute()
        return True, "Email déplacé vers la corbeille."
    except Exception as e:
        return False, f"Erreur lors de la suppression de l'email : {e}"


def sync_to_gsheet(df):
    """Push filtered df to Google Sheets. Returns (ok, message)."""
    try:
        from googleapiclient.discovery import build

        creds = _load_creds()
        if not creds:
            return False, "Token Google introuvable. Authentifiez-vous d'abord via le dashboard principal."

        service = build("sheets", "v4", credentials=creds)

        # Ensure sheet tab exists
        meta = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        existing = [s["properties"]["title"] for s in meta.get("sheets", [])]
        if SHEET_NAME not in existing:
            service.spreadsheets().batchUpdate(
                spreadsheetId=SPREADSHEET_ID,
                body={"requests": [{"addSheet": {"properties": {"title": SHEET_NAME}}}]},
            ).execute()

        headers = ["ACT CODE", "Site", "SOC", "Fournisseur", "GAMME",
                   "FAMILLE", "Produit", "DESIGNATION", "Statut", "STK QTE", "Source"]

        col_map = {}
        for h in headers:
            for c in df.columns:
                if c.strip().upper() == h.upper():
                    col_map[h] = c
                    break

        def safe_int(v):
            try: return int(v)
            except: return 0

        rows = [headers]
        for _, row in df.iterrows():
            rows.append([
                str(row.get(col_map.get("ACT CODE",  ""), "")).strip(),
                str(row.get(col_map.get("Site",       ""), "")).strip(),
                str(row.get(col_map.get("SOC",        ""), "")).strip(),
                str(row.get(col_map.get("Fournisseur",""), "")).strip(),
                str(row.get(col_map.get("GAMME",      ""), "")).strip(),
                str(row.get(col_map.get("FAMILLE",    ""), "")).strip(),
                str(row.get(col_map.get("Produit",    ""), "")).strip(),
                str(row.get(col_map.get("DESIGNATION",""), "")).strip(),
                str(row.get(col_map.get("Statut",     ""), "")).strip(),
                safe_int(row.get(col_map.get("STK QTE", ""), 0)),
                str(row.get(col_map.get("Source",     ""), "")).strip(),
            ])

        service.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID,
            range="'{}'!A1:Z20000".format(SHEET_NAME),
            body={},
        ).execute()

        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range="'{}'!A1".format(SHEET_NAME),
            valueInputOption="RAW",
            body={"values": rows},
        ).execute()

        msg = "{} articles envoyes vers '{}'.".format(len(rows) - 1, SHEET_NAME)
        send_telegram_notification(f"📦 *Stock Sync Successful*\n\n{msg}")

        return True, msg

    except Exception as e:
        return False, "Erreur : {}".format(e)


def prepare_df(file_obj):
    """Read and filter Excel to AG_AGDR rows only."""
    df = pd.read_excel(file_obj)
    df.columns = [c.strip() for c in df.columns]
    df = df.fillna("")

    act_col = next((c for c in df.columns if c.upper() == "ACT CODE"), None)
    if act_col:
        df = df[df[act_col].astype(str).str.strip() == "AG_AGDR"].reset_index(drop=True)

    return df


# Initialize session state variables for Gmail file caching
if "gmail_file_data" not in st.session_state:
    st.session_state.gmail_file_data = None
if "gmail_filename" not in st.session_state:
    st.session_state.gmail_filename = None
if "gmail_subject" not in st.session_state:
    st.session_state.gmail_subject = None
if "gmail_date" not in st.session_state:
    st.session_state.gmail_date = None
if "gmail_from" not in st.session_state:
    st.session_state.gmail_from = None
if "gmail_msg_id" not in st.session_state:
    st.session_state.gmail_msg_id = None

# ===========================================================================
# UI — Step 1: Select Source & Load File
# ===========================================================================

tab_local, tab_gmail = st.tabs(["📂 Fichier local", "✉ Import Gmail"])

uploaded = None

with tab_local:
    uploaded = st.file_uploader(
        "Choisissez un fichier Excel (.xlsx)",
        type=["xlsx", "xls"],
        label_visibility="collapsed",
        key="local_file_uploader_key"
    )

with tab_gmail:
    creds_checked = _load_creds()
    has_gmail_permission = False
    if creds_checked:
        token_scopes = getattr(creds_checked, "scopes", [])
        has_gmail_permission = "https://www.googleapis.com/auth/gmail.modify" in token_scopes
        
    if not has_gmail_permission:
        st.warning(
            "⚠️ **L'accès Gmail n'est pas encore autorisé.**\n\n"
            "**Si vous exécutez l'application en local :**\n"
            "1. Supprimez le fichier `token.json` du dossier principal de votre projet.\n"
            "2. Allez sur le dashboard Flask (http://127.0.0.1:5000/) → onglet **Stock** → cliquez sur **SYNC GOOGLE** pour vous ré-authentifier.\n\n"
            "**Si vous êtes sur Streamlit Cloud (Production) :**\n"
            "1. Ré-authentifiez-vous en local comme décrit ci-dessus.\n"
            "2. Ouvrez le nouveau fichier `token.json` généré en local et copiez tout son contenu.\n"
            "3. Allez sur la page de votre application sur le tableau de bord Streamlit Cloud → cliquez sur **Settings** → **Secrets** et collez-le de cette façon :\n"
            "```toml\n"
            "google_token = '''\n"
            "{\n"
            "  \"token\": \"ya29...\",\n"
            "  \"refresh_token\": \"1//0...\",\n"
            "  \"scopes\": [\"https://www.googleapis.com/auth/spreadsheets\", \"https://www.googleapis.com/auth/gmail.modify\"],\n"
            "  ...\n"
            "}\n"
            "'''\n"
            "```"
        )
    else:
        st.markdown(
            """
            <div style="font-size: 0.9rem; color: #57606a; margin-bottom: 1rem;">
                Recherche et télécharge automatiquement la pièce jointe Excel (.xlsx / .xls) la plus récente depuis votre boîte Gmail.
            </div>
            """,
            unsafe_allow_html=True
        )
        if st.button("📥 Récupérer le dernier fichier depuis Gmail", use_container_width=True):
            with st.spinner("Recherche et téléchargement du fichier Gmail..."):
                file_stream, res, subject, date_str, sender, msg_id = get_latest_excel_from_gmail()
            if file_stream:
                st.session_state.gmail_file_data = file_stream
                st.session_state.gmail_filename = res
                st.session_state.gmail_subject = subject
                st.session_state.gmail_date = date_str
                st.session_state.gmail_from = sender
                st.session_state.gmail_msg_id = msg_id
                st.success(f"Fichier récupéré avec succès : **{res}**")
                st.rerun()
            else:
                st.error(res)
                
        if st.session_state.gmail_file_data is not None:
            # Display email details in a beautiful card
            st.markdown(
                f"""
                <div style="border: 1px solid #d0d7de; border-radius: 6px; padding: 1.2rem; background: #ffffff; margin-bottom: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <h4 style="margin-top: 0; color: #0969da; font-size: 1.05rem;">✉️ Détails de l'e-mail stock</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; color: #24292f;">
                        <tr style="border-bottom: 1px solid #f6f8fa;">
                            <td style="padding: 6px 0; font-weight: 600; width: 30%;">Expéditeur :</td>
                            <td style="padding: 6px 0;">{st.session_state.gmail_from}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f6f8fa;">
                            <td style="padding: 6px 0; font-weight: 600;">Sujet :</td>
                            <td style="padding: 6px 0; font-weight: 500; color: #0969da;">{st.session_state.gmail_subject}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f6f8fa;">
                            <td style="padding: 6px 0; font-weight: 600;">Date :</td>
                            <td style="padding: 6px 0; color: #57606a;">{st.session_state.gmail_date}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600;">Fichier Excel :</td>
                            <td style="padding: 6px 0;"><code style="background: #afb8c133; padding: 2px 6px; border-radius: 4px;">{st.session_state.gmail_filename}</code></td>
                        </tr>
                    </table>
                </div>
                """,
                unsafe_allow_html=True
            )
            
            # Button to send to google sheets directly from Gmail import tab
            col1, col2 = st.columns([1, 1])
            with col1:
                if st.button("🚀 Synchroniser vers Google Sheets", type="primary", use_container_width=True, key="gmail_sync_primary"):
                    try:
                        st.session_state.gmail_file_data.seek(0)
                        df_gmail = prepare_df(st.session_state.gmail_file_data)
                        if df_gmail.empty:
                            st.warning("Aucune ligne avec ACT CODE = AG_AGDR trouvée dans ce fichier Gmail.")
                        else:
                            with st.spinner("Envoi vers Google Sheets..."):
                                ok, msg = sync_to_gsheet(df_gmail)
                                if ok:
                                    st.success("✅ " + msg)
                                    st.balloons()
                                    
                                    # Delete email containing the excel file
                                    if st.session_state.gmail_msg_id:
                                        del_ok, del_msg = delete_gmail_message(st.session_state.gmail_msg_id)
                                        if del_ok:
                                            st.info("✉️ L'email contenant le fichier Excel a été supprimé de votre boîte de réception (déplacé vers la corbeille).")
                                        else:
                                            st.warning(f"⚠️ Impossible de supprimer l'email : {del_msg}")
                                            
                                    # Send Telegram notification directly to user id 6095445790
                                    send_telegram_notification(
                                        f"✉️ *Gmail Stock Sync Successful*\n\n"
                                        f"• *Fichier* : `{st.session_state.gmail_filename}`\n"
                                        f"• *Sujet* : `{st.session_state.gmail_subject}`\n"
                                        f"• *Date* : `{st.session_state.gmail_date}`\n"
                                        f"• *Articles* : {len(df_gmail)}", 
                                        chat_id=6095445790
                                    )
                                    
                                    # Clear the loaded file from cache since it was synced and deleted
                                    st.session_state.gmail_file_data = None
                                    st.session_state.gmail_filename = None
                                    st.session_state.gmail_subject = None
                                    st.session_state.gmail_date = None
                                    st.session_state.gmail_from = None
                                    st.session_state.gmail_msg_id = None
                                    st.rerun()
                                else:
                                    st.error("❌ " + msg)
                    except Exception as ex:
                        st.error(f"Erreur de traitement : {ex}")
                        
            with col2:
                if st.button("🗑 Effacer le fichier Gmail", type="secondary", use_container_width=True):
                    st.session_state.gmail_file_data = None
                    st.session_state.gmail_filename = None
                    st.session_state.gmail_subject = None
                    st.session_state.gmail_date = None
                    st.session_state.gmail_from = None
                    st.session_state.gmail_msg_id = None
                    st.rerun()

# Resolve which data source to use
df = None
file_source_name = None

if uploaded is not None:
    # Clear Gmail cache if a new local file is uploaded
    st.session_state.gmail_file_data = None
    st.session_state.gmail_filename = None
    st.session_state.gmail_subject = None
    st.session_state.gmail_date = None
    st.session_state.gmail_from = None
    st.session_state.gmail_msg_id = None
    try:
        df = prepare_df(uploaded)
        file_source_name = uploaded.name
    except Exception as e:
        st.error(f"Impossible de lire le fichier local : {e}")
        st.stop()
elif st.session_state.gmail_file_data is not None:
    try:
        st.session_state.gmail_file_data.seek(0)
        df = prepare_df(st.session_state.gmail_file_data)
        file_source_name = f"Gmail: {st.session_state.gmail_filename}"
    except Exception as e:
        st.error(f"Impossible de lire le fichier Gmail : {e}")
        st.stop()

if df is None:
    st.markdown(
        """
        <div style="border:2px dashed #d0d7de; border-radius:10px; padding:3rem;
                    text-align:center; color:#57606a; margin-top:0.5rem; background: #ffffff;">
            <div style="font-size:2.5rem; margin-bottom:0.5rem;">📂</div>
            <div style="font-size:1rem; font-weight:600; color:#0969da;">
                Aucun fichier sélectionné
            </div>
            <div style="font-size:0.82rem; margin-top:0.3rem;">
                Veuillez glisser un fichier local dans l'onglet <strong>Fichier local</strong> ou récupérer un email via <strong>Import Gmail</strong>.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.stop()


# ===========================================================================
# UI — Step 2: Table with search + send button
# ===========================================================================

if df.empty:
    st.warning("Aucune ligne avec ACT CODE = AG_AGDR trouvée dans ce fichier.")
    st.stop()

total_rows = len(df)

# Stats row
st.markdown(
    '<div class="count-row">'
    '<div class="chip">Source : <b>{}</b></div>'
    '<div class="chip"><b>{}</b> articles AG_AGDR</div>'
    '<div class="chip">Aperçu : <b>25</b> premiers</div>'
    '<div class="chip">Cible : <b>{}</b></div>'
    '</div>'.format(file_source_name, total_rows, SHEET_NAME),
    unsafe_allow_html=True,
)

# Search box
search = st.text_input(
    "🔍 Rechercher dans le tableau",
    placeholder="Produit, désignation, famille...",
    label_visibility="collapsed",
)

# Filter + limit to 25
if search:
    mask = df.apply(
        lambda col: col.astype(str).str.contains(search, case=False, na=False)
    ).any(axis=1)
    display_df = df[mask].head(25)
else:
    display_df = df.head(25)

st.dataframe(
    display_df,
    use_container_width=True,
    height=420,
    hide_index=True,
)

if search and len(df[df.apply(lambda col: col.astype(str).str.contains(search, case=False, na=False)).any(axis=1)]) > 25:
    st.caption("Affichage limité à 25 résultats. Affinez votre recherche pour voir plus.")

st.markdown("<br>", unsafe_allow_html=True)

# ===========================================================================
# UI — Send button
# ===========================================================================

col_btn, col_info = st.columns([2, 3])
with col_btn:
    send = st.button(
        "📤  Envoyer vers Google Sheets",
        type="primary",
        use_container_width=True,
    )

with col_info:
    if TOKEN_PATH.exists():
        try:
            c = _load_creds()
            if c and c.valid:
                token_scopes = getattr(c, "scopes", [])
                has_sheets = "https://www.googleapis.com/auth/spreadsheets" in token_scopes
                has_gmail = "https://www.googleapis.com/auth/gmail.readonly" in token_scopes
                
                if has_sheets and has_gmail:
                    st.markdown(
                        '<span style="color:#2da44e; font-size:0.85rem; font-weight: 500;">✔ Accès Sheets & Gmail autorisé</span>',
                        unsafe_allow_html=True,
                    )
                elif has_sheets:
                    st.markdown(
                        '<span style="color:#d29922; font-size:0.85rem; font-weight: 500;">⚠️ Accès Sheets uniquement (Re-authentifiez-vous)</span>',
                        unsafe_allow_html=True,
                    )
                else:
                    st.markdown(
                        '<span style="color:#cf222e; font-size:0.85rem; font-weight: 500;">✘ Droits insuffisants (Re-authentifiez-vous)</span>',
                        unsafe_allow_html=True,
                    )
            else:
                st.markdown(
                    '<span style="color:#d29922; font-size:0.85rem; font-weight: 500;">⚠️ Token expiré — re-authentifiez-vous</span>',
                    unsafe_allow_html=True,
                )
        except Exception as e:
            st.markdown(
                f'<span style="color:#cf222e; font-size:0.85rem; font-weight: 500;">✘ Erreur token: {e}</span>',
                unsafe_allow_html=True,
            )
    else:
        st.markdown(
            '<span style="color:#cf222e; font-size:0.85rem; font-weight: 500;">'
            '✘ Pas de token — allez sur le dashboard Flask → Stock → SYNC GOOGLE'
            '</span>',
            unsafe_allow_html=True,
        )

if send:
    with st.spinner("Envoi vers Google Sheets..."):
        ok, msg = sync_to_gsheet(df)
    if ok:
        st.success("✅ " + msg)
        st.balloons()
    else:
        st.error("❌ " + msg)
