"""案件欄位整理測試。"""

from datetime import datetime
from unittest import TestCase
from zoneinfo import ZoneInfo

from config.texts import FINAL_RESOLUTION_OPTIONS
from data.case_repository import CaseDataset
from services.case_service import CaseService

TAIPEI = ZoneInfo("Asia/Taipei")


class StubCaseRepository:
    """提供測試資料的案件來源。"""

    def __init__(self, rows: tuple[dict[str, object], ...]) -> None:
        self._rows = rows

    def load_cases(self) -> CaseDataset:
        return CaseDataset(rows=self._rows)


class CaseServiceTest(TestCase):
    def test_situation_is_used_as_abnormal_type(self) -> None:
        service = CaseService(
            StubCaseRepository(
                rows=(
                    {
                        "CASE_NO": "A260729-001",
                        "CREATED_AT": "2026-07-29 10:33:00",
                        "PART_NO": "759220D130",
                        "QTY": "4",
                        "SITUATION": "地上撿到",
                        "STAGE": "待處理",
                        "FLOOR": "2F",
                        "LAYER": "中",
                    },
                )
            )
        )

        snapshot = service.load_snapshot(
            now=datetime(2026, 7, 29, 14, 0, tzinfo=TAIPEI)
        )

        self.assertEqual(snapshot.cases[0].abnormal_type, "地上撿到")

    def test_missing_source_values_stay_blank(self) -> None:
        service = CaseService(
            StubCaseRepository(
                rows=(
                    {
                        "CASE_NO": "A260729-001",
                        "CREATED_AT": "2026-07-29 10:33:00",
                        "PART_NO": "759220D130",
                        "QTY": "4",
                        "SITUATION": "地上撿到",
                        "STAGE": "待處理",
                        "FLOOR": "2F",
                        "LAYER": "中",
                        "ORIGINAL_CART": None,
                        "HANDLER": None,
                    },
                )
            )
        )

        snapshot = service.load_snapshot(
            now=datetime(2026, 7, 29, 14, 0, tzinfo=TAIPEI)
        )
        case = snapshot.cases[0]

        self.assertEqual(case.cart_no, "")
        self.assertEqual(case.handler, "")
        self.assertEqual(case.on_site_instruction, "未開放")
        self.assertEqual(case.block, "2F-中")

    def test_pending_stage_marks_first_node_as_current(self) -> None:
        case = self._load_single_case(
            {
                "STAGE": "待處理",
                "FINAL_RESOLUTION": None,
            }
        )

        self.assertEqual(
            [(node.label, node.state) for node in case.stage_nodes],
            [
                ("待處理", "current"),
                ("處理中", "pending"),
                ("處理結果", "pending"),
            ],
        )

    def test_processing_stage_marks_previous_node_as_completed(self) -> None:
        case = self._load_single_case(
            {
                "STAGE": "處理中",
                "FINAL_RESOLUTION": None,
            }
        )

        self.assertEqual(
            [(node.label, node.state) for node in case.stage_nodes],
            [
                ("待處理", "completed"),
                ("處理中", "current"),
                ("處理結果", "pending"),
            ],
        )

    def test_each_final_resolution_replaces_result_node(self) -> None:
        for final_resolution in FINAL_RESOLUTION_OPTIONS:
            with self.subTest(final_resolution=final_resolution):
                case = self._load_single_case(
                    {
                        "STAGE": "處理結果",
                        "FINAL_RESOLUTION": final_resolution,
                        "SHELVING_STATUS": "待上架",
                    }
                )

                self.assertEqual(
                    [(node.label, node.state) for node in case.stage_nodes],
                    [
                        ("待處理", "completed"),
                        ("處理中", "completed"),
                        (final_resolution, "completed"),
                    ],
                )

    def test_remeasure_and_system_data_fix_show_shelving_status(self) -> None:
        for final_resolution in (
            "重新丈量",
            "請資訊部修正異常系統資料",
        ):
            with self.subTest(final_resolution=final_resolution):
                case = self._load_single_case(
                    {
                        "STAGE": "處理結果",
                        "FINAL_RESOLUTION": final_resolution,
                        "SHELVING_STATUS": "待上架",
                    }
                )

                self.assertEqual(case.on_site_instruction, "待上架")

    def test_storage_and_overflow_confirmation_are_closed(self) -> None:
        for final_resolution in (
            "零件放入儲位",
            "確認溢品",
        ):
            with self.subTest(final_resolution=final_resolution):
                case = self._load_single_case(
                    {
                        "STAGE": "處理結果",
                        "FINAL_RESOLUTION": final_resolution,
                        "SHELVING_STATUS": "待上架",
                    }
                )

                self.assertEqual(case.on_site_instruction, "已結案")

    def _load_single_case(
        self,
        values: dict[str, object],
    ):
        row: dict[str, object] = {
            "CASE_NO": "A260729-001",
            "CREATED_AT": "2026-07-29 10:33:00",
            "PART_NO": "759220D130",
            "QTY": "4",
            "SITUATION": "地上撿到",
            "STAGE": "待處理",
            "FLOOR": "2F",
            "LAYER": "中",
        }
        row.update(values)
        service = CaseService(StubCaseRepository(rows=(row,)))
        return service.load_snapshot(
            now=datetime(2026, 7, 29, 14, 0, tzinfo=TAIPEI)
        ).cases[0]
