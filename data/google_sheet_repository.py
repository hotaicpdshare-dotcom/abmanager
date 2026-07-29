"""從公開 Google Sheet CASE 工作表讀取案件資料。"""

from typing import Any

import pandas as pd

from config.columns import ALL_SOURCE_COLUMNS, REQUIRED_SOURCE_COLUMNS
from config.settings import CASE_SHEET_CSV_URL
from data.case_repository import CaseDataset, DataSourceError


class GoogleSheetCaseRepository:
    """公開 Google Sheet 的案件資料來源。"""

    def __init__(self, csv_url: str = CASE_SHEET_CSV_URL) -> None:
        self._csv_url = csv_url

    def load_cases(self) -> CaseDataset:
        """讀取 CASE 工作表，並將缺少欄位補為空值。"""
        try:
            frame = pd.read_csv(self._csv_url, dtype=object)
        except Exception as exc:
            raise DataSourceError(f"CASE 工作表讀取失敗：{exc}") from exc

        frame.columns = [str(column).strip() for column in frame.columns]
        warnings: list[str] = []

        missing_required = [
            column for column in REQUIRED_SOURCE_COLUMNS if column not in frame.columns
        ]
        if missing_required:
            warnings.append(
                "CASE 工作表缺少必要欄位：" + "、".join(missing_required)
            )

        for column in ALL_SOURCE_COLUMNS:
            if column not in frame.columns:
                frame[column] = None

        normalized = frame.loc[:, ALL_SOURCE_COLUMNS].where(
            pd.notna(frame.loc[:, ALL_SOURCE_COLUMNS]),
            None,
        )
        rows: tuple[dict[str, Any], ...] = tuple(
            normalized.to_dict(orient="records")
        )
        return CaseDataset(rows=rows, warnings=tuple(warnings))
