# TWLint

檢查中文文件和程式碼裡的簡體字與大陸用語，建議台灣用法，能安全替換的部分可以自動修復。

LLM 的訓練語料裡繁體中文少，生成的文件常混著「软件」「軟件」「軟體」，或「用戶」「使用者」並存。TWLint 用來在 commit 前把這些找出來。

## 功能

- **簡體字**：逐字比對，簡體字可自動轉成繁體字
- **大陸用語**：比對詞庫，建議台灣用語（軟件→軟體、網絡→網路、用戶→使用者）
- **語境判斷**：同形異義詞（例如「文件」可能是檔案或文件）依前後文判斷，只提示、不自動修改
- **只比對兩個字以上的詞**：單一個字（包、流、類）脫離上下文判斷不了詞義，詞庫不收
- **領域詞庫**：軟體開發、使用者介面、網路雲端、AI、商業金融等，可依檔案類型分別啟用
- **ESLint 風格設定**：`files`、`ignores`、`rules`，另支援 `.twlintignore`
- **輸出格式**：stylish、json

## 快速開始

### 安裝

```bash
npm install -g @termdock/twlint
```

### 基本使用

```bash
# 檢查（預設只檢查，不修改檔案）
twlint check README.md
twlint check "docs/**/*.md"
twlint check docs/

# 自動修復（需明確加 --fix）
twlint check README.md --fix

# 產生設定檔
twlint init
```

### 整合到專案

1. 執行 `twlint init` 產生 `twlint.config.js`，再依專案調整（見「設定」）。
2. 在 `package.json` 加入 scripts：

```json
{
  "scripts": {
    "twlint": "twlint check **/*.md **/*.txt",
    "twlint:fix": "twlint check **/*.md **/*.txt --fix",
    "twlint:code": "twlint check 'src/**/*.{js,ts,jsx,tsx,vue}'"
  }
}
```

## 範例

### 文件檢查

`example.md`：

```markdown
<!-- 以下為示範用簡體字內容 -->
# 软件开发项目
这个软件的质量很好，我们使用了先进的算法。
```

```bash
$ twlint check example.md

example.md
    1:3   ✖ error  簡體字 '软' 建議使用繁體字 '軟'  simplified-chars
    1:5   ✖ error  簡體字 '开' 建議使用繁體字 '開'  simplified-chars
    1:6   ✖ error  簡體字 '发' 建議使用繁體字 '發'  simplified-chars
    1:7   ✖ error  簡體字 '项' 建議使用繁體字 '項'  simplified-chars
    2:1   ✖ error  簡體字 '这' 建議使用繁體字 '這'  simplified-chars
    2:2   ✖ error  簡體字 '个' 建議使用繁體字 '個'  simplified-chars
    2:3   ✖ error  簡體字 '软' 建議使用繁體字 '軟'  simplified-chars
    2:6   ✖ error  簡體字 '质' 建議使用繁體字 '質'  simplified-chars
    2:12  ✖ error  簡體字 '们' 建議使用繁體字 '們'  simplified-chars
    2:17  ✖ error  簡體字 '进' 建議使用繁體字 '進'  simplified-chars
    1:3   ⚠ warning  大陸用語 '軟件' 建議使用臺灣用語 '軟體'  mainland-terms
    2:3   ⚠ warning  大陸用語 '軟件' 建議使用臺灣用語 '軟體'  mainland-terms
    2:19  ⚠ warning  大陸用語 '算法' 建議使用臺灣用語 '演算法'  mainland-terms

✖ 13 problems (10 errors, 3 warnings)
```

`twlint check example.md --fix` 之後：

```markdown
# 軟體開發項目
這個軟體的質量很好，我們使用了先進的演算法。
```

「項目」「質量」在台灣也有正當用法，預設詞庫不會自動改；需要時用語境規則或領域詞庫處理。

### 程式碼檢查

