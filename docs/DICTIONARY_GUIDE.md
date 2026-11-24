# TWLint 詞庫架構指南

## 新架構設計

### 實際目錄結構
```
dictionaries-csv/
├── core/                        # 核心詞庫（必載）
│   └── core.csv                # 核心技術用語 (150 條目)
├── domains/                     # 領域專門詞庫
│   ├── software-development.csv # 軟體開發 (139 條目)
│   ├── user-interface.csv      # 使用者介面 (119 條目)
│   ├── network-cloud.csv       # 網路雲端 (113 條目)
│   ├── social-media.csv        # 社群媒體 (106 條目)
│   ├── operating-system.csv    # 作業系統 (101 條目)
│   ├── hardware-3c.csv         # 硬體3C (91 條目)
│   ├── business-finance.csv    # 商業金融 (123 條目)
│   └── ai-emerging-tech.csv    # AI新興技術 (108 條目)
└── extended/                    # 傳統擴展詞庫（向後相容）
    └── academic.csv            # 學術用語 (12 條目)
```

### 編譯後結構
```
src/dictionaries/
├── index.json                  # 詞庫索引
├── core.json                   # 編譯後核心詞庫
├── software-development.json   # 編譯後領域詞庫
├── user-interface.json
├── network-cloud.json
├── social-media.json
├── operating-system.json
├── hardware-3c.json
├── business-finance.json
├── ai-emerging-tech.json
├── academic.json               # 傳統詞庫
└── extended.json
```

## 詞庫格式標準（新版）

### 完整 CSV 欄位定義
```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
```

### 欄位說明
| 欄位 | 必填 | 說明 | 範例 |
|------|------|------|------|
| **id** | 是 | 唯一識別碼 | `software-term-1` |
| **taiwan** | 是 | 台灣建議用語 | `軟體` |
| **china_simplified** | 是 | 大陸簡體用語 | `软件` |
| **china_traditional** | 是 | 大陸繁體用語 | `軟件` |
| **english** | 否 | 英文對照 | `software` |
| **confidence** | 是 | 信心度 (0.0-1.0) | `0.95` |
| **category** | 是 | 分類 | `mainland-term` |
| **reason** | 是 | 建議理由 | `台灣技術標準用語` |
| **domain** | 是 | 所屬領域 | `tech` |
| **match_type** | 否 | 匹配模式 | `exact`/`context_sensitive` |
| **context_before** | 否 | 前置語境 | `開發,設計` |
| **context_after** | 否 | 後置語境 | `工程師,架構` |
| **context_exclude** | 否 | 排除語境 | `硬體` |
| **autofix_safe** | 否 | 安全修復 | `true`/`false` |

### 範例：軟體開發詞庫
```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
software-basic,軟體,软件,軟件,software,0.95,mainland-term,台灣技術標準用語,tech,exact,,,，true
program-basic,程式,程序,程序,program,0.95,mainland-term,台灣技術標準用語,tech,exact,,,，true
quality-business,品質,质量,質量,quality,0.90,mainland-term,商業品質管理,business,context_sensitive,"產品,服務,商品","控制,管理,標準",物理,false
quality-physics,質量,质量,質量,mass,0.95,mainland-term,物理學質量單位,physics,context_sensitive,"密度,重量,公斤","守恆,轉換,定律",商業,false
```

### 匹配模式說明
- **exact**（預設）：精確匹配，適用標準替換
- **word_boundary**：詞邊界匹配，避免部分匹配
- **context_sensitive**：語境感知，用於同形異義詞

## 詞庫管理工具

### 新增領域詞庫
```bash
# 建立新領域目錄
mkdir dictionaries-csv/新領域名

# 建立詞庫檔案
touch dictionaries-csv/新領域名/sub-category.csv

# 重新建構詞庫
npm run dict:build
```

### 詞庫驗證
```bash
# 驗證 CSV 格式
npm run dict:validate

# 檢查重複項目
npm run dict:check-duplicates

# 測試新詞庫
npm run dict:test 新領域名
```

