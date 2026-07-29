"""應用程式、資料來源與路徑設定。"""

from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[1]

GOOGLE_SHEET_ID = "1MTPfTw0i-DWZbNzfXtKUOS56UI_xaedKIAzM9E7ecD4"
CASE_SHEET_GID = "1219451878"
CASE_SHEET_CSV_URL = (
    f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}"
    f"/export?format=csv&gid={CASE_SHEET_GID}"
)

LOCAL_TIMEZONE = ZoneInfo("Asia/Taipei")
DATETIME_DISPLAY_FORMAT = "%Y-%m-%d %H:%M"
CACHE_TTL_SECONDS = 60
CASES_PER_PAGE = 10

PAGE_TITLE = "進出異常案件 Follow 看板"
PAGE_LAYOUT = "wide"
