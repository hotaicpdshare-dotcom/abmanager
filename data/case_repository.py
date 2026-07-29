"""案件資料來源介面。"""

from dataclasses import dataclass
from typing import Any, Mapping, Protocol


@dataclass(frozen=True)
class CaseDataset:
    """資料來源讀取結果。"""

    rows: tuple[Mapping[str, Any], ...]
    warnings: tuple[str, ...] = ()


class CaseRepository(Protocol):
    """案件資料來源需實作的介面。"""

    def load_cases(self) -> CaseDataset:
        """讀取並整理案件資料。"""


class DataSourceError(RuntimeError):
    """資料來源無法讀取時使用的例外。"""