## 詞庫分級系統

### 1. 核心詞庫 (Core)
- **必備載入**：預設啟用
- **內容**：最基本的簡繁轉換和常見大陸用語
- **適用對象**：所有使用者

### 2. 專業詞庫 (Professional)
- **選擇性載入**：`--dict` 參數指定
- **內容**：特定領域專業術語
- **適用對象**：該領域專業人士

### 3. 擴展詞庫 (Extended)
- **深度模式**：`--deep` 參數啟用
- **內容**：全面的詞彙對照
- **適用對象**：需要全面檢查的場景

## 使用方式

### 指定領域詞庫
```bash
# 軟體開發專案
twlint check src/ --dict core software-development user-interface

# 商業文件
twlint check docs/ --dict core business-finance

# AI 技術文檔
twlint check papers/ --dict core ai-emerging-tech network-cloud

# 深度模式（載入所有詞庫）
twlint check *.md --deep
```

### 傳統詞庫設定（向後相容）
```bash
# 使用傳統詞庫
twlint check *.md --dict core academic extended
```

### 設定檔案
```javascript
// twlint.config.js
export default [
  {
    files: ["**/*.md"],
    // 新版領域設定
    domains: ["software-development", "user-interface"],
    rules: {
      "simplified-chars": "error",
      "mainland-terms": "warning"
    }
  },
  {
    files: ["docs/business/**/*.md"],
    domains: ["business-finance"],
    rules: {
      "simplified-chars": "error",
      "mainland-terms": "error"  // 商業文件更嚴格
    }
  },
  {
    files: ["legacy/**/*.md"],
    // 舊版詞庫設定（向後相容）
    dictionaries: ["core", "academic"],
    rules: {
      "simplified-chars": "error",
      "mainland-terms": "warning"
    }
  }
]
```

## 詞庫貢獻流程

### 1. 準備階段
- Fork TWLint 專案
- 在 `dictionaries-csv/` 下建立或編輯對應領域 CSV
- 遵循命名規範和格式標準

### 2. 內容標準
- **準確性**：確保台灣用語的正確性
- **完整性**：提供完整的欄位資訊
- **一致性**：遵循既有的分類和格式

### 3. 測試驗證
```bash
# 建構詞庫
npm run dict:build

# 驗證格式
npm run dict:validate

# 測試實際效果
npm run test
```

### 4. 提交 PR
- 標題：`feat(dict): 新增 [領域名] 詞庫`
- 內容包含：
  - 新增詞彙數量
  - 覆蓋領域說明
  - 測試結果擷圖

## 詞庫現狀與發展

### 已完成詞庫
- **core** - 核心技術用語
- **software-development** - 軟體開發
- **user-interface** - 使用者介面
- **network-cloud** - 網路雲端
- **social-media** - 社群媒體
- **operating-system** - 作業系統
- **hardware-3c** - 硬體3C
- **business-finance** - 商業金融
- **ai-emerging-tech** - AI新興技術
- **academic** - 學術用語（傳統）
- **extended** - 擴展詞庫（傳統）

### 進階功能
- **語境感知檢測** - 同形異義詞精確識別
- **智慧自動修復** - 安全修復 vs 建議修復
- **領域專門化** - 按需載入特定領域詞庫
- **向後相容** - 支援舊版設定格式

### 未來擴展方向
- 醫療健康領域
- 法律政策領域
- 教育學術擴展
- 文化創意領域
- 製造工業領域

## 詞庫統計

各詞庫的詞目數量由 `npm run dict:build` 寫進 `src/dictionaries/index.json`，以該檔為準。

## 詞庫維護工具

```bash
# 建構所有詞庫
npm run dict:build

# 驗證詞庫格式
npm run dict:validate

# 檢查詞庫狀態
npm run dict:check

# 清單所有詞庫
npm run dict:list
```

---

