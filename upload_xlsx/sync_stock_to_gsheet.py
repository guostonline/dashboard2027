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
SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]

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

.stApp { background: #0d1117; color: #e6edf3; }

.top-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 1.4rem 0 1rem;
    border-bottom: 1px solid #21262d;
    margin-bottom: 1.8rem;
}
.top-bar h1 { font-size: 1.4rem; font-weight: 700; color: #58a6ff; margin: 0; }
.top-bar span { font-size: 0.85rem; color: #8b949e; }

.count-row {
    display: flex;
    gap: 12px;
    margin: 1rem 0 0.6rem;
}
.chip {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.35rem 0.8rem;
    font-size: 0.8rem;
    color: #8b949e;
}
.chip b { color: #e6edf3; }
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
    import google.oauth2.credentials
    from google.auth.transport.requests import Request
    if not TOKEN_PATH.exists():
        return None
    creds = google.oauth2.credentials.Credentials.from_authorized_user_file(
        str(TOKEN_PATH), SCOPES
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_PATH.write_text(creds.to_json())
    return creds


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

        return True, "{} articles envoyes vers '{}'.".format(len(rows) - 1, SHEET_NAME)

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


# ===========================================================================
# UI — Step 1: Upload
# ===========================================================================

uploaded = st.file_uploader(
    "Choisissez un fichier Excel (.xlsx)",
    type=["xlsx", "xls"],
    label_visibility="collapsed",
)

if uploaded is None:
    st.markdown(
        """
        <div style="border:2px dashed #30363d; border-radius:10px; padding:3rem;
                    text-align:center; color:#8b949e; margin-top:0.5rem;">
            <div style="font-size:2.5rem; margin-bottom:0.5rem;">📂</div>
            <div style="font-size:1rem; font-weight:600; color:#58a6ff;">
                Glissez votre fichier Excel ici
            </div>
            <div style="font-size:0.82rem; margin-top:0.3rem;">
                ou cliquez sur <em>Browse files</em> ci-dessus
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.stop()


# ===========================================================================
# UI — Step 2: Table with search + send button
# ===========================================================================

try:
    df = prepare_df(uploaded)
except Exception as e:
    st.error("Impossible de lire le fichier : {}".format(e))
    st.stop()

if df.empty:
    st.warning("Aucune ligne avec ACT CODE = AG_AGDR trouvee dans ce fichier.")
    st.stop()

total_rows = len(df)

# Stats row
st.markdown(
    '<div class="count-row">'
    '<div class="chip"><b>{}</b> articles AG_AGDR</div>'
    '<div class="chip">Apercu : <b>25</b> premiers</div>'
    '<div class="chip">Cible : <b>{}</b></div>'
    '</div>'.format(total_rows, SHEET_NAME),
    unsafe_allow_html=True,
)

# Search box
search = st.text_input(
    "🔍 Rechercher dans le tableau",
    placeholder="Produit, designation, famille...",
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
    st.caption("Affichage limite a 25 resultats. Affinez votre recherche pour voir plus.")

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
                st.markdown(
                    '<span style="color:#3fb950; font-size:0.85rem;">✔ Token Google valide</span>',
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    '<span style="color:#d29922; font-size:0.85rem;">⚠ Token expire — re-authentifiez-vous</span>',
                    unsafe_allow_html=True,
                )
        except:
            st.markdown(
                '<span style="color:#f85149; font-size:0.85rem;">✘ Erreur token</span>',
                unsafe_allow_html=True,
            )
    else:
        st.markdown(
            '<span style="color:#f85149; font-size:0.85rem;">'
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
