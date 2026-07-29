"""等待時間測試。"""

from datetime import datetime
from unittest import TestCase
from zoneinfo import ZoneInfo

from services.waiting_time_service import (
    calculate_waiting_time,
    format_elapsed_time,
)

TAIPEI = ZoneInfo("Asia/Taipei")


class WaitingTimeServiceTest(TestCase):
    def test_elapsed_time_can_exceed_24_hours(self) -> None:
        self.assertEqual(
            format_elapsed_time(51 * 3600 + 30 * 60 + 25),
            "51:30:25",
        )

    def test_open_case_uses_current_time(self) -> None:
        result = calculate_waiting_time(
            created_at_value="2026-07-27 10:00:00",
            now=datetime(2026, 7, 29, 13, 30, 25, tzinfo=TAIPEI),
        )
        self.assertEqual(result.display_text, "51:30:25")

    def test_closed_case_uses_closed_at(self) -> None:
        result = calculate_waiting_time(
            created_at_value="2026-07-27 10:00:00",
            closed_at_value="2026-07-27 12:30:25",
        )
        self.assertEqual(result.display_text, "02:30:25")

    def test_invalid_created_at_does_not_raise(self) -> None:
        result = calculate_waiting_time(created_at_value="錯誤時間")
        self.assertEqual(result.display_text, "資料錯誤")
        self.assertEqual(result.error, "CREATED_AT 缺少或格式錯誤")
