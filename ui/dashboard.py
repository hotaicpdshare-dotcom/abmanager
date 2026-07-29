"""Streamlit 看板主畫面。"""

from typing import Sequence

import streamlit as st

from config.settings import (
    CACHE_TTL_SECONDS,
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
from ui.components import render_case_table
from ui.styles import DASHBOARD_CSS


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

    st.markdown(
        (
            '<div class="dashboard-meta">'
            f"顯示 {len(filtered_cases)}／{len(snapshot.cases)} 筆｜"
            f"更新時間 {snapshot.loaded_at:%Y-%m-%d %H:%M:%S}"
            "</div>"
        ),
        unsafe_allow_html=True,
    )
    render_case_table(filtered_cases)


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
