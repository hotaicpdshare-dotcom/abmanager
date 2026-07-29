"""案件看板分頁計算。"""

from dataclasses import dataclass
from math import ceil
from typing import Generic, Sequence, TypeVar

ItemT = TypeVar("ItemT")


@dataclass(frozen=True)
class PageResult(Generic[ItemT]):
    """單一頁面的案件與頁碼資訊。"""

    items: tuple[ItemT, ...]
    current_page: int
    total_pages: int
    total_items: int
    display_start: int
    display_end: int


def paginate(
    items: Sequence[ItemT],
    requested_page: int,
    page_size: int,
) -> PageResult[ItemT]:
    """將排序、篩選後的案件切成指定頁面。"""
    if page_size <= 0:
        raise ValueError("page_size 必須大於 0")

    total_items = len(items)
    total_pages = max(1, ceil(total_items / page_size))
    current_page = min(max(requested_page, 1), total_pages)
    start_offset = (current_page - 1) * page_size
    end_offset = min(start_offset + page_size, total_items)
    page_items = tuple(items[start_offset:end_offset])

    return PageResult(
        items=page_items,
        current_page=current_page,
        total_pages=total_pages,
        total_items=total_items,
        display_start=start_offset + 1 if total_items else 0,
        display_end=end_offset,
    )


def visible_page_items(
    current_page: int,
    total_pages: int,
) -> tuple[int | None, ...]:
    """回傳頁尾要顯示的頁碼；None 代表省略符號。"""
    if total_pages <= 7:
        return tuple(range(1, total_pages + 1))
    if current_page <= 4:
        return (1, 2, 3, 4, 5, None, total_pages)
    if current_page >= total_pages - 3:
        return (
            1,
            None,
            total_pages - 4,
            total_pages - 3,
            total_pages - 2,
            total_pages - 1,
            total_pages,
        )
    return (
        1,
        None,
        current_page - 1,
        current_page,
        current_page + 1,
        None,
        total_pages,
    )
