import { readFile, access } from 'fs/promises'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { validateConfig, DEFAULT_CONFIG } from './config-schema.js'
import type { TWLintUserConfig } from '../types.js'

export async function loadConfig(configPath?: string): Promise<TWLintUserConfig> {
  const paths = configPath
    ? [configPath]
    : [
        'twlint.config.js',
        'twlint.config.mjs',
        'twlint.config.ts',
        '.twlintrc.json',
        '.twlintrc'
      ]

  for (const path of paths) {
    try {
      await access(path)

      if (path.endsWith('.json') || path.endsWith('.twlintrc')) {
        const content = await readFile(path, 'utf-8')
        const userConfig = JSON.parse(content)
        return validateConfig(userConfig)
      }

      if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.ts')) {
        // 相對路徑以工作目錄為準，絕對路徑照用（#22）
        const fileUrl = pathToFileURL(resolve(path)).href

        try {
          const module = await import(fileUrl)
          const userConfig = module.default || module
          return validateConfig(userConfig)
        } catch (importError) {
          // 自動找到的設定檔匯入失敗時維持舊行為：警告後用預設設定。
          // 使用者用 --config 明確指定的設定檔不能被靜默換掉，交給外層丟錯
          if (!configPath && (path.endsWith('.js') || path.endsWith('.mjs'))) {
            const content = await readFile(path, 'utf-8')

            // 簡單的設定檔案執行（僅支援 export default）
            if (content.includes('export default')) {
              console.warn(`Config file ${path} found but unable to import. Using default config.`)
              return DEFAULT_CONFIG
            }
          }
          throw importError
        }
      }
    } catch (error) {
      if (configPath) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load config from "${configPath}": ${message}`)
      }
      // Continue to next path if no specific config was requested
    }
  }

  // Return default config if no config file found
  return DEFAULT_CONFIG
}