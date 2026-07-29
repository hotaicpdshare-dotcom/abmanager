# 進出異常案件 Follow 看板

使用 Python 與 Streamlit 建立的異常案件 MVP 看板。

## 執行方式

```bash
python -m pip install -r requirements.txt
streamlit run app.py
```

## 分層

- `app.py`：組合相依元件並啟動
- `ui/`：Streamlit 畫面與外觀
- `services/`：等待時間、逾期、案件篩選與排序
- `data/`：Google Sheet CASE 工作表讀取與整理
- `config/`：資料來源、文字、欄位與規則

## 目前待確認

- `CLOSED_AT` 與處理人員的實際來源欄位
- `SITUATION` 目前直接顯示為異常類型；待對照表上傳後再轉換
- 各異常類型的提醒與逾期門檻
- 異常類型對應的 SOP

缺少來源資料的欄位會維持空白，不以符號或暫定文字代填。以上待確認
內容集中於 `config/`，確認後不需改動 UI 架構。
