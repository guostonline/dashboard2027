import os
import sys

def create_desktop_shortcut():
    try:
        desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
        project_dir = os.path.abspath(os.path.dirname(__file__))
        bat_file = os.path.join(project_dir, "RUN_APP.bat")
        shortcut_path = os.path.join(desktop_path, "Lancer Dashboard 2027.lnk")

        vbs_script = f"""
Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("{shortcut_path.replace('\\', '\\\\')}")
shortcut.TargetPath = "{bat_file.replace('\\', '\\\\')}"
shortcut.WorkingDirectory = "{project_dir.replace('\\', '\\\\')}"
shortcut.Description = "Lancer l'application MADEC KPI Dashboard 2027"
shortcut.WindowStyle = 1
shortcut.Save
"""
        vbs_path = os.path.join(project_dir, "temp_create_shortcut.vbs")
        with open(vbs_path, "w") as f:
            f.write(vbs_script)

        os.system(f'cscript //NoLogo "{vbs_path}"')

        if os.path.exists(vbs_path):
            os.remove(vbs_path)

        if os.path.exists(shortcut_path):
            print(f"[OK] Raccourci cree sur le Bureau: {shortcut_path}")
            return shortcut_path
        else:
            print("[INFO] Batch file cree avec succes dans le dossier du projet.")
    except Exception as e:
        print("Erreur creation raccourci:", e)
    return None

if __name__ == "__main__":
    create_desktop_shortcut()
