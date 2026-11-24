import { realpathSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

const cache = new Map<string, string>()

// 設定檔、.gitignore、.twlintignore 的樣式都是相對於工作目錄寫的（src/**/*.ts、docs/generated/）。
// 任何寫法的路徑（./src/x.ts、../a.md、絕對路徑、經過 symlink 的 /var → /private/var）
// 都先解析成絕對路徑：在工作目錄內就轉成正規化的相對路徑才對得上；
// 在工作目錄外就用絕對路徑，讓 **/*.md 這類樣式照舊比對得到。
export function toCwdRelativePath(filePath: string): string {
  const cached = cache.get(filePath)
  if (cached !== undefined) return cached

  const absolutePath = resolve(filePath)
  const result = insideCwd(absolutePath) ?? insideCwd(realPath(absolutePath)) ?? absolutePath
  cache.set(filePath, result)
  return result
}

function insideCwd(absolutePath: string): string | undefined {
  const rel = relative(process.cwd(), absolutePath)
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined
  return rel || '.'
}

function realPath(filePath: string): string {
  try {
    return realpathSync.native(filePath)
  } catch {
    return filePath
  }
}
