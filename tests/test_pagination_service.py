"""案件分頁計算測試。"""

from unittest import TestCase

from services.pagination_service import paginate, visible_page_items


class PaginationServiceTest(TestCase):
    def test_each_page_contains_at_most_ten_items(self) -> None:
        items = tuple(range(23))

        first_page = paginate(items, requested_page=1, page_size=10)
        third_page = paginate(items, requested_page=3, page_size=10)

        self.assertEqual(first_page.items, tuple(range(10)))
        self.assertEqual(first_page.display_start, 1)
        self.assertEqual(first_page.display_end, 10)
        self.assertEqual(first_page.total_pages, 3)
        self.assertEqual(third_page.items, (20, 21, 22))
        self.assertEqual(third_page.display_start, 21)
        self.assertEqual(third_page.display_end, 23)

    def test_invalid_page_is_clamped_to_available_range(self) -> None:
        items = tuple(range(23))

        page = paginate(items, requested_page=8, page_size=10)

        self.assertEqual(page.current_page, 3)
        self.assertEqual(page.items, (20, 21, 22))

    def test_empty_results_keep_a_stable_first_page(self) -> None:
        page = paginate((), requested_page=4, page_size=10)

        self.assertEqual(page.current_page, 1)
        self.assertEqual(page.total_pages, 1)
        self.assertEqual(page.display_start, 0)
        self.assertEqual(page.display_end, 0)

    def test_long_page_list_uses_ellipsis(self) -> None:
        self.assertEqual(
            visible_page_items(current_page=5, total_pages=10),
            (1, None, 4, 5, 6, None, 10),
        )
