import base64
import requests
import csv
import io
from datetime import datetime

# Gitee Config
GITEE_TOKEN = "18b2f0102e5d7dd140726cd85d9b8bef"
REPO = "luke888888/shouji-kb"
LOG_PATH = "chat-logs"

def get_gitee_contents(path):
    url = f"https://gitee.com/api/v5/repos/{REPO}/contents/{path}"
    headers = {"Authorization": f"token {GITEE_TOKEN}"}
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()

def get_file_content(path):
    url = f"https://gitee.com/api/v5/repos/{REPO}/contents/{path}"
    headers = {"Authorization": f"token {GITEE_TOKEN}"}
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    return base64.b64decode(data['content']).decode('utf-8')

def format_chat_record(csv_content, filename):
    output = f"## 📱 Chat Session: {filename}\n\n"
    f = io.StringIO(csv_content)
    reader = csv.DictReader(f)
    
    for row in reader:
        try:
            # Parse timestamp
            dt = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
            time_str = dt.strftime('%Y-%m-%d %H:%M')
            
            role = row['role'].upper()
            msg = row['message']
            
            if role == 'USER':
                output += f"> **👤 User** ({time_str}):\n> {msg}\n\n"
            else:
                output += f"**🤖 SUNWEAVE AI** ({time_str}):\n{msg}\n\n---\n\n"
        except Exception as e:
            continue
    return output

def main():
    print("Fetching logs from Gitee...")
    try:
        files = get_gitee_contents(LOG_PATH)
        full_report = "# 🌐 SUNWEAVE AI Chat Export\n"
        full_report += f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        for file_info in files:
            if file_info['name'].endswith('.csv'):
                print(f"Processing {file_info['name']}...")
                content = get_file_content(file_info['path'])
                full_report += format_chat_record(content, file_info['name'])
        
        with open("chat_export_report.md", "w", encoding="utf-8") as f:
            f.write(full_report)
        print("Success! Exported to chat_export_report.md")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
