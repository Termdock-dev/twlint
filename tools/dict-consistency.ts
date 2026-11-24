// 同一個詞、同一個建議詞出現在多個 CSV 時，比對設定必須一致。
// 不一致時寬鬆的那份（例如 exact）會在 --deep 載入所有詞庫時照樣誤報，
// 讓另一份的語境設定失效。

export interface ConsistencyRow {
  file: string
  id: string
  taiwan: string
  china_traditional: string
  match_type?: string
  context_before?: string
  context_after?: string
  context_exclude?: string
}

function matchSignature(row: ConsistencyRow): string {
  return JSON.stringify([
    row.match_type || 'exact',
    row.context_before || '',
    row.context_after || '',
    row.context_exclude || ''
  ])
}

export function findInconsistentEntries(rows: ConsistencyRow[]): string[] {
  const groups = new Map<string, ConsistencyRow[]>()
  for (const row of rows) {
    const key = `${row.china_traditional}→${row.taiwan}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return [...groups.entries()]
    .filter(([, group]) => new Set(group.map(matchSignature)).size > 1)
    .map(([key, group]) => `${key}: ${group.map(row => `${row.file}#${row.id}`).join(', ')}`)
}