預設設定只檢查 `*.md` 和 `*.txt`。要檢查程式碼裡的註解和字串，設定檔的 `files` 要包含對應路徑（`twlint init` 產生的設定已包含 `src/**/*.{js,ts,jsx,tsx,vue}`）。

```javascript
/**
 * 这个软件用于处理用户数据
 */
function processData(data) {
  console.log("网络连接失败");
  throw new Error("文件读取失败");
}
```

`twlint check src/utils.js --fix` 之後：

```javascript
/**
 * 這個軟體用於處理使用者資料
 */
function processData(data) {
  console.log("網路連接失敗");
  throw new Error("文件讀取失敗");
}
```

## 設定

### 設定檔

`twlint.config.js`：

```javascript
export default [
  // 只有 ignores 的物件是全域忽略
  {
    ignores: [
      "**/test-*.md",
      "**/draft-*.md",
      "**/legacy/**"
    ]
  },

  {
    files: ["**/*.md", "**/*.txt"],
    // 要額外載入的領域詞庫（core 一律載入）
    domains: ["software-development", "user-interface"],
    // 舊寫法仍可用：dictionaries: ["core", "academic"]
    rules: {
      "simplified-chars": "error",
      "mainland-terms": "warning"
    }
  },

  {
    files: ["src/**/*.{js,ts,jsx,tsx,vue}"],
    domains: ["software-development"],
    rules: {
      "simplified-chars": "error",
      "mainland-terms": "warning"
    }
  }
]
```

### 自訂詞表

團隊或個人的用語決定可以放在自己的 CSV，不用改內建詞庫。格式跟 `dictionaries-csv/` 相同（欄位見 [CONTRIBUTING.md](CONTRIBUTING.md)）。用 `customDictionaries` 指定，路徑相對於執行 twlint 的目錄。自訂詞表套用到所有檔案，要寫在不帶 `files` 的設定區塊：

```javascript
export default [
  { customDictionaries: ["./twlint-terms.csv"] },
  {
    files: ["**/*.md"],
    rules: { "simplified-chars": "error", "mainland-terms": "warning" }
  }
]
```

```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
fetch,取得,获取,獲取,fetch,0.95,mainland-term,團隊用語,tech,exact,,,,true
allow-script,腳本,脚本,腳本,script,0.5,allowed-term,團隊允許,tech,exact,,,,false
```

- 同一個詞在自訂詞表和內建詞庫都有時，以自訂詞表為準。
- 對應到自己（`腳本→腳本`）等於允許這個詞，內建詞庫不會再對它提出建議。
- 規則跟內建詞庫相同：詞條至少兩個字、必填欄位要齊、`confidence` 要是數字。詞表讀不到、有任何格式問題，或寫在帶 `files` 的區塊時，整個指令失敗並列出問題。
- `--deep` 時也會載入。

### 忽略規則

有三種方式：

1. **`.twlintignore`**（建議），寫法同 `.eslintignore`：

   ```text
   test-*.md
   tests/
   draft-*.md
   temp/
   ```

2. **設定檔全域忽略**：只有 `ignores` 屬性的設定物件。
3. **個別區塊忽略**：在有 `files` 的區塊加 `ignores`，只影響該區塊。

```javascript
export default [
  {
    files: ["**/*.md"],
    ignores: ["**/README.md"],
    rules: { "simplified-chars": "error" }
  }
]
```

優先順序由高到低：

1. **系統內建忽略**（不可覆寫）：`.gitignore`、`.dockerignore`、`.env*`、`.*ignore`、`.git/`、`.svn/`、`node_modules/`、`dist/`、`build/`、`.next/`、`*.log`、`*.tmp`
2. `.twlintignore`
3. 設定檔全域忽略
4. 個別區塊忽略

完整說明見 [docs/configuration-ignores.md](docs/configuration-ignores.md)。

### CLI 選項

