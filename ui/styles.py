"""看板外觀設定。"""

DASHBOARD_CSS = """
<style>
    :root {
        --hotai-blue: #004caa;
        --hotai-blue-dark: #082c68;
        --hotai-red: #ee1c25;
        --line: #dce8f8;
        --soft-blue: #eef5ff;
        --muted: #7c8ba1;
        --table-columns:
            minmax(72px, .75fr)
            minmax(112px, 1.25fr)
            minmax(96px, 1fr)
            minmax(62px, .55fr)
            minmax(120px, 1.15fr)
            minmax(138px, 1.35fr)
            minmax(210px, 2fr)
            minmax(148px, 1.45fr)
            minmax(112px, 1.05fr)
            minmax(100px, 1fr);
    }

    .stApp {
        background:
            radial-gradient(circle at 12% 0%, #f3f7ff 0, transparent 34%),
            #ffffff;
    }

    .block-container {
    max-width: none;
    width: 100%;
    padding-top: 1.6rem;
    padding-left: 1rem;
    padding-right: 1rem;
    padding-bottom: 2.5rem;
}

    .dashboard-title {
        margin: 0 0 1.2rem;
        color: var(--hotai-blue-dark);
        font-size: 2rem;
        font-weight: 800;
        text-align: center;
        letter-spacing: .06em;
    }

    .dashboard-meta {
        color: var(--muted);
        font-size: .86rem;
        text-align: right;
    }

    .case-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid #cfe0f7;
        border-radius: 18px;
        background: rgba(255, 255, 255, .96);
        box-shadow: 0 16px 40px rgba(15, 57, 117, .08);
    }

    .case-table {
        min-width: 1200px;
        padding: 16px 8px 10px;
    }

    .case-group-header,
    .case-column-header,
    .case-summary {
        display: grid;
        grid-template-columns: var(--table-columns);
        align-items: center;
    }

    .case-group-header {
        gap: 3px;
    }

    .group-title {
        padding: 10px 8px;
        border-radius: 8px 8px 4px 4px;
        background: linear-gradient(135deg, #075bd0, var(--hotai-blue));
        color: white;
        font-size: 1rem;
        font-weight: 700;
        text-align: center;
        letter-spacing: .08em;
    }

    .group-info {
        grid-column: span 5;
    }

    .group-progress {
        grid-column: span 3;
    }

    .group-state {
        grid-column: span 2;
    }

    .case-column-header {
        margin-top: 8px;
        border-radius: 8px;
        background: linear-gradient(90deg, #edf4fc, #e6effa);
        color: var(--hotai-blue-dark);
        font-weight: 700;
    }

    .case-column-header > span,
    .case-summary > span {
        min-width: 0;
        padding: 12px 4px;
        text-align: center;
        overflow-wrap: anywhere;
    }

    details.case-row {
        border-bottom: 1px solid var(--line);
    }

    details.case-row:last-child {
        border-bottom: none;
    }

    .case-summary {
        min-height: 72px;
        cursor: pointer;
        color: #173a70;
        list-style: none;
        transition: background .15s ease;
    }

    .case-summary::-webkit-details-marker {
        display: none;
    }

    .case-summary:hover {
        background: #f8fbff;
    }

    details[open] .case-summary {
        background: #f4f8fe;
    }

    .case-no {
        font-weight: 800;
    }

    .abnormal-badge,
    .instruction-badge,
    .waiting-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 30px;
        padding: 4px 12px;
        border-radius: 999px;
        font-weight: 700;
    }

    .abnormal-badge {
        background: #eef3f9;
        color: #304f78;
    }

    .instruction-badge {
        border-radius: 8px;
        background: #f3f5f8;
        color: #475a74;
    }

    .waiting-badge.normal {
        background: #eef3f9;
        color: #173a70;
    }

    .waiting-badge.warning {
        background: #fff2cb;
        color: #b45c00;
    }

    .waiting-badge.overdue,
    .waiting-badge.error {
        background: #ffe2e2;
        color: #d51019;
    }

    .stage-flow {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        width: 100%;
    }

    .stage-node {
        position: relative;
        flex: 1 1 0;
        min-width: 58px;
        color: #8c9aae;
        font-size: .73rem;
        text-align: center;
    }

    .stage-node:not(:last-child)::after {
        content: "";
        position: absolute;
        top: 6px;
        left: calc(50% + 8px);
        right: calc(-50% + 8px);
        height: 2px;
        background: #cbd3df;
    }

    .stage-dot {
        position: relative;
        z-index: 2;
        display: block;
        width: 13px;
        height: 13px;
        margin: 0 auto 7px;
        border-radius: 50%;
        background: #cbd3df;
    }

    .stage-node.completed,
    .stage-node.completed::after {
        color: #0963c8;
    }

    .stage-node.completed .stage-dot,
    .stage-node.completed::after {
        background: #0963c8;
    }

    .stage-node.current {
        color: var(--hotai-red);
        font-weight: 800;
    }

    .stage-node.current .stage-dot {
        background: var(--hotai-red);
        box-shadow: 0 0 0 4px rgba(238, 28, 37, .1);
    }

    .case-details {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        padding: 2px 18px 18px;
        background: #f8fbff;
    }

    .detail-card {
        min-height: 88px;
        padding: 14px 16px;
        border: 1px solid #e1ebf8;
        border-radius: 12px;
        background: white;
    }

    .detail-card.wide {
        grid-column: span 2;
    }

    .detail-label {
        display: block;
        margin-bottom: 6px;
        color: #6a7f9b;
        font-size: .78rem;
        font-weight: 700;
    }

    .detail-value {
        color: #183960;
        line-height: 1.55;
        white-space: pre-wrap;
    }

    .data-errors {
        grid-column: 1 / -1;
        padding: 10px 14px;
        border-radius: 8px;
        background: #fff0f0;
        color: #c71921;
        font-weight: 700;
    }

    .empty-state {
        padding: 52px 24px;
        color: #70829a;
        text-align: center;
    }

    @media (max-width: 900px) {
        .case-details {
            grid-template-columns: 1fr;
        }

        .detail-card.wide {
            grid-column: auto;
        }
    }
</style>
"""
