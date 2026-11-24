import { Converter } from 'opencc-js'
import STCharacters from 'opencc-js/dict/STCharacters'
import STPhrases from 'opencc-js/dict/STPhrases'
import type { Rule, Issue } from '../../types.js'

// opencc 單字簡繁表裡的字才可能是簡體字。其他差異來自詞組或異體字表
// （家具→傢俱、周年→週年、了解→瞭解），那是用字選擇，不是簡體字。
const SIMPLIFIED_CANDIDATES = new Set(STCharacters.split('|').map(entry => entry.split(' ')[0]))

// 在 opencc 詞組表裡保持原樣的字，本身也是正體字（公里的「里」、玄武岩的「岩」）。
// 這類字單獨出現時判斷不了，只在同一行已有確定的簡體字時才回報。
const ALSO_TRADITIONAL = collectCharsKeptInPhrases(STPhrases)

// 台灣慣用「台」，不改成「臺」
const TAIWAN_PREFERRED = new Set(['台'])

type CharKind = 'simplified' | 'also-traditional' | 'not-simplified'

interface CharDifference {
  simplified: string
  traditional: string
  column: number
}

function collectCharsKeptInPhrases(phrases: string): Set<string> {
  const kept = new Set<string>()

  for (const entry of phrases.split('|')) {
    const [simplified, traditional] = entry.split(' ').map(phrase => [...phrase])
    if (!traditional || simplified.length !== traditional.length) continue

    simplified.forEach((char, i) => {
      if (char === traditional[i] && SIMPLIFIED_CANDIDATES.has(char)) kept.add(char)
    })
  }

  return kept
}

function classify(char: string): CharKind {
  if (!SIMPLIFIED_CANDIDATES.has(char) || TAIWAN_PREFERRED.has(char)) return 'not-simplified'
  return ALSO_TRADITIONAL.has(char) ? 'also-traditional' : 'simplified'
}

export class SimplifiedCharsRule implements Rule {
  readonly name = 'simplified-chars'
  private converter: ReturnType<typeof Converter>

  constructor() {
    this.converter = Converter({ from: 'cn', to: 'tw' })
  }

  async check(text: string): Promise<Issue[]> {
    return text.split('\n').flatMap((line, lineIndex) =>
      this.findReportable(line).map(diff => ({
        line: lineIndex + 1,
        column: diff.column + 1,
        message: `簡體字 '${diff.simplified}' 建議使用繁體字 '${diff.traditional}'`,
        severity: 'error' as const,
        rule: this.name,
        suggestions: [diff.traditional],
        fixable: true
      }))
    )
  }

  async fix(text: string): Promise<string> {
    return text.split('\n').map(line => {
      const chars = line.split('')
      for (const diff of this.findReportable(line)) {
        chars[diff.column] = diff.traditional
      }
      return chars.join('')
    }).join('\n')
  }

  private findReportable(line: string): CharDifference[] {
    const converted = this.converter(line)
    if (converted === line) return []

    const differences: Array<CharDifference & { kind: CharKind }> = []
    for (let i = 0; i < Math.min(line.length, converted.length); i++) {
      if (line[i] === converted[i]) continue
      differences.push({ simplified: line[i], traditional: converted[i], column: i, kind: classify(line[i]) })
    }

    if (!differences.some(diff => diff.kind === 'simplified')) return []

    return differences
      .filter(diff => diff.kind !== 'not-simplified')
      .map(({ simplified, traditional, column }) => ({ simplified, traditional, column }))
  }
}
