# TWLint 詞庫貢獻指南

本文說明如何新增和維護詞庫內容。

## 貢獻流程

### 1. 選擇詞庫檔案

依詞彙性質放進對應的 CSV：

```text
dictionaries-csv/
├── core/
│   └── core.csv                    # 核心詞庫（一律載入）
├── domains/
│   ├── software-development.csv    # 軟體開發
│   ├── user-interface.csv          # 使用者介面
│   ├── network-cloud.csv           # 網路雲端
│   ├── hardware-3c.csv             # 硬體 3C
│   ├── operating-system.csv        # 作業系統
│   ├── business-finance.csv        # 商業金融
│   ├── social-media.csv            # 社群媒體
│   └── ai-emerging-tech.csv        # AI 新興技術
└── extended/
    └── academic.csv                # 學術用語（舊版詞庫）
```

### 2. CSV 欄位

| 欄位 | 說明 | 範例 | 必填 |
|------|------|------|------|
| `id` | 唯一識別碼 | `software-term-1` | 是 |
| `taiwan` | 台灣建議用語 | `軟體` | 是 |
| `china_simplified` | 大陸簡體用語 | `软件` | 是 |
| `china_traditional` | 大陸繁體用語 | `軟件` | 是 |
| `english` | 英文對照 | `software` | 否 |
| `confidence` | 信心度（0.0-1.0） | `0.95` | 是 |
| `category` | 分類 | `mainland-term` | 是 |
| `reason` | 建議理由 | `台灣技術標準用語` | 是 |
| `domain` | 所屬領域 | `tech` | 是 |
| `match_type` | 比對模式 | `exact` | 否 |
| `context_before` | 前文關鍵字 | `開發,設計` | 否 |
| `context_after` | 後文關鍵字 | `工程師,架構` | 否 |
| `context_exclude` | 排除關鍵字 | `硬體` | 否 |
| `autofix_safe` | 可否自動修復 | `true` | 否 |

### 3. 詞條規則

#### 只收兩個字以上的詞

`china_simplified` 和 `china_traditional` 都必須是兩個字以上。單一個字（包、流、類、雲）脫離上下文判斷不了詞義，誤判率太高，`npm run dict:build` 遇到會直接失敗。

想抓的是「源碼包」「堆疊」這類詞時，就收完整的詞，不要收其中一個字。

#### 誤判時改語境，不要刪詞條

某個詞在一般文章裡誤判時，改成 `context_sensitive` 並設定前後文與排除關鍵字，`autofix_safe` 設為 `false`。直接刪掉詞條會讓技術文件裡真正的大陸用語也抓不到。

#### 同一個詞在各 CSV 的設定要一致

同一個詞、同一個建議詞出現在多個 CSV 時，`match_type` 和三個語境欄位必須相同。`--deep` 會載入所有詞庫，寬鬆的那份會讓另一份的語境設定失效。不一致時 `dict:validate` 和 `dict:build` 都會失敗。

#### 一般用詞要加語境

「故事」「評論」「事務」「調查」這類一般文章也常用的詞，在領域詞庫裡一律用 `context_sensitive`，前文關鍵字放該領域的詞（貼文、資料庫、磁碟），排除欄放一般用法（評論家、事務所、問卷調查）。

#### 比對模式（`match_type`）

- `exact`（預設）：文字出現就比對。用於明確的替換，例如「軟件」→「軟體」。
- `word_boundary`：前後不能緊接中文字。用於常被包在其他詞裡的詞。
- `context_sensitive`：前後文符合關鍵字才比對。用於同形異義詞，例如「質量」在商業和物理語境。

#### 自動修復（`autofix_safe`）

- `true`：替換確定無誤，`--fix` 會修改。例：「網絡」→「網路」。
- `false`：需要人工判斷，只提示。例：語境敏感詞、有爭議的術語。

#### 信心度（`confidence`）

| 分數 | 說明 | 範例 |
|------|------|------|
| 0.95-1.0 | 標準替換 | 軟件→軟體 |
| 0.85-0.94 | 常見用語 | 數據→資料 |
| 0.70-0.84 | 依語境而定 | 質量→品質 |
| 0.50-0.69 | 需謹慎 | 專業術語 |

## 範例詞條

### 基本詞條（可自動修復）

```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
software-basic,軟體,软件,軟件,software,0.95,mainland-term,台灣技術標準用語,tech,exact,,,,true
```

### 語境敏感詞條

```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
quality-business,品質,质量,質量,quality,0.90,mainland-term,商業品質管理,business,context_sensitive,"產品,服務,商品","控制,管理,標準",物理,false
quality-physics,質量,质量,質量,mass,0.95,mainland-term,物理學質量單位,physics,context_sensitive,"密度,重量,公斤","守恆,轉換,定律",商業,false
```

### 語境規則怎麼判斷

- 同一個欄位內的關鍵字是「任一個出現即可」。
- `context_before` 和 `context_after` 都有設定時，兩邊都要符合。
- `context_exclude` 的關鍵字出現在前後文就不比對。
- 檢查範圍：`context_sensitive` 前後各 50 個字，其他模式前後各 20 個字。

## 開發流程

```bash
# 1. 編輯 CSV
vim dictionaries-csv/domains/software-development.csv

# 2. 檢查所有 CSV（欄位、單字詞條）
npm run dict:validate

# 3. 建置詞庫（CSV 轉 JSON，有錯誤時失敗）
npm run dict:build

# 4. 用實際文字試跑（檔名不要含 test，.twlintignore 會略過 *test*.md）
npm run build
./bin/twlint check sample-lint.md --deep
./bin/twlint check sample-lint.md --deep --fix

# 5. 型別檢查、lint、測試
npx tsc --noEmit
npm run lint
npx vitest run
```

新增詞條或改語境時，用一般台灣中文文章跑一次，確認沒有新增誤判。

## 提交前檢查

- 必填欄位都已填寫
- `id` 沒有重複
- 詞條都是兩個字以上
- 語境敏感詞已設定前後文，`autofix_safe` 為 `false`
- `npm run dict:build` 與測試通過
- 用真實文字試跑過

## 常見問題

### 一詞多義怎麼處理？

用 `context_sensitive`，每個語義各寫一筆：

```csv
business-quality,品質,质量,質量,quality,0.90,mainland-term,...,business,context_sensitive,"商業,產品",...
physics-mass,質量,质量,質量,mass,0.95,mainland-term,...,physics,context_sensitive,"物理,密度",...
```

### 新增領域詞庫？

1. 在 `dictionaries-csv/domains/` 新增 CSV。
2. 在 `tools/build-dict.ts` 的 `formatDomainName()` 加上中文名稱。
3. 執行 `npm run dict:build`。

## 回報問題

[GitHub Issues](https://github.com/Termdock-dev/twlint/issues)
