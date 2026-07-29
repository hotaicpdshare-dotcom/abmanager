"""服務層輸出的看板資料模型。"""

from dataclasses import dataclass
from datetime import datetime

from config.overdue_rules import OverdueStatus


@dataclass(frozen=True)
class StageNode:
    """前處理進度節點。"""

    label: str
    state: str


@dataclass(frozen=True)
class DashboardCase:
    """UI 顯示所需的單一案件資料。"""

    case_no: str
    block: str
    part_no: str
    cart_no: str
    quantity: str
    abnormal_type: str
    occurred_at_text: str
    current_stage: str
    stage_nodes: tuple[StageNode, ...]
    on_site_instruction: str
    waiting_time_text: str
    waiting_seconds: int | None
    overdue_status: OverdueStatus
    handler: str
    product_type: str
    location_text: str
    sop_text: str
    note: str
    data_errors: tuple[str, ...]
    occurred_at: datetime | None


@dataclass(frozen=True)
class DashboardSnapshot:
    """一次資料讀取後的完整看板快照。"""

    cases: tuple[DashboardCase, ...]
    source_warnings: tuple[str, ...]
    loaded_at: datetime


@dataclass(frozen=True)
class DashboardFilters:
    """案件篩選與排序條件。"""

    search_text: str = ""
    stage: str = "全部"
    abnormal_type: str = "全部"
    overdue_status: str = "ALL"
    sort_by: str = "逾期優先"
