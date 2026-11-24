import { realpathSync } from 'fs'
import { isAbsolute, relative } from 'path'

const cache = new Map<string, string>()

// 設定檔、.gitignore、.twlintignore 的樣式都是相對於工作目錄寫的（src/**/*.ts、docs/generated/）。
// 工作目錄內的絕對路徑（含經過 symlink 的，例如 macOS 的 /var → /private/var）轉成相對路徑才對得上；
// 工作目錄外的保留原樣，讓 **/*.md 這類樣式照舊比對得到。
export function toCwdRelativePath(filePath: string): string {
  if (!isAbsolute(filePath)) return filePath

  const cached = cache.get(filePath)
  if (cached !== undefined) return cached

  const result = insideCwd(filePath) ?? insideCwd(realPath(filePath)) ?? filePath
  cache.set(filePath, result)
  return result
}

function insideCwd(absolutePath: string): string | undefined {
  const rel = relative(process.cwd(), absolutePath)
  return rel.startsWith('..') || isAbsolute(rel) ? undefined : rel
}

function realPath(filePath: string): string {
  try {
    return realpathSync.native(filePath)
  } catch {
    return filePath
  }
}
