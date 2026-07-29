"""Streamlit 看板主畫面。"""

from typing import Sequence

import streamlit as st

from config.settings import (
    CACHE_TTL_SECONDS,
    CASES_PER_PAGE,
    PAGE_LAYOUT,
    PAGE_TITLE,
)
from config.texts import (
    ALL_FILTER,
    APP_TITLE,
    OVERDUE_FILTER_LABELS,
    SORT_OPTIONS,
    STAGE_ORDER,
)
from services.case_service import CaseService, DashboardLoadError
from services.models import DashboardCase, DashboardFilters, DashboardSnapshot
from services.pagination_service import (
    PageResult,
    paginate,
    visible_page_items,
)
from ui.components import render_case_table
from ui.styles import DASHBOARD_CSS

CURRENT_PAGE_KEY = "dashboard_current_page"
FILTER_SIGNATURE_KEY = "dashboard_filter_signature"


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner=False)
def _load_snapshot(_case_service: CaseService) -> DashboardSnapshot:
    """透過服務層取得資料；UI 不直接接觸 Excel 或 Google Sheet。"""
    return _case_service.load_snapshot()


def render_dashboard(case_service: CaseService) -> None:
    """顯示完整看板。"""
    st.set_page_config(
        page_title=PAGE_TITLE,
        layout=PAGE_LAYOUT,
    )
    st.markdown(DASHBOARD_CSS, unsafe_allow_html=True)
    st.markdown(f'<h1 class="dashboard-title">{APP_TITLE}</h1>', unsafe_allow_html=True)

    try:
        snapshot = _load_snapshot(case_service)
    except DashboardLoadError as exc:
        st.error(str(exc))
        st.info("請確認 CASE 工作表為可檢視，且欄位名稱與設定一致。")
        return

    for warning in snapshot.source_warnings:
        st.warning(warning)

    stage = _render_stage_filter(
        case_service=case_service,
        cases=snapshot.cases,
    )
    filters = _render_search_and_filters(
        case_service=case_service,
        cases=snapshot.cases,
        selected_stage=stage,
    )
    filtered_cases = case_service.filter_and_sort(
        cases=snapshot.cases,
        filters=filters,
    )
    page = _build_current_page(
        cases=filtered_cases,
        filters=filters,
    )
    render_case_table(page.items)
    _render_pagination(
        page=page,
        loaded_at_text=f"{snapshot.loaded_at:%Y-%m-%d %H:%M:%S}",
    )


def _render_stage_filter(
    case_service: CaseService,
    cases: Sequence[DashboardCase],
) -> str:
    counts = case_service.stage_counts(cases)
    stage_values = (ALL_FILTER, *STAGE_ORDER)
    labels = {
        stage: f"{stage} {counts.get(stage, 0)}"
        for stage in stage_values
    }
    selected_label = st.radio(
        "案件階段",
        options=[labels[stage] for stage in stage_values],
        horizontal=True,
        label_visibility="collapsed",
    )
    return next(
        stage for stage, label in labels.items() if label == selected_label
    )


def _render_search_and_filters(
    case_service: CaseService,
    cases: Sequence[DashboardCase],
    selected_stage: str,
) -> DashboardFilters:
    search_col, type_col, overdue_col, sort_col, refresh_col = st.columns(
        [2.4, 1.3, 1.1, 1.3, 0.55],
        vertical_alignment="bottom",
    )

    with search_col:
        search_text = st.text_input(
            "搜尋案件",
            placeholder="搜尋案件編號、件號、台車號、區塊或處理人員",
        )
    with type_col:
        abnormal_type = st.selectbox(
            "異常類型",
            options=case_service.abnormal_type_options(cases),
        )
    with overdue_col:
        overdue_label = st.selectbox(
            "逾期狀態",
            options=list(OVERDUE_FILTER_LABELS.values()),
        )
        overdue_status = next(
            value
            for value, label in OVERDUE_FILTER_LABELS.items()
            if label == overdue_label
        )
    with sort_col:
        sort_by = st.selectbox("排序方式", options=SORT_OPTIONS)
    with refresh_col:
        if st.button("重新整理", use_container_width=True):
            _load_snapshot.clear()
            st.rerun()

    return DashboardFilters(
        search_text=search_text,
        stage=selected_stage,
        abnormal_type=abnormal_type,
        overdue_status=overdue_status,
        sort_by=sort_by,
    )


def _build_current_page(
    cases: Sequence[DashboardCase],
    filters: DashboardFilters,
) -> PageResult[DashboardCase]:
    """建立目前頁面；篩選條件改變時回到第一頁。"""
    filter_signature = (
        filters.search_text.strip(),
        filters.stage,
        filters.abnormal_type,
        filters.overdue_status,
        filters.sort_by,
    )
    if st.session_state.get(FILTER_SIGNATURE_KEY) != filter_signature:
        st.session_state[FILTER_SIGNATURE_KEY] = filter_signature
        st.session_state[CURRENT_PAGE_KEY] = 1

    requested_page = int(st.session_state.get(CURRENT_PAGE_KEY, 1))
    page = paginate(
        items=cases,
        requested_page=requested_page,
        page_size=CASES_PER_PAGE,
    )
    st.session_state[CURRENT_PAGE_KEY] = page.current_page
    return page


def _render_pagination(
    page: PageResult[DashboardCase],
    loaded_at_text: str,
) -> None:
    """在案件表格右下方顯示筆數、更新時間與換頁按鈕。"""
    spacer_col, footer_col = st.columns([2.2, 1.8])
    with footer_col:
        st.markdown(
            (
                '<div class="pagination-meta">'
                f"顯示 {page.display_start}–{page.display_end}／"
                f"{page.total_items} 筆｜"
                f"第 {page.current_page}／{page.total_pages} 頁｜"
                f"更新時間 {loaded_at_text}"
                "</div>"
            ),
            unsafe_allow_html=True,
        )

        page_items = visible_page_items(
            current_page=page.current_page,
            total_pages=page.total_pages,
        )
        column_widths = [
            1.8,
            *(0.8 if page_number is None else 1.0 for page_number in page_items),
            1.8,
        ]
        button_columns = st.columns(column_widths, gap="small")

        with button_columns[0]:
            st.button(
                "上一頁",
                key="pagination_previous",
                disabled=page.current_page == 1,
                use_container_width=True,
                on_click=_set_current_page,
                args=(page.current_page - 1,),
            )

        for index, page_number in enumerate(page_items, start=1):
            with button_columns[index]:
                if page_number is None:
                    st.markdown(
                        '<div class="pagination-ellipsis">…</div>',
                        unsafe_allow_html=True,
                    )
                    continue
                st.button(
                    str(page_number),
                    key=f"pagination_page_{page_number}",
                    type=(
                        "primary"
                        if page_number == page.current_page
                        else "secondary"
                    ),
                    use_container_width=True,
                    on_click=_set_current_page,
                    args=(page_number,),
                )

        with button_columns[-1]:
            st.button(
                "下一頁",
                key="pagination_next",
                disabled=page.current_page == page.total_pages,
                use_container_width=True,
                on_click=_set_current_page,
                args=(page.current_page + 1,),
            )


def _set_current_page(page_number: int) -> None:
    """更新目前頁碼；Streamlit 會在按鈕回呼後重新執行畫面。"""
    st.session_state[CURRENT_PAGE_KEY] = page_number
