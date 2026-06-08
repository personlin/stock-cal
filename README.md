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

## 設定 FinMind Token（加速股價查詢）

為加快股價反應速度，Function 會優先改用 [FinMind](https://finmindtrade.com/analysis/#/data/api) 的單一 JSON API（`https://api.finmindtrade.com/api/v4/data`），一次同時涵蓋上市(TWSE)與上櫃(TPEx)，省去逐月抓 TWSE/TPEx 與解析 Big5 ISIN 對照表的延遲。FinMind 失敗時才自動退回原本的 TWSE/TPEx 來源。

FinMind 未帶 token 也能用，但有較低的速率上限；建議申請免費 token 提高上限：

1. 到 <https://finmindtrade.com/> 註冊並登入
2. 進入 **會員中心 / API Token** 頁面，產生（或複製）你的 API token
3. 設定環境變數 `FINMIND_TOKEN`：

   - **本地開發**：在專案根目錄建立 `.env`（已被 `.gitignore` 忽略），加入一行
     ```
     FINMIND_TOKEN=你的token
     ```
     `npx netlify dev` 會自動載入。
   - **Netlify 部署**：到 Netlify 後台 **Site configuration → Environment variables → Add a variable**，
     key 填 `FINMIND_TOKEN`、value 填你的 token，存檔後重新 deploy 即可生效。

> token 只放在伺服器端的 Function 環境變數，不會出現在前端程式碼或瀏覽器。

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

資料來源依序嘗試，前者失敗或查無資料才往後退，因此通常以最快的來源回應：

- **FinMind（主要、最快）**：`https://api.finmindtrade.com/api/v4/data`
  - `TaiwanStockPrice`：日 K（`open / max / min / close`，一次涵蓋上市櫃）
  - `TaiwanStockInfo`：代號 ↔ 名稱 ↔ 市場（JSON，取代 Big5 ISIN 對照表）
- **Yahoo Finance（次要）**：`https://query1.finance.yahoo.com/v8/finance/chart/{代號}`
  - 即 `yfinance` 套件底層所用的端點，純 HTTP 直接在 Node Function 內呼叫（不需 Python）。
  - 台股後綴：上市用 `.TW`、上櫃用 `.TWO`（例 `2330.TW`、`5483.TWO`）。
  - 日內最新一筆通常比 TWSE/TPEx 收盤檔更即時。
- TWSE（備援）：`https://www.twse.com.tw/exchangeReport/STOCK_DAY`
- TPEx（備援）：`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock`
- ISIN（備援的代號 ↔ 名稱對照）：`https://isin.twse.com.tw/isin/C_public.jsp`

Netlify Function 會：

1. **優先打 FinMind**：用 `TaiwanStockInfo`（24h 快取）解析代號／名稱／市場，再用 `TaiwanStockPrice`
   一次抓近 30 天日 K 取最後 5 筆。整個查詢只需 1～2 個 JSON 請求，故反應最快。
   設定 `FINMIND_TOKEN` 環境變數可提高速率上限（見上方「設定 FinMind Token」）。
2. **FinMind 失敗或查無時，改打 Yahoo Finance**：對解析出的代號試 `.TW` / `.TWO`，
   取近一個月日 K 的最後 5 筆。名稱搜尋會先用 FinMind/ISIN 對照表解出代號再查。
3. **兩個快速來源都失敗時，再退回 TWSE/TPEx**：四碼代號先抓 TWSE、查無再抓 TPEx；
   公司名稱則透過 ISIN 對照表解析代號與市場；抓當月日 K，不足 5 筆時最多往前補 3 個月。
4. 所有路徑都統一正規化為 `{ date, open, high, low, close }` 陣列回傳。

為降低 TWSE / TPEx / ISIN 偶發不穩造成的 `HTTP 502`：

- 上游請求有 timeout 與重試，會重試 `429 / 502 / 503 / 504`。
- 成功回應會設定 CDN 快取：`s-maxage=300, stale-while-revalidate=3600`。
- 伺服器 Function 內也會保留最近成功的 quote，短時間重複查詢不會重打上游。
- 暫時性上游錯誤不會被快取；若 Function 還有上次成功資料，會回傳 stale quote 並標示「快取資料」。
- 前端查詢失敗但已有資料時，會保留上次成功資料並顯示更新失敗提示。

> 本工具僅供研究與技術學習，不構成任何投資建議。
