import { describe, it, expect, beforeEach } from 'vitest'
import { DictionaryManager } from '../../src/core/dictionary-manager'
import { MainlandTermsRule } from '../../src/core/rules/mainland-terms'

// 建議詞包含原詞的詞條（終端→終端機、子網→子網路）：
// 文字已經是建議詞時不能再報，--fix 也不能再疊一次
describe('Terms whose Taiwan replacement contains the term', () => {
  let rule: MainlandTermsRule

  beforeEach(async () => {
    const dictManager = new DictionaryManager()
    await dictManager.loadDictionary('operating-system')
    await dictManager.loadDictionary('network-cloud')
    rule = new MainlandTermsRule(dictManager)
  })

  it('does not flag text that already uses the replacement', async () => {
    expect(await rule.check('打開終端機，設定子網路')).toEqual([])
  })

  it('does not double the replacement on fix', async () => {
    expect(await rule.fix('打開終端機，設定子網路')).toBe('打開終端機，設定子網路')
  })

  it('still flags the bare term', async () => {
    const issues = await rule.check('在 Linux 打開終端，設定 IP 子網')
    expect(issues.map(issue => issue.suggestions?.[0])).toEqual(['終端機', '子網路'])
  })
})
