import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFile } from 'fs/promises'
import { DictionaryManager } from '../../src/core/dictionary-manager'
import { MainlandTermsRule } from '../../src/core/rules/mainland-terms'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([])
}))

// 建議詞包含原詞的詞條（終端→終端機、子網→子網路）：
// 文字已經是建議詞時不能再報，--fix 也不能再疊一次
const fixture = {
  metadata: { name: 'replacement-fixture', version: '1.0', entries: 2 },
  lookup: {
    '終端': { taiwan: '終端機', confidence: 0.9, match_type: 'exact', autofix_safe: true },
    '子網': { taiwan: '子網路', confidence: 0.9, match_type: 'exact', autofix_safe: true }
  }
}

describe('Terms whose Taiwan replacement contains the term', () => {
  let rule: MainlandTermsRule

  beforeEach(async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(fixture))
    const dictManager = new DictionaryManager()
    await dictManager.loadDictionary('replacement-fixture')
    rule = new MainlandTermsRule(dictManager)
  })

  it('does not flag text that already uses the replacement', async () => {
    expect(await rule.check('打開終端機，設定子網路')).toEqual([])
  })

  it('does not double the replacement on fix', async () => {
    expect(await rule.fix('打開終端機，設定子網路')).toBe('打開終端機，設定子網路')
  })

  it('still flags and fixes the bare term', async () => {
    const issues = await rule.check('打開終端，設定子網')
    expect(issues.map(issue => issue.suggestions?.[0])).toEqual(['終端機', '子網路'])
    expect(await rule.fix('打開終端，設定子網')).toBe('打開終端機，設定子網路')
  })
})
