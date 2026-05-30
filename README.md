# 台股技術價格計算機

輸入台股代號（或公司名稱），抓取最近 5 個交易日的開高低收，套用自訂公式即時算出「當日平均價／支撐價／第一壓力價」等技術價格。也支援手動輸入價格直接試算。資料快取在瀏覽器，同一交易日不重複抓取。

## 技術棧

- React 18 + Vite + TypeScript
- Tailwind CSS
- TanStack Query + `persistQueryClient`（localStorage 持久化）
- `expr-eval`（沙箱化表達式引擎，安全執行使用者公式）
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

支援的運算：`+ - * / ^` 與括號。內建三條公式（不可刪除）：

- 當日平均價：`(O + H + L + C) / 4`
- 支撐價：`C * L / AVG`
- 第一壓力價：`C * H / AVG`

公式存在瀏覽器 localStorage，換裝置不會同步。

## 部署到 Netlify

1. 把專案 push 上 GitHub
2. 在 Netlify 新增 Site → "Import from Git" → 選此 repo
3. Build settings 會自動讀取 `netlify.toml`（已設定 `npm run build`、publish `dist`、functions `netlify/functions`）
4. 第一次 deploy 完成後到 **Domains → Add a domain** 加入你自己的 domain
5. 依 Netlify 指示在 DNS 註冊商把記錄指向 Netlify（A record 75.2.60.5，或建議的 CNAME），啟用 HTTPS 即可

## 資料來源

- TWSE：`https://www.twse.com.tw/exchangeReport/STOCK_DAY`
- TPEx：`https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php`
- ISIN（代號 ↔ 名稱對照）：`https://isin.twse.com.tw/isin/C_public.jsp`

Netlify Function 會：判斷上市/上櫃 → 抓當月日 K → 不足 5 筆時往前補一個月 → 統一為 `{ date, open, high, low, close }` 陣列回傳。

> 本工具僅供研究與技術學習，不構成任何投資建議。
