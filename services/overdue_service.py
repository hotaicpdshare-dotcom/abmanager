"""案件逾期狀態判斷。"""

from datetime import timedelta

from config.overdue_rules import (
    DEFAULT_OVERDUE_RULE,
    OVERDUE_RULES_BY_ABNORMAL_TYPE,
    OverdueRule,
    OverdueStatus,
)


def get_overdue_rule(abnormal_type: str) -> OverdueRule:
    """取得異常類型規則；未設定時使用預設規則。"""
    return OVERDUE_RULES_BY_ABNORMAL_TYPE.get(
        abnormal_type,
        DEFAULT_OVERDUE_RULE,
    )


def determine_overdue_status(
    elapsed_seconds: int | None,
    abnormal_type: str,
) -> OverdueStatus:
    """依等待時間與設定檔門檻回傳 NORMAL、WARNING 或 OVERDUE。"""
    if elapsed_seconds is None:
        return OverdueStatus.NORMAL

    rule = get_overdue_rule(abnormal_type)
    elapsed = timedelta(seconds=elapsed_seconds)

    if rule.overdue_after is not None and elapsed >= rule.overdue_after:
        return OverdueStatus.OVERDUE
    if rule.warning_after is not None and elapsed >= rule.warning_after:
        return OverdueStatus.WARNING
    return OverdueStatus.NORMAL
