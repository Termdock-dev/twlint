import { readFile } from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { CompiledDict, MatchResult, DictLookupEntry } from '../types.js'
import { formatError } from '../utils/error-utils.js'
import { MatchStrategyRegistry } from './matching/match-strategies.js'
import { LRUCache } from './lru-cache.js'
import { isMatchableTerm } from './matchable-term.js'
import { parseCSV, compileRows, buildDictionary, findCSVProblems } from './dictionary-compiler.js'

// 中文沒有空格分詞，用 ICU 的詞語切分（Node 內建 Intl.Segmenter）找出詞邊界的位置
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' })

function wordBoundaries(text: string): Set<number> {
  const boundaries = new Set<number>([0, text.length])
  for (const { index, segment } of segmenter.segment(text)) {
    boundaries.add(index)
    boundaries.add(index + segment.length)
  }
  return boundaries
}

// 建議詞包含原詞時（終端→終端機），命中位置周圍的文字可能已經是建議詞。
// 原詞等於建議詞的保護詞條不在此列：它們要留下來，在去重時蓋掉較短的命中。
function readsAsReplacement(text: string, start: number, term: string, replacement: string): boolean {
  if (term === replacement) return false
  for (let offset = replacement.indexOf(term); offset !== -1; offset = replacement.indexOf(term, offset + 1)) {
    if (start - offset >= 0 && text.startsWith(replacement, start - offset)) return true
  }
  return false
}

// 舊詞庫名稱在沒有對應檔案時改載入的詞庫。extended 過去是 academic.csv 的舊版建置結果；
// dictionaries-csv/extended/ 有其他 CSV 時會建出真正的 extended.json，這時照常載入它。
const LEGACY_DICTIONARY_FALLBACKS: Record<string, string> = {
  extended: 'academic'
}

export class DictionaryManager {
  private cache = new LRUCache<string, CompiledDict>(20) // 限制快取 20 個詞庫
  private readonly dictionariesPath: string
  private readonly strategyRegistry: MatchStrategyRegistry

  constructor(dictionariesPath?: string, maxCacheSize?: number) {
    // 初始化快取，支援自定義大小
    this.cache = new LRUCache<string, CompiledDict>(maxCacheSize || 20)

    if (dictionariesPath) {
      this.dictionariesPath = dictionariesPath
    } else {
      // 動態解析詞庫路徑：相對於編譯後的 JS 檔案位置
      const currentDir = dirname(fileURLToPath(import.meta.url))
      this.dictionariesPath = join(currentDir, '..', 'dictionaries')
    }
    this.strategyRegistry = new MatchStrategyRegistry()
  }

