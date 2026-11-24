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
