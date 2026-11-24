// 詞庫只收兩個字以上的詞。單一個字脫離上下文判斷不了詞義
// （「包」會命中「包含」、「流」會命中「河流」），誤判率太高，一律不比對。
export const MIN_TERM_LENGTH = 2

export function isMatchableTerm(term: string): boolean {
  return [...term].length >= MIN_TERM_LENGTH
}

interface TermRow {
  id: string
  china_simplified: string
  china_traditional?: string
}

export function findUnmatchableRows(rows: TermRow[]): string[] {
  return rows
    .filter(row => [row.china_simplified, row.china_traditional]
      .some(term => term && !isMatchableTerm(term)))
    .map(row => row.id)
}
