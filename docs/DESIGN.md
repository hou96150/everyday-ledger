# 從兩間店到一份帳本 / From two shops to one ledger

[回 README / Back](../README.md)

## 繁體中文

這份文件整理實際需求對話與實作決策，不是市場調查或成效研究。原始情境是一個家庭同時經營咖啡店與影印店；沒有公開家人的帳號、真實營業額或訪談逐字稿。

### 1. 先釐清「記帳」究竟要記什麼

最初需求只有收入、支出、庫存、兩店分帳。往下問後，才看見幾個會影響資料結構的細節：要統計銷售數量；商品有不同規格與價格；補貨要加庫存；送人與退貨也會發生；實收金額可能不同於定價；紀錄需要修改；兩店合計需要 Excel；斷網仍要保存。

這些答案讓產品從一張「日期＋金額」表，變成兩個相互關聯的紀錄：**錢的流動與物品的流動**。

### 2. 需求如何變成設計

| 需求                     | 決策                         | 代價與邊界                       |
| ------------------------ | ---------------------------- | -------------------------------- |
| 兩家店一起看，帳各自分開 | 每筆交易指定店面，報表才合計 | 店面流程目前固定為兩種           |
| 規格、單價各不相同       | 每個規格是獨立品項           | 沒有多層商品選項或組合 BOM       |
| 熟客折扣、臨時改價       | 商品定價與實收分開           | 暫不把折扣分攤到每個品項         |
| 先補貨，晚點付款         | 庫存進貨與付款支出分開       | 沒有應付帳款到期追蹤             |
| 送人與報廢要有數量       | 用明確異動種類與原因         | 原料耗用手動登記，無配方自動扣料 |
| 退一部分商品             | 退款關聯原單，決定是否回補   | 不允許超過原單可退範圍           |
| 輸入可能出錯             | 修改／作廢與前後歷史         | 共用帳號不能辨識操作人           |
| 斷網照常記               | 本機資料庫＋待同步佇列       | 需先載入／登入，打烊要確認同步   |
| 家人不要信箱             | 共用帳號與密碼；首次設定碼   | 沒有電子郵件找回密碼             |

### 3. 畫面從使用順序出發

先選店，再做事。桌面採左側導覽與右側交易表單，手機把店面切換和主要功能放在上方。咖啡店使用暖棕色，影印店使用藍色，幫助使用者辨認當下帳本。

咖啡商品以可點選卡片呈現名稱、規格、單價與庫存；完成前仍看得到數量與實收金額。影印店省去商品選擇，直接填收入、支出與備註。每日摘要刻意標示「收支差額，非利潤」，避免把不同財務概念混為一談。

介面採明亮底色、大按鈕與較少操作層級。這是設計方向；目前沒有正式可用性研究或無障礙認證，鍵盤與輔助技術仍列為改善項目。

### 4. 實作順序

1. 定義店面、品項、交易、數量與退款規則。
2. 完成記帳、庫存、明細修改、報表與 Excel。
3. 加入裝置資料庫與離線網站快取。
4. 建立雲端權限、原子提交、重送識別及版本衝突處理。
5. 加入免真實信箱的家庭開通流程。
6. 執行單元、資料庫、同步整合、瀏覽器及匯出驗證。
7. 部署家庭版；另外整理公開程式碼、無後端示範與文件。

開發由侯旭昇提出需求與取捨，並與 Codex 協作實作、整理與驗證。AI 協作不是免除程式碼審查或實際營運驗收的理由。

### 5. 刻意沒有一次做完的部分

首版優先處理每日可理解的工作流程，沒有把員工權限、發票、支付、會員點數、供應商信用與完整財務報表一次塞進來。接下來的判斷標準是：能否降低資料遺失、讓每日操作更可靠、讓下一位維護者看懂。

## English

This is a record of actual requirement discussions and implementation decisions, not market research or an outcome study. The starting point was a household running a coffee shop and a print shop. No family credentials, actual sales totals or interview transcripts are published.

### 1. What does bookkeeping mean here?

The initial request named income, expenses, inventory and separate shop records. Follow-up questions revealed quantity reporting, variants, restocking, gifts, returns, editable actual receipts, corrections, combined Excel exports and offline work. A date-and-amount table was not enough: the product needed to distinguish **cash movement from stock movement**.

### 2. From requirement to decision

| Requirement                         | Decision                                                  | Tradeoff                                                  |
| ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Separate records, combined overview | Shop attached to each transaction; aggregation in reports | Two fixed workflows                                       |
| Different sizes and prices          | Each variant is its own item                              | No nested options or assembly BOM                         |
| Discounts or negotiated prices      | Separate list prices and actual receipts                  | No per-item discount allocation                           |
| Stock arrives before payment        | Separate purchase movement and cash expense               | No payable due dates                                      |
| Gifts and spoilage                  | Explicit movement types with reasons                      | Manual material usage; no recipe deduction                |
| Partial returns                     | Refund links to original sale; optional restocking        | Cannot exceed the remaining refundable amounts/quantities |
| Mistakes need correction            | Edits, voids and before/after history                     | Shared account cannot identify an individual operator     |
| Offline entry                       | Device database and outbox                                | Requires earlier loading/login and end-of-day sync review |
| No family email requirement         | Shared username/password with one-time bootstrap          | No email password recovery                                |

### 3. Interface follows the task

Choose the shop, then do the work. Desktop uses a sidebar and transaction panel; mobile moves shop switching and primary navigation to the top. Warm brown distinguishes coffee from the print shop's blue. Coffee cards expose product, variant, price and stock. The print workflow skips item selection. The daily summary explicitly labels balance as cash flow, not profit.

Light backgrounds, large controls and shallow navigation are design intentions, not proof of usability. Formal user studies and accessibility certification have not been performed; keyboard and assistive-technology work remains on the roadmap.

### 4. Build sequence

1. Define shops, products, transactions, quantities and refund rules.
2. Implement entry, inventory, editing, reporting and Excel.
3. Add device persistence and offline page caching.
4. Implement authorization, atomic writes, idempotency and conflict resolution.
5. Add household setup without real email addresses.
6. Verify domain, database, synchronization, browser and export behavior.
7. Deploy the household app; prepare a separate public repository, backend-free demo and documentation.

Requirements and tradeoffs were directed by 侯旭昇, with Codex assisting implementation, documentation and verification. AI assistance does not replace code review or operational acceptance.

### 5. Deliberate scope

The first version prioritizes understandable daily tasks over adding employee roles, invoices, payments, loyalty points, supplier credit and financial reporting all at once. Next steps should reduce data loss, improve reliability in daily use and help another maintainer understand the system.
