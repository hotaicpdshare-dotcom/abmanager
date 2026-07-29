"""案件逾期規則。

正式門檻尚未確認，因此預設不套用任何時數。
"""

from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum


class OverdueStatus(StrEnum):
    """看板使用的逾期結果。"""

    NORMAL = "NORMAL"
    WARNING = "WARNING"
    OVERDUE = "OVERDUE"


@dataclass(frozen=True)
class OverdueRule:
    """單一逾期門檻設定。"""

    warning_after: timedelta | None
    overdue_after: timedelta | None


# TODO: 待現場確認正式門檻後，填入 timedelta(hours=...)。
DEFAULT_OVERDUE_RULE = OverdueRule(
    warning_after=None,
    overdue_after=None,
)

# TODO: 若不同異常類型有不同門檻，可在此加入「異常類型: OverdueRule」。
OVERDUE_RULES_BY_ABNORMAL_TYPE: dict[str, OverdueRule] = {}
