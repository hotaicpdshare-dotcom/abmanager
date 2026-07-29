"""案件整理、篩選與優先排序。"""

from datetime import datetime
from typing import Any, Mapping, Sequence

from config import columns
from config.overdue_rules import OverdueStatus
from config.settings import DATETIME_DISPLAY_FORMAT, LOCAL_TIMEZONE
from config.texts import (
    ALL_FILTER,
    ON_SITE_CLOSED_TEXT,
    ON_SITE_UNAVAILABLE_TEXT,
    SHELVING_ENABLED_FINAL_RESOLUTIONS,
    SOP_BY_ABNORMAL_TYPE,
    SORT_NEWEST_FIRST,
    SORT_OVERDUE_FIRST,
    SORT_WAITING_LONGEST,
    STAGE_ORDER,
)
from data.case_repository import CaseRepository, DataSourceError
from services.models import (
    DashboardCase,
    DashboardFilters,
    DashboardSnapshot,
    StageNode,
)
from services.overdue_service import determine_overdue_status
from services.waiting_time_service import calculate_waiting_time, parse_datetime


class DashboardLoadError(RuntimeError):
    """服務層無法建立看板快照時使用的例外。"""


class CaseService:
    """提供 UI 使用的案件資料，不依賴 Streamlit。"""

    def __init__(self, repository: CaseRepository) -> None:
        self._repository = repository

    def load_snapshot(self, now: datetime | None = None) -> DashboardSnapshot:
        """讀取資料來源並整理成 UI 可直接顯示的快照。"""
        try:
            dataset = self._repository.load_cases()
        except DataSourceError as exc:
            raise DashboardLoadError(str(exc)) from exc
        effective_now = now or datetime.now(tz=LOCAL_TIMEZONE)
        cases = tuple(
            self._build_dashboard_case(row=row, now=effective_now)
            for row in dataset.rows
        )
        return DashboardSnapshot(
            cases=cases,
            source_warnings=dataset.warnings,
            loaded_at=effective_now,
        )

    def filter_and_sort(
        self,
        cases: Sequence[DashboardCase],
        filters: DashboardFilters,
    ) -> tuple[DashboardCase, ...]:
        """套用搜尋、篩選及優先排序。"""
        filtered = [
            case
            for case in cases
            if self._matches_filters(case=case, filters=filters)
        ]

        if filters.sort_by == SORT_NEWEST_FIRST:
            filtered.sort(
                key=lambda case: case.occurred_at
                or datetime.min.replace(tzinfo=LOCAL_TIMEZONE),
                reverse=True,
            )
        elif filters.sort_by == SORT_WAITING_LONGEST:
            filtered.sort(
                key=lambda case: case.waiting_seconds
                if case.waiting_seconds is not None
                else -1,
                reverse=True,
            )
        else:
            filtered.sort(key=self._overdue_priority_key, reverse=True)

        return tuple(filtered)

    @staticmethod
    def stage_counts(cases: Sequence[DashboardCase]) -> dict[str, int]:
        """計算各前處理階段案件數。"""
        counts = {ALL_FILTER: len(cases)}
        for stage in STAGE_ORDER:
            counts[stage] = sum(case.current_stage == stage for case in cases)
        return counts

    @staticmethod
    def abnormal_type_options(
        cases: Sequence[DashboardCase],
    ) -> tuple[str, ...]:
        """取得目前資料中的異常類型選項。"""
        values = sorted(
            {
                case.abnormal_type
                for case in cases
                if case.abnormal_type
            }
        )
        return (ALL_FILTER, *values)

    def _build_dashboard_case(
        self,
        row: Mapping[str, Any],
        now: datetime,
    ) -> DashboardCase:
        # 第一版直接顯示 CASE 工作表的 SITUATION。
        # TODO: 待異常類型對照表確認後，再集中於 config 套用轉換規則。
        situation = self._text(row.get(columns.SITUATION))
        abnormal_type = situation

        waiting = calculate_waiting_time(
            created_at_value=row.get(columns.CREATED_AT),
            closed_at_value=row.get(columns.CLOSED_AT),
            now=now,
        )
        overdue_status = determine_overdue_status(
            elapsed_seconds=waiting.elapsed_seconds,
            abnormal_type=abnormal_type,
        )

        created_at = waiting.created_at or parse_datetime(row.get(columns.CREATED_AT))
        occurred_at_text = (
            created_at.strftime(DATETIME_DISPLAY_FORMAT)
            if created_at is not None
            else "資料錯誤"
        )
        current_stage = self._text(row.get(columns.STAGE))
        final_resolution = self._text(row.get(columns.FINAL_RESOLUTION))
        shelving_status = self._text(row.get(columns.SHELVING_STATUS))
        block = self._build_block(
            floor=row.get(columns.FLOOR),
            layer=row.get(columns.LAYER),
        )
        location_text = self._build_location_text(
            floor=row.get(columns.FLOOR),
            layer=row.get(columns.LAYER),
            cart=row.get(columns.ORIGINAL_CART),
        )

        errors = (waiting.error,) if waiting.error else ()
        return DashboardCase(
            case_no=self._text(row.get(columns.CASE_NO)),
            block=block,
            part_no=self._text(row.get(columns.PART_NO)),
            cart_no=self._text(row.get(columns.ORIGINAL_CART)),
            quantity=self._text(row.get(columns.QTY)),
            abnormal_type=abnormal_type,
            occurred_at_text=occurred_at_text,
            current_stage=current_stage,
            stage_nodes=self._build_stage_nodes(
                current_stage=current_stage,
                final_resolution=final_resolution,
            ),
            on_site_instruction=self._build_on_site_instruction(
                final_resolution=final_resolution,
                shelving_status=shelving_status,
            ),
            waiting_time_text=waiting.display_text,
            waiting_seconds=waiting.elapsed_seconds,
            overdue_status=overdue_status,
            handler=self._text(row.get(columns.HANDLER)),
            product_type=self._text(row.get(columns.PRODUCT_TYPE)),
            location_text=location_text,
            sop_text=SOP_BY_ABNORMAL_TYPE.get(
                abnormal_type,
                "",
            ),
            note=self._text(row.get(columns.NOTE)),
            data_errors=errors,
            occurred_at=created_at,
        )

    @staticmethod
    def _matches_filters(
        case: DashboardCase,
        filters: DashboardFilters,
    ) -> bool:
        if filters.stage != ALL_FILTER and case.current_stage != filters.stage:
            return False
        if (
            filters.abnormal_type != ALL_FILTER
            and case.abnormal_type != filters.abnormal_type
        ):
            return False
        if (
            filters.overdue_status != "ALL"
            and case.overdue_status.value != filters.overdue_status
        ):
            return False

        keyword = filters.search_text.strip().casefold()
        if not keyword:
            return True

        searchable_values = (
            case.case_no,
            case.block,
            case.part_no,
            case.cart_no,
            case.abnormal_type,
            case.current_stage,
            case.handler,
            case.note,
        )
        return any(keyword in value.casefold() for value in searchable_values)

    @staticmethod
    def _overdue_priority_key(case: DashboardCase) -> tuple[int, int]:
        status_rank = {
            OverdueStatus.NORMAL: 0,
            OverdueStatus.WARNING: 1,
            OverdueStatus.OVERDUE: 2,
        }
        return (
            status_rank[case.overdue_status],
            case.waiting_seconds if case.waiting_seconds is not None else -1,
        )

    @staticmethod
    def _build_stage_nodes(
        current_stage: str,
        final_resolution: str,
    ) -> tuple[StageNode, ...]:
        # FINAL_RESOLUTION 一有值，第三節點立即改為實際處理結果。
        if final_resolution:
            return (
                StageNode(label=STAGE_ORDER[0], state="completed"),
                StageNode(label=STAGE_ORDER[1], state="completed"),
                StageNode(label=final_resolution, state="completed"),
            )

        try:
            current_index = STAGE_ORDER.index(current_stage)
        except ValueError:
            current_index = -1

        nodes: list[StageNode] = []
        for index, stage in enumerate(STAGE_ORDER):
            if current_index == -1:
                state = "pending"
            elif index < current_index:
                state = "completed"
            elif index == current_index:
                state = "current"
            else:
                state = "pending"
            nodes.append(StageNode(label=stage, state=state))
        return tuple(nodes)

    @staticmethod
    def _build_on_site_instruction(
        final_resolution: str,
        shelving_status: str,
    ) -> str:
        if not final_resolution:
            return ON_SITE_UNAVAILABLE_TEXT
        if final_resolution in SHELVING_ENABLED_FINAL_RESOLUTIONS:
            return shelving_status or ON_SITE_UNAVAILABLE_TEXT
        return ON_SITE_CLOSED_TEXT

    @staticmethod
    def _build_block(floor: Any, layer: Any) -> str:
        floor_text = CaseService._text(floor)
        layer_text = CaseService._text(layer)
        if not floor_text or not layer_text:
            return ""
        return f"{floor_text}-{layer_text}"

    @staticmethod
    def _build_location_text(floor: Any, layer: Any, cart: Any) -> str:
        floor_text = CaseService._text(floor)
        layer_text = CaseService._text(layer)
        cart_text = CaseService._text(cart)
        values = (
            ("樓層", floor_text),
            ("層別", layer_text),
            ("台車", cart_text),
        )
        return "｜".join(f"{label}：{value}" for label, value in values if value)

    @staticmethod
    def _text(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip()
        return text
