import { describe, it, expect, beforeAll } from 'vitest'
import { MainlandTermsRule } from '../../src/core/rules/mainland-terms'
import { DictionaryManager } from '../../src/core/dictionary-manager'

// 驗證實際詞庫資料的語境設定，所以讀建置出來的詞庫檔；所有案例共用一次載入
describe('Dictionary context rules (built dictionaries)', () => {
  let rule: MainlandTermsRule

  beforeAll(async () => {
    const dictManager = new DictionaryManager()
    await dictManager.loadDictionary('user-interface')
    rule = new MainlandTermsRule(dictManager)
  })

  it('does not flag 替換 in ordinary Taiwanese prose', async () => {
    // 取自 CONTRIBUTING.md
    const issues = await rule.check('用於明確的替換，例如「軟體」的寫法')
    expect(issues.find(issue => issue.suggestions?.includes('取代'))).toBeUndefined()
  })

  it('still flags 替換 in the editor find-and-replace sense', async () => {
    const issues = await rule.check('按 Ctrl+H 開啟查找替換')
    expect(issues.some(issue => issue.suggestions?.includes('取代'))).toBe(true)
  })
})

// 保守立場：台灣一般文章也常用的詞只在特定語境才報。例句取自台灣人寫的文件
describe('Conservative context for general-usage terms (all built-in dictionaries)', () => {
  let rule: MainlandTermsRule
  const replacementsIn = async (text: string): Promise<string[]> =>
    (await rule.check(text)).flatMap(issue => issue.suggestions ?? [])

  beforeAll(async () => {
    const dictManager = new DictionaryManager()
    for (const name of ['core', 'business-finance', 'hardware-3c', 'network-cloud', 'operating-system',
      'social-media', 'software-development', 'user-interface', 'ai-emerging-tech']) {
      await dictManager.loadDictionary(name)
    }
    rule = new MainlandTermsRule(dictManager)
  })

  it.each([
    ['引用論文數據時，必須比對實驗條件', '資料'],
    ['主題屬於防曬成分科學集群', '叢集'],
    ['其中 65% 回報經期前後痘痘會惡化', '報酬'],
    ['用了半年，選購時找得到明確濃度數字的版本', '數位的'],
    ['可以觀察上線後的用戶回饋再微調', '使用者'],
    ['只要標了「無 X」就合規', '法規遵循'],
    ['前列腺素再去激活黑色素細胞', '啟用'],
    ['講經前痘的臨床統計，不能斷言因果鏈', '宣告'],
    ['不擦防曬等於重啟黑色素訊號', '重新啟動'],
    ['判斷是否保留、微調或回復原狀', '回覆'],
    ['因為靜電交互作用變強了', '互動']
  ])('does not flag general usage: %s', async (text, replacement) => {
    expect(await replacementsIn(text)).not.toContain(replacement)
  })

  it.each([
    ['從資料庫讀取數據後寫入 JSON 檔案', '資料'],
    ['在 Kubernetes 上部署三個節點的集群', '叢集'],
    ['這檔基金的年化回報約 6%', '報酬'],
    ['登入後在帳號設定裡修改用戶名稱', '使用者'],
    ['輸入產品金鑰激活 Windows', '啟用'],
    ['在單元測試裡用斷言檢查回傳值', '宣告'],
    ['更新後重啟伺服器', '重新啟動'],
    ['研究人機交互的設計', '互動']
  ])('still flags the domain sense: %s', async (text, replacement) => {
    expect(await replacementsIn(text)).toContain(replacement)
  })
})
