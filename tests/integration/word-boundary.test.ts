import { describe, it, expect, beforeAll } from 'vitest'
import { MainlandTermsRule } from '../../src/core/rules/mainland-terms'
import { DictionaryManager } from '../../src/core/dictionary-manager'

// 中文沒有空格分詞，純字串比對會跨詞邊界命中（判斷點裡的「斷點」）。
// 讀實際詞庫，所以放整合測試；例句取自台灣人寫的文件
describe('Word boundaries in mainland-term matching (all built-in dictionaries)', () => {
  let rule: MainlandTermsRule
  const flagged = async (text: string): Promise<string[]> =>
    (await rule.check(text)).map(issue => issue.message.split("'")[1])

  beforeAll(async () => {
    const dictManager = new DictionaryManager()
    for (const name of ['core', 'business-finance', 'hardware-3c', 'network-cloud', 'operating-system',
      'social-media', 'software-development', 'user-interface', 'ai-emerging-tech']) {
      await dictManager.loadDictionary(name)
    }
    rule = new MainlandTermsRule(dictManager)
  })

  it.each([
    ['最容易搞混的判斷點：洗完臉很快就緊', '斷點'],
    ['三、胜肽主要子類型與搜尋熱度', '子類'],
    ['超微結構檢查找不到黑色素小體', '查找'],
    // 後文帶「授權」：滿足「激活」的語境條件，只剩詞邊界能擋
    ['高刺激活性成分的授權說明', '激活'],
    ['git-workflow.md 定義不變量', '變量'],
    ['這三種組合同時出現在晚間流程', '合同'],
    ['日常量極低，不會引發潮紅', '常量'],
    // 以下兩句不靠詞邊界擋（拿掉過濾也不會命中），只驗證不誤報
    ['她是一名英國女子網球運動員', '子網'],
    ['正規的國際賽事與國內聯賽', '內聯']
  ])('does not match across a word boundary: %s', async (text, term) => {
    expect(await flagged(text)).not.toContain(term)
  })

  it.each([
    ['這個軟件很好用', '軟件'],
    ['網絡連接失敗', '網絡'],
    ['在程式碼加斷點後重新執行', '斷點'],
    ['宣告一個變量', '變量'],
    ['建立一個子類繼承父類', '子類'],
    ['在編輯器裡查找替換', '查找']
  ])('still matches whole words: %s', async (text, term) => {
    expect(await flagged(text)).toContain(term)
  })
})
