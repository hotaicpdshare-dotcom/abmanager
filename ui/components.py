"""看板 UI 元件。"""

from html import escape
from typing import Sequence

import streamlit as st

from config.overdue_rules import OverdueStatus
from config.texts import DATA_ERROR_TEXT
from services.models import DashboardCase, StageNode


def render_case_table(cases: Sequence[DashboardCase]) -> None:
    """顯示雙層表頭、案件列與可展開說明。"""
    body = "".join(_case_row_html(case) for case in cases)
    if not body:
        body = '<div class="empty-state">目前沒有符合篩選條件的案件</div>'

    table_html = (
        '<div class="case-table-wrap">'
        '<div class="case-table">'
        '<div class="case-group-header">'
        '<div class="group-title group-info">異常零件資訊</div>'
        '<div class="group-title group-progress">處理進度</div>'
        '<div class="group-title group-state">處理情形</div>'
        "</div>"
        '<div class="case-column-header">'
        "<span>區塊</span>"
        "<span>件號</span>"
        "<span>台車號</span>"
        "<span>數量</span>"
        "<span>異常類型</span>"
        "<span>異常發生時間</span>"
        "<span>前處理</span>"
        "<span>現場處理指示</span>"
        "<span>等待時間</span>"
        "<span>處理人員</span>"
        "</div>"
        f"{body}"
        "</div>"
        "</div>"
    )
    st.markdown(table_html, unsafe_allow_html=True)


def _case_row_html(case: DashboardCase) -> str:
    status_class = {
        OverdueStatus.NORMAL: "normal",
        OverdueStatus.WARNING: "warning",
        OverdueStatus.OVERDUE: "overdue",
    }[case.overdue_status]
    if case.waiting_time_text == DATA_ERROR_TEXT:
        status_class = "error"

    errors = ""
    if case.data_errors:
        error_text = "；".join(escape(error) for error in case.data_errors)
        errors = f'<div class="data-errors">{error_text}</div>'

    return (
        '<details class="case-row">'
        f'<summary class="case-summary" aria-label="展開案件 {escape(case.case_no)}">'
        f'<span class="case-no">{escape(case.block)}</span>'
        f"<span>{escape(case.part_no)}</span>"
        f"<span>{escape(case.cart_no)}</span>"
        f"<span>{escape(case.quantity)}</span>"
        f'<span>{_badge_html("abnormal-badge", case.abnormal_type)}</span>'
        f"<span>{escape(case.occurred_at_text)}</span>"
        f"<span>{_stage_flow_html(case.stage_nodes)}</span>"
        f'<span>{_badge_html("instruction-badge", case.on_site_instruction)}</span>'
        f'<span><span class="waiting-badge {status_class}">'
        f"{escape(case.waiting_time_text)}</span></span>"
        f"<span>{escape(case.handler)}</span>"
        "</summary>"
        '<div class="case-details">'
        f'{_detail_card("案件基本資訊", _basic_info_text(case))}'
        f'{_detail_card("異常類型", case.abnormal_type)}'
        f'{_detail_card("目前階段", case.current_stage)}'
        f'{_detail_card("相關儲位或台車資訊", case.location_text, wide=True)}'
        f'{_detail_card("處理人員", case.handler)}'
        f'{_detail_card("SOP 內容", case.sop_text, wide=True)}'
        f'{_detail_card("備註", case.note)}'
        f"{errors}"
        "</div>"
        "</details>"
    )


def _stage_flow_html(nodes: Sequence[StageNode]) -> str:
    node_html = "".join(
        (
            f'<span class="stage-node {escape(node.state)}">'
            '<span class="stage-dot"></span>'
            f"<span>{escape(node.label)}</span>"
            "</span>"
        )
        for node in nodes
    )
    return f'<span class="stage-flow">{node_html}</span>'


def _badge_html(css_class: str, value: str) -> str:
    """有資料才顯示標籤；缺值欄位維持空白。"""
    if not value:
        return ""
    return f'<span class="{css_class}">{escape(value)}</span>'


def _detail_card(label: str, value: str, wide: bool = False) -> str:
    wide_class = " wide" if wide else ""
    return (
        f'<div class="detail-card{wide_class}">'
        f'<span class="detail-label">{escape(label)}</span>'
        f'<span class="detail-value">{escape(value)}</span>'
        "</div>"
    )


def _basic_info_text(case: DashboardCase) -> str:
    return (
        f"案件編號：{case.case_no}\n"
        f"商品別：{case.product_type}\n"
        f"件號：{case.part_no}\n"
        f"數量：{case.quantity}"
    )
