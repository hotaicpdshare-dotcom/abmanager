"""畫面文字與尚待確認的案件對照設定。"""

APP_TITLE = "進出異常案件 Follow 看板"

ALL_FILTER = "全部"
DATA_ERROR_TEXT = "資料錯誤"

STAGE_ORDER: tuple[str, ...] = (
    "待處理",
    "處理中",
    "處理結果",
)

ON_SITE_UNAVAILABLE_TEXT = "未開放"
ON_SITE_CLOSED_TEXT = "已結案"

# CASE 工作表 FINAL_RESOLUTION 的正式選項。
# 只要欄位已有值，前處理第三節點就顯示該處理結果。
FINAL_RESOLUTION_OPTIONS: tuple[str, ...] = (
    "零件放入儲位",
    "確認溢品",
    "重新丈量",
    "請資訊部修正異常系統資料",
)

# 只有下列最終處理方式會進入待上架清單，現場處理指示才讀取
# CASE 工作表的 SHELVING_STATUS。
SHELVING_ENABLED_FINAL_RESOLUTIONS: frozenset[str] = frozenset(
    {
        "重新丈量",
        "請資訊部修正異常系統資料",
    }
)

SORT_OVERDUE_FIRST = "逾期優先"
SORT_WAITING_LONGEST = "等待時間長→短"
SORT_NEWEST_FIRST = "異常發生時間新→舊"
SORT_OPTIONS: tuple[str, ...] = (
    SORT_OVERDUE_FIRST,
    SORT_WAITING_LONGEST,
    SORT_NEWEST_FIRST,
)

OVERDUE_FILTER_LABELS: dict[str, str] = {
    "ALL": "全部狀態",
    "NORMAL": "正常",
    "WARNING": "提醒",
    "OVERDUE": "逾期",
}

# 第一版的異常類型直接顯示 CASE 工作表的 SITUATION。
# TODO: 待使用者提供異常類型對照表後，再於 config 新增轉換規則。

# TODO: 異常類型對應的 SOP 尚未確認。
SOP_BY_ABNORMAL_TYPE: dict[str, str] = {}
