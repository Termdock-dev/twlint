#!/usr/bin/env tsx

// 詞條精準度評估：用兩種語料逐詞統計命中次數，找出容易誤判的詞條。
//
//   npx tsx tools/eval-precision.ts --tw <台灣語料...> --cn <大陸用語語料...> [--deep] [--custom x.csv] [--limit 40]
//
// - 台灣語料（--tw）：台灣正體中文寫的文字。這裡的每個命中都是可能的誤判。
// - 大陸用語語料（--cn）：同內容的大陸用語版本（例如維基 zh-cn 與 zh-tw 版）。這裡的命中代表抓得到。
// 兩份語料內容越接近，比較越有意義。路徑可以是檔案、資料夾或 glob。

import { TWLinter } from '../src/core/linter.js'
import type { TWLintUserConfig } from '../src/core/config-schema.js'
import type { LintResult } from '../src/types.js'
import { readFile } from 'fs/promises'

interface TermStats {
  term: string
  replacement: string
  severity: string
  tw: number
  cn: number
  twFiles: Set<string>
  twSamples: string[]
}

function parseArgs(argv: string[]): { tw: string[]; cn: string[]; deep: boolean; custom: string[]; limit: number } {
  const args = { tw: [] as string[], cn: [] as string[], deep: false, custom: [] as string[], limit: 40 }
  let target: string[] | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--tw') target = args.tw
    else if (arg === '--cn') target = args.cn
    else if (arg === '--custom') target = args.custom
    else if (arg === '--deep') { args.deep = true; target = null }
    else if (arg === '--limit') { args.limit = Number(argv[++i]); target = null }
    else if (target) target.push(arg)
    else throw new Error(`Unexpected argument: ${arg}`)
  }
  if (args.tw.length === 0) throw new Error('Need at least one --tw path')
  return args
}

// 傳進來的每個檔案都套用 mainland-terms（不限副檔名），否則沒檢查的檔案會被算成 0 命中
async function lint(side: string, paths: string[], deep: boolean, custom: string[]): Promise<LintResult[]> {
  const config: TWLintUserConfig = [
    { customDictionaries: custom },
    { files: ['**/*'], rules: { 'simplified-chars': 'off', 'mainland-terms': 'warning' } }
  ]
  const results = await new TWLinter(config, { deep }).lintFiles(paths)
  // 路徑打錯、glob 沒命中或全被 .twlintignore 排除時，0 命中沒有比較意義
  if (results.length === 0) throw new Error(`${side} 語料沒有任何檔案可檢查: ${paths.join(' ')}`)
  return results
}

function context(lines: string[], line: number, column: number): string {
  const text = lines[line - 1] ?? ''
  return text.slice(Math.max(0, column - 13), column + 9).replace(/\s+/g, ' ').replace(/\|/g, '\\|')
}

async function collect(results: LintResult[], side: 'tw' | 'cn', stats: Map<string, TermStats>): Promise<void> {
  for (const result of results) {
    if (result.messages.length === 0) continue
    const lines = (await readFile(result.filePath, 'utf-8')).split('\n')
    for (const message of result.messages) {
      if (message.rule !== 'mainland-terms') continue
      const term = message.message.split("'")[1]
      const replacement = message.suggestions?.[0] ?? ''
      const key = `${term}→${replacement}`
      const entry = stats.get(key) ?? { term, replacement, severity: message.severity, tw: 0, cn: 0, twFiles: new Set(), twSamples: [] }
      entry[side]++
      if (side === 'tw') {
        entry.twFiles.add(result.filePath)
        if (entry.twSamples.length < 3) entry.twSamples.push(context(lines, message.line, message.column))
      }
      stats.set(key, entry)
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const stats = new Map<string, TermStats>()

  const twResults = await lint('--tw', args.tw, args.deep, args.custom)
  await collect(twResults, 'tw', stats)
  const cnResults = args.cn.length > 0 ? await lint('--cn', args.cn, args.deep, args.custom) : []
  await collect(cnResults, 'cn', stats)

  const rows = [...stats.values()].sort((a, b) => b.tw - a.tw || a.cn - b.cn)
  const totalTw = rows.reduce((sum, row) => sum + row.tw, 0)
  const totalCn = rows.reduce((sum, row) => sum + row.cn, 0)

  console.log(`台灣語料 ${twResults.length} 個檔案，命中 ${totalTw}（皆為可能的誤判）`)
  if (cnResults.length > 0) console.log(`大陸用語語料 ${cnResults.length} 個檔案，命中 ${totalCn}`)
  console.log('')
  console.log('| 詞 → 建議 | 嚴重度 | 台灣語料命中 | 檔案數 | 大陸用語語料命中 | 台灣語料例句 |')
  console.log('|---|---|---|---|---|---|')
  for (const row of rows.filter(r => r.tw > 0).slice(0, args.limit)) {
    console.log(`| ${row.term} → ${row.replacement} | ${row.severity} | ${row.tw} | ${row.twFiles.size} | ${row.cn} | ${row.twSamples.join(' / ')} |`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