```text
twlint check <files...> [options]

  --fix              自動修復（只修 autofix_safe 的詞條與簡體字）
  --deep             載入所有詞庫
  --format <type>    輸出格式：stylish（預設）、json
  --dict <names...>  指定詞庫，例如 --dict core academic
  --config <path>    設定檔路徑
  --verbose          顯示詳細輸出

twlint init [--force]  產生 twlint.config.js
```

`<files...>` 可以是檔案、glob 或資料夾。資料夾會展開成裡面有設定區塊涵蓋的檔案（預設設定是 `*.md`、`*.txt`），並套用所有忽略規則。參數展開後一個檔案都沒有時，會在 stderr 印出警告，結束碼不變。

領域詞庫從設定檔的 `domains` 指定。`--dict` 只取代設定檔的 `dictionaries`：檔案符合的設定區塊有 `domains` 時，以 `domains` 為準，`--dict` 不生效（`twlint init` 產生的設定檔就有 `domains`）。要不受設定檔影響，用 `--deep` 載入所有詞庫。

## 詞庫

`core` 一律載入，其他詞庫依設定檔的 `domains`、`--dict` 或 `--deep` 載入。各詞庫的詞目數量見建置產生的 `src/dictionaries/index.json`。

| 詞庫 | 內容 |
|------|------|
| core | 核心詞庫（必載） |
| software-development | 軟體開發 |
| user-interface | 使用者介面 |
| network-cloud | 網路雲端 |
| social-media | 社群媒體 |
| operating-system | 作業系統 |
| hardware-3c | 硬體 3C |
| business-finance | 商業金融 |
| ai-emerging-tech | AI 新興技術 |
| academic | 學術用語（舊版詞庫） |
| extended | 擴充用語（舊版詞庫） |

```bash
# 指定詞庫（設定檔沒有 domains 時）
twlint check "docs/**/*.md" --dict core business-finance

# 載入所有詞庫
twlint check README.md --deep
```

## 規則

### simplified-chars

逐字找出簡體字，建議對應的繁體字。

本身也是正體字的字（公里的「里」、玄武岩的「岩」、契托爾的「托」），只有在同一行已有確定的簡體字時才回報，正體中文文章不會被誤報。詞組層級的用字差異（家具／傢俱、周年／週年）不算簡體字，不回報。

- 嚴重度：error
- 可自動修復：是

### mainland-terms

比對詞庫找出大陸用語，建議台灣用語。只比對兩個字以上的詞；文字已經是建議詞時（例如「終端機」）不回報。

- 嚴重度：warning（`autofix_safe: true`，可自動修復）或 info（需人工確認，不自動修復）

### 語境判斷

同一個詞在不同語境意思不同時，詞條用 `context_sensitive`，並設定前後文關鍵字：

```javascript
{
  taiwan: "品質",
  china_simplified: "质量",
  match_type: "context_sensitive",
  context: {
    before: ["產品", "服務", "商品"],  // 前文出現任一個
    after: ["控制", "管理", "標準"],   // 且後文出現任一個
    exclude: ["物理"]                  // 前後文出現就不比對
  }
}
```

`before` 和 `after` 都設定時兩者都要符合；同一個清單內任一關鍵字出現即可。

### 自動修復分級

- `autofix_safe: true`：替換確定無誤（軟件→軟體、網絡→網路），`--fix` 會修改。
- `autofix_safe: false`：需要人工判斷（語境敏感詞、有爭議的術語），只提示。

## 開發

需求：Node.js 18+、TypeScript 5.0+

```bash
git clone https://github.com/Termdock-dev/twlint.git
cd twlint
npm install
npm run build
npx vitest run
```

詞庫原始檔在 `dictionaries-csv/`，修改後執行：

```bash
npm run dict:validate   # 檢查所有 CSV 的欄位與詞條長度
npm run dict:build      # CSV 轉 JSON；有單字詞條時建置失敗
```

詞庫貢獻方式見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 授權

Apache License 2.0，詳見 [LICENSE](LICENSE)。
