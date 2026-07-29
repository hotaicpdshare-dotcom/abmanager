"""案件等待時間計算。"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd

from config.settings import LOCAL_TIMEZONE


@dataclass(frozen=True)
class WaitingTimeResult:
    """等待時間計算結果。"""

    elapsed_seconds: int | None
    display_text: str
    created_at: datetime | None
    closed_at: datetime | None
    error: str | None = None


def parse_datetime(value: Any) -> datetime | None:
    """安全解析時間，並統一為台北時區。"""
    if value is None or str(value).strip() == "":
        return None

    try:
        parsed = pd.to_datetime(value, errors="raise")
        timestamp = parsed.to_pydatetime()
    except Exception:
        return None

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=LOCAL_TIMEZONE)
    return timestamp.astimezone(LOCAL_TIMEZONE)


def format_elapsed_time(total_seconds: int) -> str:
    """將累計秒數轉為可超過 24 小時的 HH:MM:SS。"""
    hours, remainder = divmod(max(total_seconds, 0), 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def calculate_waiting_time(
    created_at_value: Any,
    closed_at_value: Any = None,
    now: datetime | None = None,
) -> WaitingTimeResult:
    """依建立時間及結案時間計算等待時間。"""
    created_at = parse_datetime(created_at_value)
    if created_at is None:
        return WaitingTimeResult(
            elapsed_seconds=None,
            display_text="資料錯誤",
            created_at=None,
            closed_at=None,
            error="CREATED_AT 缺少或格式錯誤",
        )

    closed_at = parse_datetime(closed_at_value)
    if closed_at_value not in (None, "") and closed_at is None:
        return WaitingTimeResult(
            elapsed_seconds=None,
            display_text="資料錯誤",
            created_at=created_at,
            closed_at=None,
            error="CLOSED_AT 格式錯誤",
        )

    end_at = closed_at or now or datetime.now(tz=LOCAL_TIMEZONE)
    if end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=LOCAL_TIMEZONE)

    elapsed_seconds = int((end_at - created_at).total_seconds())
    if elapsed_seconds < 0:
        return WaitingTimeResult(
            elapsed_seconds=None,
            display_text="資料錯誤",
            created_at=created_at,
            closed_at=closed_at,
            error="結束時間早於異常發生時間",
        )

    return WaitingTimeResult(
        elapsed_seconds=elapsed_seconds,
        display_text=format_elapsed_time(elapsed_seconds),
        created_at=created_at,
        closed_at=closed_at,
    )
