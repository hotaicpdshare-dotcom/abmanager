"""逾期判斷測試。"""

from datetime import timedelta
from unittest import TestCase
from unittest.mock import patch

from config.overdue_rules import OverdueRule, OverdueStatus
import services.overdue_service as overdue_service


class OverdueServiceTest(TestCase):
    def test_default_unconfirmed_rule_returns_normal(self) -> None:
        self.assertEqual(
            overdue_service.determine_overdue_status(
                elapsed_seconds=999_999,
                abnormal_type="尚未設定的類型",
            ),
            OverdueStatus.NORMAL,
        )

    def test_three_overdue_results(self) -> None:
        rule = OverdueRule(
            warning_after=timedelta(hours=2),
            overdue_after=timedelta(hours=4),
        )
        with patch.object(
            overdue_service,
            "get_overdue_rule",
            return_value=rule,
        ):
            self.assertEqual(
                overdue_service.determine_overdue_status(3_600, "測試"),
                OverdueStatus.NORMAL,
            )
            self.assertEqual(
                overdue_service.determine_overdue_status(10_800, "測試"),
                OverdueStatus.WARNING,
            )
            self.assertEqual(
                overdue_service.determine_overdue_status(18_000, "測試"),
                OverdueStatus.OVERDUE,
            )
