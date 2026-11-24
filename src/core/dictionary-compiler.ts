// CSV 詞庫 → 執行期查詢表。內建詞庫在建置時（tools/build-dict.ts）編譯，
// 使用者的自訂詞表在執行時編譯，兩邊都走這裡，規則才會一致。

import Papa from 'papaparse'
import type { DictEntry, CompiledDict, DictLookupEntry, ContextRule, MatchType } from '../types.js'
import { findUnmatchableRows, MIN_TERM_LENGTH } from './matchable-term.js'

export interface CSVRow {
  id: string
  taiwan: string
  china_simplified: string
  china_traditional: string
  english?: string
  confidence: string
  category: string
  reason: string
  domain: string
  match_type?: string
  context_before?: string
  context_after?: string
  context_exclude?: string
  autofix_safe?: string
}

export function parseCSV(content: string): CSVRow[] {
  return Papa.parse<CSVRow>(content, { header: true, skipEmptyLines: true }).data
}

/**
 * 檢查詞表 CSV：解析錯誤、必填欄位、confidence 是否為數字、單字詞條、沒有任何詞條。
 * dict:validate 與自訂詞表共用這份檢查；回傳空陣列表示沒有問題。
 */
export function findCSVProblems(content: string): string[] {
  const { data, errors } = Papa.parse<CSVRow>(content, { header: true, skipEmptyLines: true })
  const problems = errors.map(error => `CSV 格式錯誤（第 ${(error.row ?? 0) + 2} 行）: ${error.message}`)

  if (data.length === 0) problems.push('沒有任何詞條')

  data.forEach((row, index) => {
    const line = `第 ${index + 2} 行`
    if (!row.id) problems.push(`${line}: 缺少 id`)
    if (!row.taiwan) problems.push(`${line}: 缺少 taiwan`)
    if (!row.china_simplified) problems.push(`${line}: 缺少 china_simplified`)
    if (!row.china_traditional) problems.push(`${line}: 缺少 china_traditional`)
    if (!row.confidence || isNaN(Number(row.confidence))) problems.push(`${line}: confidence 必須是數字`)
    if (!row.category) problems.push(`${line}: 缺少 category`)
    if (!row.reason) problems.push(`${line}: 缺少 reason`)
    if (!row.domain) problems.push(`${line}: 缺少 domain`)
  })

  for (const id of findUnmatchableRows(data)) {
    problems.push(`${id}: 單一個字的詞條不收（至少 ${MIN_TERM_LENGTH} 個字）`)
  }

  return problems
}

/**
 * 編譯一組 CSV 列。缺必要欄位的列略過（格式檢查交給 dict:validate），
 * 單一個字的詞條直接丟錯。
 */
export function compileRows(rows: CSVRow[], source: string): DictEntry[] {
  const validRows = rows.filter(isCompleteRow)
  const unmatchable = findUnmatchableRows(validRows)
  if (unmatchable.length > 0) {
    throw new Error(
      `${source} 含有單一個字的詞條（詞庫只收 ${MIN_TERM_LENGTH} 個字以上）: ${unmatchable.join(', ')}`
    )
  }
  return validRows.map(createDictEntry)
}

export function buildDictionary(entries: DictEntry[], name: string, version: string): CompiledDict {
  return {
    metadata: { name, version, entries: entries.length },
    lookup: optimizeForLookup(entries)
  }
}

function isCompleteRow(row: CSVRow): boolean {
  return !!(
    row.id &&
    row.taiwan &&
    row.china_simplified &&
    row.confidence &&
    row.category
  )
}

function splitList(value?: string): string[] | undefined {
  if (!value || !value.trim()) return undefined
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function parseContext(row: CSVRow): ContextRule {
  const context: ContextRule = {}
  const before = splitList(row.context_before)
  const after = splitList(row.context_after)
  const exclude = splitList(row.context_exclude)
  if (before) context.before = before
  if (after) context.after = after
  if (exclude) context.exclude = exclude
  return context
}

function createDictEntry(row: CSVRow): DictEntry {
  const context = parseContext(row)

  return {
    id: row.id,
    taiwan: row.taiwan,
    china_simplified: row.china_simplified,
    china_traditional: row.china_traditional,
    english: row.english,
    confidence: parseFloat(row.confidence),
    category: row.category,
    reason: row.reason,
    domain: row.domain,
    match_type: (row.match_type || 'exact') as MatchType,
    context: Object.keys(context).length > 0 ? context : undefined,
    autofix_safe: row.autofix_safe === 'true'
  }
}

function optimizeForLookup(entries: DictEntry[]): Record<string, DictLookupEntry> {
  const lookup: Record<string, DictLookupEntry> = {}

  for (const entry of entries) {
    const entryData = {
      taiwan: entry.taiwan,
      confidence: entry.confidence,
      category: entry.category,
      reason: entry.reason,
      match_type: entry.match_type || 'exact',
      autofix_safe: entry.autofix_safe || false,
      ...(entry.context && { context: entry.context })
    }

    // 使用 ID 作為唯一鍵來避免覆蓋，但保留原始詞彙作為主鍵
    const mainKey = entry.china_simplified
    const uniqueKey = `${mainKey}_${entry.id.replace(/[^a-zA-Z0-9]/g, '_')}`

    // 主鍵：原始簡體字（保持向後相容）
    if (!lookup[mainKey] || entry.match_type === 'exact') {
      // exact 匹配優先，或者第一次出現
      lookup[mainKey] = entryData
    }

    // 唯一鍵：用於語境特殊匹配
    lookup[uniqueKey] = entryData

    // 如果有不同的繁體寫法，也加入查找表
    if (entry.china_traditional && entry.china_traditional !== entry.china_simplified) {
      const traditionalKey = entry.china_traditional
      const traditionalUniqueKey = `${traditionalKey}_${entry.id.replace(/[^a-zA-Z0-9]/g, '_')}`

      if (!lookup[traditionalKey] || entry.match_type === 'exact') {
        lookup[traditionalKey] = entryData
      }
      lookup[traditionalUniqueKey] = entryData
    }
  }

  return lookup
}
