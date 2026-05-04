# TWLint 詞庫貢獻指南

> 感謝您對 TWLint 詞庫的貢獻！本指南將幫助您了解如何正確添加和維護詞庫內容。

## 📋 貢獻流程

### 1. 選擇適當的領域詞庫

TWLint 採用領域導向的詞庫架構，請根據詞彙性質選擇對應的 CSV 檔案：

```
dictionaries-csv/
├── core/
│   └── core.csv                    # 核心詞庫（基礎通用詞彙）
└── domains/
    ├── software-development.csv    # 軟體開發
    ├── user-interface.csv          # 使用者介面
    ├── network-cloud.csv           # 網路雲端
    ├── hardware-3c.csv             # 硬體3C
    ├── operating-system.csv        # 作業系統
    ├── business-finance.csv        # 商業金融
    ├── social-media.csv            # 社群媒體
    └── ai-emerging-tech.csv        # AI新興技術
```

### 2. CSV 格式規範

每個詞庫檔案都必須包含以下欄位：

| 欄位 | 說明 | 範例 | 必填 |
|------|------|------|------|
| `id` | 唯一識別碼 | `software-term-1` | ✅ |
| `taiwan` | 台灣建議用語 | `軟體` | ✅ |
| `china_simplified` | 大陸簡體用語 | `软件` | ✅ |
| `china_traditional` | 大陸繁體用語 | `軟件` | ✅ |
| `english` | 英文對照 | `software` | ❌ |
| `confidence` | 信心度 (0.0-1.0) | `0.95` | ✅ |
| `category` | 分類 | `mainland-term` | ✅ |
| `reason` | 建議理由 | `台灣技術標準用語` | ✅ |
| `domain` | 所屬領域 | `tech` | ✅ |
| `match_type` | 匹配模式 | `exact` | ❌ |
| `context_before` | 前置語境 | `開發,設計` | ❌ |
| `context_after` | 後置語境 | `工程師,架構` | ❌ |
| `context_exclude` | 排除語境 | `硬體` | ❌ |
| `autofix_safe` | 安全修復 | `true` | ❌ |

### 3. 詞目分類標準

#### 匹配模式 (`match_type`)

- **`exact`**（預設）：精確匹配
  - 適用：確定的專有名詞替換
  - 範例：「軟件」→「軟體」

- **`word_boundary`**：詞邊界匹配
  - 適用：避免誤配詞語片段
  - 範例：避免「質量控制」中的「量」被誤配

- **`context_sensitive`**：語境敏感匹配
  - 適用：同形異義詞
  - 範例：「質量」在商業 vs 物理語境

#### 安全修復等級 (`autofix_safe`)

- **`true`**：安全修復
  - 條件：99% 確定的替換
  - 範例：「網絡」→「網路」
  - 行為：`--fix` 時自動修復

- **`false`**：建議修復
  - 條件：需人工判斷的替換
  - 範例：語境敏感詞、專業術語
  - 行為：僅提供建議

#### 信心度指引 (`confidence`)

| 分數 | 說明 | 範例 |
|------|------|------|
| 0.95-1.0 | 極高信心，標準替換 | 軟件→軟體 |
| 0.85-0.94 | 高信心，常見用語 | 數據→資料 |
| 0.70-0.84 | 中等信心，語境相關 | 質量→品質 |
| 0.50-0.69 | 低信心，需謹慎 | 專業術語 |

## 📝 範例詞目

### 基本詞目（安全修復）
```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
software-basic,軟體,软件,軟件,software,0.95,mainland-term,台灣技術標準用語,tech,exact,,,，true
```

### 語境敏感詞目
```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
quality-business,品質,质量,質量,quality,0.90,mainland-term,商業品質管理,business,context_sensitive,"產品,服務,商品","控制,管理,標準",物理,false
quality-physics,質量,质量,質量,mass,0.95,mainland-term,物理學質量單位,physics,context_sensitive,"密度,重量,公斤","守恆,轉換,定律",商業,false
```

### 專業術語詞目
```csv
id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe
ai-algorithm,演算法,算法,算法,algorithm,0.90,mainland-term,台灣資訊科學標準用語,ai,word_boundary,,,，true
```

## 🚀 開發工作流程

### 1. 修改詞庫
```bash
# 編輯對應的 CSV 檔案
vim dictionaries-csv/domains/software-development.csv
```

### 2. 建構詞庫
```bash
# 將 CSV 轉換為運行時 JSON 格式
npm run dict:build
```

### 3. 驗證詞庫
```bash
# 檢查格式和重複項
npm run dict:validate
```

### 4. 測試功能
```bash
# 測試特定詞彙檢測
npm run dev -- check test-file.md --domains software-development

# 測試自動修復
npm run dev -- check test-file.md --domains software-development --fix
```

### 5. 運行測試
```bash
# 確保所有測試通過
npm run test
npm run type-check
npm run lint
```

## 🎯 品質檢查清單

提交前請確認：

- [ ] **格式正確**：所有必填欄位已填寫
- [ ] **ID 唯一**：沒有重複的詞目 ID
- [ ] **信心度合理**：0.5-1.0 之間，符合品質標準
- [ ] **語境設定**：語境敏感詞已正確設定前後文
- [ ] **安全等級**：`autofix_safe` 設定合理
- [ ] **測試通過**：建構和驗證無錯誤
- [ ] **實際測試**：在真實文本中測試功能

## 🛠️ 常見問題

### Q: 如何處理一詞多義？
A: 使用 `context_sensitive` 匹配模式，為每個語義創建獨立項目：

```csv
# 商業語境
business-quality,品質,质量,質量,quality,0.90,mainland-term,...,business,context_sensitive,"商業,產品",...

# 物理語境
physics-mass,質量,质量,質量,mass,0.95,mainland-term,...,physics,context_sensitive,"物理,密度",...
```

### Q: 何時設定 `autofix_safe=true`？
A: 僅當替換 99% 確定正確時：
- ✅ 標準技術用語：軟件→軟體
- ✅ 明確地域差異：網絡→網路
- ❌ 語境敏感詞：質量→?
- ❌ 專業術語爭議：算法→演算法

### Q: 如何設定語境規則？
A: 語境規則支援 OR 邏輯：

```csv
# 任一前置詞 OR 任一後置詞匹配即可觸發
context_before,"詞1,詞2,詞3"
context_after,"詞A,詞B,詞C"
context_exclude,"排除詞"
```

### Q: 新增領域如何處理？
A:
1. 在 `dictionaries-csv/domains/` 新增 CSV 檔案
2. 更新 `tools/build-dict.ts` 的 `formatDomainName()` 函數
3. 重新建構詞庫：`npm run dict:build`

## 📞 需要幫助？

- **討論區**：[GitHub Discussions](https://github.com/Termdock-dev/twlint/discussions)
- **問題回報**：[GitHub Issues](https://github.com/Termdock-dev/twlint/issues)
- **即時討論**：加入我們的開發者社群

---

**讓我們一起打造更精確的中文用語檢測工具！** 🚀