  async loadDictionary(name: string): Promise<CompiledDict> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!
    }

    try {
      const content = await this.readDictionaryFile(name)
      const dict: CompiledDict = JSON.parse(content)

      this.cache.set(name, dict)
      return dict
    } catch (error) {
      throw new Error(`Failed to load dictionary "${name}": ${formatError(error)}`)
    }
  }

  /**
   * 載入使用者的自訂詞表（CSV，格式同 dictionaries-csv/），執行時編譯。
   * 讀不到或有任何格式問題直接丟錯：設定檔明確指定的詞表不能靜默略過或只載入一部分。
   */
  async loadCustomDictionary(path: string): Promise<CompiledDict> {
    const absolutePath = resolve(path)
    const key = `custom:${absolutePath}`
    const cached = this.cache.get(key)
    if (cached) return cached

    try {
      const content = await readFile(absolutePath, 'utf-8')
      const problems = findCSVProblems(content)
      if (problems.length > 0) {
        const shown = problems.slice(0, 5).join('; ')
        throw new Error(problems.length > 5 ? `${shown}; 另有 ${problems.length - 5} 個問題` : shown)
      }
      const entries = compileRows(parseCSV(content), path)
      const dict = buildDictionary(entries, key, 'custom')
      dict.metadata.custom = true
      this.cache.set(key, dict)
      return dict
    } catch (error) {
      throw new Error(`Failed to load custom dictionary "${path}": ${formatError(error)}`)
    }
  }

  private async readDictionaryFile(name: string): Promise<string> {
    try {
      return await readFile(join(this.dictionariesPath, `${name}.json`), 'utf-8')
    } catch (error) {
      const fallback = LEGACY_DICTIONARY_FALLBACKS[name]
      if (!fallback || (error as { code?: string }).code !== 'ENOENT') throw error
      return readFile(join(this.dictionariesPath, `${fallback}.json`), 'utf-8')
    }
  }

  findMatches(text: string): MatchResult[] {
    const allMatches: MatchResult[] = []

    for (const dict of this.cache.values()) {
      // 先處理所有基本詞彙匹配
      const basicTerms = Object.keys(dict.lookup).filter(term =>
        !term.includes('_') && isMatchableTerm(term)
      )
      const contextVariants = Object.keys(dict.lookup).filter(term => {
        if (!term.includes('_')) {
          return false
        }

        const [baseTerm] = term.split('_', 1)
        return isMatchableTerm(baseTerm)
      })

      // 處理基本詞彙
      for (const term of basicTerms) {
        const entry = dict.lookup[term]
        const strategy = this.strategyRegistry.getStrategy(entry.match_type || 'exact')
        if (!strategy) continue

        const matches = strategy.match(text, term, entry.context)

        for (const match of matches) {
          this.addMatch(text, allMatches, match, entry, dict.metadata)
        }

        // 對於語境敏感詞彙，同時檢查其變體
        if (entry.match_type === 'context_sensitive') {
          const variants = contextVariants.filter(variant =>
            variant.startsWith(term + '_') || variant.startsWith(term.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '') + '_')
          )

          for (const variant of variants) {
            const variantEntry = dict.lookup[variant]
            const variantStrategy = this.strategyRegistry.getStrategy(variantEntry.match_type || 'exact')
            if (!variantStrategy) continue

            const variantMatches = variantStrategy.match(text, term, variantEntry.context)

            for (const match of variantMatches) {
              this.addMatch(text, allMatches, match, variantEntry, dict.metadata, true)
            }
          }
        }
      }
    }

    // 0. 只留下頭尾都在詞邊界上的命中，避免「判斷點」裡的「斷點」這類跨詞命中
    const boundaries = wordBoundaries(text)
    const wholeWordMatches = allMatches.filter(match => boundaries.has(match.start) && boundaries.has(match.end))
    allMatches.length = 0
    allMatches.push(...wholeWordMatches)

    // 1. 排序：優先長度，其次信心度，最後位置
    // Sort logic: Longest length > Higher confidence > Earlier position
    allMatches.sort((a, b) => {
      const lenA = a.end - a.start
      const lenB = b.end - b.start
      if (lenA !== lenB) return lenB - lenA // Longest first

      // 同長度時自訂詞表優先：使用者的決定蓋過內建詞庫（自訂「腳本→腳本」就等於允許這個詞）
      if (!!a.custom !== !!b.custom) return a.custom ? -1 : 1

      if (Math.abs(a.confidence - b.confidence) > 0.01) {
        return b.confidence - a.confidence // Higher confidence first
      }

      return a.start - b.start // Earlier position first
    })

    // 2. 去重：過濾掉與高優先級匹配重疊的結果
    // Deduplication using Interval Merging (O(N log N) or O(N) since already sorted by length?)
    // Actually, simply maintaining a list of disjoint intervals is enough.
    // Since matches are sorted by Length DESC, we iterate and check if the current match
    // overlaps with ANY already accepted match.
    // To do this efficiently:
    // We can use a simple boolean array if text is short, but text can be long.
    // Better: Maintain a sorted list of accepted intervals [start, end).
    // For each candidate, check if it overlaps with any interval in the list.
    // Since we process in priority order, if it doesn't overlap, we add it.

    const acceptedMatches: MatchResult[] = []

    // 為了效能，我們實作一個簡單的區間檢查
    // 由於我們可能有大量的匹配，線性掃描 acceptedMatches (O(M)) 對每個候選 (N) -> O(NM)。
    // 如果 M 很大，這會慢。
    // 優化：使用一個簡單的遮罩或區間樹？
    // 考量到 JS 的 overhead，對於一般長度的文本，線性掃描可能已經足夠快。
    // 但 Reviewer 提到效能，我們來做一個稍微好一點的檢查。
    // 我們可以使用一個 Uint8Array 來標記被佔用的位置，如果文本長度允許 (e.g. < 1MB)。
    // 這是 O(1) 檢查，O(L) 標記。

    // 如果文本太長，回退到區間檢查。
    // 假設大部分檢查的文本都在 100KB 以內。

    if (text.length < 100000) {
      const occupied = new Uint8Array(text.length)
      for (const candidate of allMatches) {
        let isOverlapping = false
        // Check overlap
        for (let i = candidate.start; i < candidate.end; i++) {
          if (occupied[i] === 1) {
            isOverlapping = true
            break
          }
        }

        if (!isOverlapping) {
          acceptedMatches.push(candidate)
          // Mark occupied
          for (let i = candidate.start; i < candidate.end; i++) {
            occupied[i] = 1
          }
        }
      }
    } else {
      // Fallback for very long text: Interval List
      // Keep intervals sorted by start
      const acceptedIntervals: { start: number, end: number }[] = []

      for (const candidate of allMatches) {
        // Binary search or linear scan? Linear scan is O(M).
        // Check overlap with any accepted interval
        const isOverlapping = acceptedIntervals.some(interval =>
          candidate.start < interval.end && candidate.end > interval.start
        )

        if (!isOverlapping) {
          acceptedMatches.push(candidate)
          acceptedIntervals.push({ start: candidate.start, end: candidate.end })
          // No need to sort acceptedIntervals every time if we just use .some()
          // But for binary search we would need to maintain order.
          // Given the typical number of matches, .some() is acceptable here compared to strict O(N^2) if M is small.
          // Wait, previous logic WAS O(N*M) where M is accepted count. This is same.
          // But Uint8Array is O(N * Len).
        }
      }
    }

    // 3. 最終排序：按位置輸出，符合閱讀順序
    return acceptedMatches.sort((a, b) => a.start - b.start)
  }

  private addMatch(
    text: string,
    allMatches: MatchResult[],
    match: MatchResult,
    entry: DictLookupEntry,
    dict: CompiledDict['metadata'],
    isVariant = false
  ): void {
    if (readsAsReplacement(text, match.start, match.term, entry.taiwan)) return

    allMatches.push({
      ...match,
      replacement: entry.taiwan,
      confidence: entry.confidence,
      rule: `${dict.name}-${entry.match_type || 'exact'}${isVariant ? '-variant' : ''}`,
      autofix_safe: entry.autofix_safe || false,
      custom: dict.custom || false
    })
  }

  async scanAvailableDictionaries(): Promise<string[]> {
    try {
      const { readdir } = await import('fs/promises')
      const files = await readdir(this.dictionariesPath)

      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .filter(name => name !== 'index') // 排除索引文件
    } catch {
      console.warn(`Failed to scan dictionary directory: ${this.dictionariesPath}`)
      return []
    }
  }

  getLoadedDictionaries(): string[] {
    return Array.from(this.cache.keys())
  }

  clearCache(): void {
    this.cache.clear()
  }

  // Legacy method for backward compatibility - delegates to scanAvailableDictionaries
  getAvailableDictionaries(): string[] {
    console.warn('getAvailableDictionaries() is deprecated. Use scanAvailableDictionaries() instead.')
    return ['core', 'academic', 'extended'] // Fallback hardcoded list
  }
}
