# 台股技術價格計算機

輸入台股代號（或公司名稱），抓取最近 5 個交易日的開高低收，套用自訂公式即時算出「當日平均價／支撐價／第一壓力價」等技術價格。也支援手動輸入價格直接試算。資料快取在瀏覽器，同一交易日不重複抓取。

## 技術棧

- React 18 + Vite + TypeScript
- Tailwind CSS
- TanStack Query + `persistQueryClient`（localStorage 持久化）
- 內建公式解析器（僅支援數字、`O/H/L/C/AVG`、四則運算、餘數、次方與括號）
- Netlify Static + Functions（CORS / 資料正規化 proxy）

## 本地開發

```bash
npm install
npm run dev        # 純前端 (5173)，但 /api/quote 不會通
# 或者
npx netlify dev    # 前端 + Functions 一起跑，瀏覽 http://localhost:8888
```

## 自訂公式

可用變數：

| 變數 | 含義 |
|------|------|
| `O`  | 開盤價 |
| `H`  | 當日最高價 |
| `L`  | 當日最低價 |
| `C`  | 收盤價 |
| `AVG`| (O+H+L+C) / 4，即「當日平均價」 |

支援的運算：`+ - * / ^` 與括號。內建五條公式（不可刪除）：

- 當日平均價：`(O + H + L + C) / 4`
- 支撐價：`C * L / AVG`
- 第一壓力價：`C * H / AVG`
- 第二壓力價：`AVG * 1.035`
- 第二支撐價：`AVG * 0.965`

技術價格與 OHLC 表格均顯示至小數點以下 2 位。畫面右上額外有一張「壓力 / 支撐」2×2 卡片，以四象限速覽 R1 / R2 / S1 / S2 四個價位；當 R1 > R2 時 R1 格會變紅、S1 < S2 時 S1 格會變藍。

公式存在瀏覽器 localStorage，換裝置不會同步。內建公式如果之後改了定義，下次開啟會自動更新（自訂公式不受影響）。

## 部署到 Netlify

1. 把專案 push 上 GitHub
2. 在 Netlify 新增 Site → "Import from Git" → 選此 repo
3. Build settings 會自動讀取 `netlify.toml`（已設定 `npm run build`、publish `dist`、functions `netlify/functions`）
4. 第一次 deploy 完成後到 **Domains → Add a domain** 加入你自己的 domain
5. 依 Netlify 指示在 DNS 註冊商把記錄指向 Netlify（A record 75.2.60.5，或建議的 CNAME），啟用 HTTPS 即可

## 資料來源與錯誤處理

- TWSE：`https://www.twse.com.tw/exchangeReport/STOCK_DAY`
- TPEx：`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock`
- ISIN（代號 ↔ 名稱對照）：`https://isin.twse.com.tw/isin/C_public.jsp`

Netlify Function 會：

1. 四碼股票代號查詢時，先直接抓 TWSE，查無成交資料再抓 TPEx，避免每次都先依賴 ISIN 對照表。
2. 公司名稱查詢時，才透過 ISIN 對照表解析代號與市場。
3. 抓當月日 K，不足 5 筆時最多往前補 3 個月。
4. 統一為 `{ date, open, high, low, close }` 陣列回傳。

為降低 TWSE / TPEx / ISIN 偶發不穩造成的 `HTTP 502`：

- 上游請求有 timeout 與重試，會重試 `429 / 502 / 503 / 504`。
- 成功回應會設定 CDN 快取：`s-maxage=300, stale-while-revalidate=3600`。
- 伺服器 Function 內也會保留最近成功的 quote，短時間重複查詢不會重打上游。
- 暫時性上游錯誤不會被快取；若 Function 還有上次成功資料，會回傳 stale quote 並標示「快取資料」。
- 前端查詢失敗但已有資料時，會保留上次成功資料並顯示更新失敗提示。

> 本工具僅供研究與技術學習，不構成任何投資建議。
