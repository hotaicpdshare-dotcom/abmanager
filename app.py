"""Streamlit 應用程式啟動入口。"""

from data.google_sheet_repository import GoogleSheetCaseRepository
from services.case_service import CaseService
from ui.dashboard import render_dashboard


def main() -> None:
    """組合相依元件並啟動看板。"""
    repository = GoogleSheetCaseRepository()
    case_service = CaseService(repository=repository)
    render_dashboard(case_service=case_service)


if __name__ == "__main__":
    main()
