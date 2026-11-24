import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

describe('CLI Integration Tests', () => {
  // 放在工作目錄外：repo 自己的 .twlintignore 會忽略 test-temp/
  const testDir = join(tmpdir(), `twlint-cli-test-${process.pid}`)
  const testFile = join(testDir, 'sample.md')
  const nestedDir = join(testDir, 'nested')
  const cliPath = join(process.cwd(), 'dist', 'cli.js')

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(nestedDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('check command', () => {
    it('should detect issues in simplified Chinese text', async () => {
      const content = '# 测试文档\n\n这是一个简体字测试。\n\n使用软件开发。'
      await writeFile(testFile, content, 'utf-8')

      try {
        await execAsync(`node ${cliPath} check ${testFile}`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(error.stdout).toContain('simplified-chars')
        expect(error.stdout).toContain('mainland-terms')
        expect(error.stdout).toContain('problems')
      }
    })

    it('should output JSON format when requested', async () => {
      const content = '简体字测试'
      await writeFile(testFile, content, 'utf-8')

      try {
        await execAsync(`node ${cliPath} check ${testFile} --format json`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(() => JSON.parse(error.stdout)).not.toThrow()

        const result = JSON.parse(error.stdout)
        expect(Array.isArray(result)).toBe(true)
        expect(result[0]).toHaveProperty('filePath')
        expect(result[0]).toHaveProperty('messages')
      }
    })

    it('should write the full JSON output when stdout is a pipe (#2)', async () => {
      // 300 行 × 6 個簡體字，JSON 約 300KB，超過管線的 64KB 緩衝
      const content = Array.from({ length: 300 }, () => '这个软件开发项目').join('\n')
      await writeFile(testFile, content, 'utf-8')

      try {
        await execAsync(`node ${cliPath} check ${testFile} --format json`, { maxBuffer: 10 * 1024 * 1024 })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(Buffer.byteLength(error.stdout)).toBeGreaterThan(65536)
        expect(JSON.parse(error.stdout)[0].messages.length).toBeGreaterThan(1000)
      }
    })

    it('should exit with error code when issues found', async () => {
      const content = '简体字测试'
      await writeFile(testFile, content, 'utf-8')

      try {
        await execAsync(`node ${cliPath} check ${testFile}`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
      }
    })

    it('should exit with success when no issues found', async () => {
      const content = '繁體字測試'
      await writeFile(testFile, content, 'utf-8')

      const result = await execAsync(`node ${cliPath} check ${testFile}`)
      // 當沒有錯誤時，應該顯示成功訊息
      expect(result.stdout).toContain('✓ No problems found!')
    })

    it('should not flag general words in --deep mode when a domain dictionary repeats them', async () => {
      // 協議、異常在 core.csv 要看語境，領域詞庫曾是 exact，--deep 時照樣誤報
      const content = '授權協議與合作協議已更新，這次檢驗結果異常需要複查。'
      await writeFile(testFile, content, 'utf-8')

      // 用 JSON 檢查：stylish 在只有 info 時也印 No problems found
      const result = await execAsync(`node ${cliPath} check ${testFile} --deep --format json`)
      expect(JSON.parse(result.stdout)[0].messages).toEqual([])

      await execAsync(`node ${cliPath} check ${testFile} --deep --fix`)
      expect(await readFile(testFile, 'utf-8')).toBe(content)
    })

    it('should not report file read errors for directory inputs', async () => {
      const content = '简体字测试'
      await writeFile(testFile, content, 'utf-8')

      try {
        await execAsync(`node ${cliPath} check ${nestedDir} ${testFile}`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(error.stdout).not.toContain('file-read-error')
        expect(error.stdout).toContain('simplified-chars')
      }
    })
  })

  describe('directory arguments inside a project (#3)', () => {
    // 獨立專案：自己的 .gitignore 與設定檔，CLI 從專案根目錄執行
    const projectDir = join(testDir, 'project')
    const listFiles = async (arg: string): Promise<string[]> => {
      try {
        const { stdout } = await execAsync(`node ${cliPath} check ${arg} --format json`, { cwd: projectDir })
        return JSON.parse(stdout).map((result: { filePath: string }) => result.filePath)
      } catch (error: any) {
        return JSON.parse(error.stdout).map((result: { filePath: string }) => result.filePath)
      }
    }

    beforeEach(async () => {
      await mkdir(join(projectDir, 'docs', 'generated'), { recursive: true })
      await mkdir(join(projectDir, 'src'), { recursive: true })
      await writeFile(join(projectDir, '.gitignore'), 'docs/generated/\n', 'utf-8')
      // twlint.config.js 用 export default；Node 18 不會自動判斷 ESM，需要 type: module
      await writeFile(join(projectDir, 'package.json'), '{ "type": "module" }\n', 'utf-8')
      await writeFile(join(projectDir, 'twlint.config.js'),
        'export default [{ files: ["**/*.md"], rules: { "simplified-chars": "error" } }, ' +
        '{ files: ["src/**/*.ts"], rules: { "simplified-chars": "error" } }]\n', 'utf-8')
      await writeFile(join(projectDir, 'docs', 'a.md'), '这是简体字', 'utf-8')
      await writeFile(join(projectDir, 'docs', 'generated', 'g.md'), '这是简体字', 'utf-8')
      await writeFile(join(projectDir, 'src', 'x.ts'), '// 这是简体字', 'utf-8')
      await writeFile(join(projectDir, 'docs', 'script.sh'), 'echo 这是简体字', 'utf-8')
    })

    afterEach(async () => {
      await rm(projectDir, { recursive: true, force: true })
    })

    it('checks only the files under a directory that the config covers', async () => {
      try {
        await execAsync(`node ${cliPath} check docs --format json`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        const results = JSON.parse(error.stdout)
        expect(results.map((result: { filePath: string }) => result.filePath)).toEqual(['docs/a.md'])
        expect(results[0].messages.length).toBeGreaterThan(0)
      }
    })

    it('fixes the files under a directory and leaves ignored or uncovered files alone', async () => {
      await execAsync(`node ${cliPath} check docs --fix`, { cwd: projectDir })

      expect(await readFile(join(projectDir, 'docs', 'a.md'), 'utf-8')).toBe('這是簡體字')
      expect(await readFile(join(projectDir, 'docs', 'generated', 'g.md'), 'utf-8')).toBe('这是简体字')
      expect(await readFile(join(projectDir, 'docs', 'script.sh'), 'utf-8')).toBe('echo 这是简体字')
    })

    it('warns on stderr when nothing is left to check, keeping exit 0', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} check "docs/**/*.none"`, { cwd: projectDir })
      expect(stderr).toContain('No files to check')
      expect(stdout).toContain('No problems found')
    })

    it('fixes files matched by a quoted glob and skips ignored ones', async () => {
      await execAsync(`node ${cliPath} check "docs/**/*.md" --fix`, { cwd: projectDir })

      expect(await readFile(join(projectDir, 'docs', 'a.md'), 'utf-8')).toBe('這是簡體字')
      expect(await readFile(join(projectDir, 'docs', 'generated', 'g.md'), 'utf-8')).toBe('这是简体字')
    })

    it('does not fix an explicitly named file that .twlintignore excludes', async () => {
      await mkdir(join(projectDir, 'drafts'), { recursive: true })
      await writeFile(join(projectDir, '.twlintignore'), 'drafts/\n', 'utf-8')
      await writeFile(join(projectDir, 'drafts', 'd.md'), '这是简体字', 'utf-8')

      await execAsync(`node ${cliPath} check drafts/d.md --fix`, { cwd: projectDir })
      expect(await readFile(join(projectDir, 'drafts', 'd.md'), 'utf-8')).toBe('这是简体字')
    })

    it('matches config "files" patterns for an absolute directory argument', async () => {
      expect((await listFiles(projectDir)).map(file => file.replace(`${projectDir}/`, '')).sort())
        .toEqual(['docs/a.md', 'src/x.ts'])
    })

    it('runs the configured rules on a ./-prefixed path (#5)', async () => {
      try {
        await execAsync(`node ${cliPath} check ./src/x.ts --format json`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(JSON.parse(error.stdout)[0].messages.length).toBeGreaterThan(0)
      }
    })

    it('checks a ../ path from a subdirectory like any file outside the working directory (#5)', async () => {
      // docs/ 沒有設定檔，用預設設定（**/*.md）
      await writeFile(join(projectDir, 'top.md'), '这是简体字', 'utf-8')
      try {
        await execAsync(`node ${cliPath} check ../top.md --format json`, { cwd: join(projectDir, 'docs') })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(JSON.parse(error.stdout)[0].messages.length).toBeGreaterThan(0)
      }
    })

    it('runs the configured rules on an explicit absolute file path inside the project', async () => {
      try {
        await execAsync(`node ${cliPath} check ${join(projectDir, 'src', 'x.ts')} --format json`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(JSON.parse(error.stdout)[0].messages.length).toBeGreaterThan(0)
      }
    })

    it('runs the configured rules on files reached through an absolute directory', async () => {
      try {
        await execAsync(`node ${cliPath} check ${projectDir} --format json`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        const results: Array<{ filePath: string; messages: unknown[] }> = JSON.parse(error.stdout)
        expect(results.every(result => result.messages.length > 0)).toBe(true)
      }

      await execAsync(`node ${cliPath} check ${projectDir} --fix`, { cwd: projectDir })
      expect(await readFile(join(projectDir, 'src', 'x.ts'), 'utf-8')).toBe('// 這是簡體字')
    })
  })

  describe('fix command', () => {
    it('should fix simplified characters automatically', async () => {
      const originalContent = '# 测试文档\n\n这是简体字测试。'
      await writeFile(testFile, originalContent, 'utf-8')

      await execAsync(`node ${cliPath} check ${testFile} --fix`)

      const { readFile } = await import('fs/promises')
      const fixedContent = await readFile(testFile, 'utf-8')

      expect(fixedContent).not.toBe(originalContent)
      expect(fixedContent).toContain('測試')
      expect(fixedContent).toContain('這是')
      expect(fixedContent).toContain('簡體字')
    })

    it('should show verbose output when requested', async () => {
      const content = '简体字测试'
      await writeFile(testFile, content, 'utf-8')

      const { stdout } = await execAsync(`node ${cliPath} check ${testFile} --fix --verbose`)

      expect(stdout).toContain('Fixed:')
      expect(stdout).toContain('file(s)')
    })

    it('should not modify files with no issues', async () => {
      const originalContent = '繁體字測試'
      await writeFile(testFile, originalContent, 'utf-8')

      await execAsync(`node ${cliPath} check ${testFile} --fix`)

      const { readFile } = await import('fs/promises')
      const finalContent = await readFile(testFile, 'utf-8')

      expect(finalContent).toBe(originalContent)
    })
  })

  describe('help command', () => {
    it('should show help information', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --help`)

      expect(stdout).toContain('Usage:')
      expect(stdout).toContain('Commands:')
      expect(stdout).toContain('check')
      expect(stdout).toContain('init')
    })

    it('should show check command help', async () => {
      const { stdout } = await execAsync(`node ${cliPath} check --help`)

      expect(stdout).toContain('Check files for Chinese term issues')
      expect(stdout).toContain('--fix')
      expect(stdout).toContain('--format')
      expect(stdout).toContain('--deep')
    })
  })

  describe('version command', () => {
    it('should show version information', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --version`)

      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('error handling', () => {
    it('should handle non-existent files gracefully', async () => {
      try {
        await execAsync(`node ${cliPath} check non-existent-file.md`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        // 檢查是否包含檔案讀取錯誤的信息
        expect(error.stdout).toContain('Failed to read file')
      }
    })

    it('should handle invalid options gracefully', async () => {
      try {
        await execAsync(`node ${cliPath} check ${testFile} --invalid-option`)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.code).toBe(1)
      }
    })
  })

  describe('custom dictionaries', () => {
    const projectDir = join(testDir, 'custom-dict-project')
    const HEADER = 'id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain,match_type,context_before,context_after,context_exclude,autofix_safe'
    // customDictionaries 套用到所有檔案，寫在不帶 files 的區塊
    const writeConfig = (dictPath: string) => writeFile(join(projectDir, 'twlint.config.js'),
      `export default [{ customDictionaries: ["${dictPath}"] }, { files: ["**/*.md"], rules: { "mainland-terms": "warning" } }]\n`, 'utf-8')
    const expectRunToFail = async (stderrText: string) => {
      try {
        await execAsync(`node ${cliPath} check a.md`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(error.stderr).toContain(stderrText)
      }
    }
    const messages = async (file: string): Promise<Array<{ message: string; suggestions?: string[] }>> => {
      try {
        const { stdout } = await execAsync(`node ${cliPath} check ${file} --format json`, { cwd: projectDir })
        return JSON.parse(stdout)[0].messages
      } catch (error: any) {
        return JSON.parse(error.stdout)[0].messages
      }
    }

    beforeEach(async () => {
      await mkdir(projectDir, { recursive: true })
      await writeFile(join(projectDir, 'package.json'), '{ "type": "module" }\n', 'utf-8')
      await writeFile(join(projectDir, 'terms.csv'), [
        HEADER,
        // 內建詞庫是「數據→資料」，自訂詞表改成「數值」
        'data-override,數值,数据,數據,data,0.95,mainland-term,團隊用語,tech,exact,,,,true',
        // 內建詞庫沒有的詞
        'fetch,取得,获取,獲取,fetch,0.95,mainland-term,團隊用語,tech,exact,,,,true',
        // 原詞→原詞：允許這個詞，蓋過內建的「腳本→指令碼」；信心度刻意低於內建詞條，只靠自訂優先
        'allow-script,腳本,脚本,腳本,script,0.5,allowed-term,團隊允許,tech,exact,,,,false'
      ].join('\n'), 'utf-8')
      await writeConfig('terms.csv')
    })

    afterEach(async () => {
      await rm(projectDir, { recursive: true, force: true })
    })

    it('uses the custom replacement over the built-in one for the same term', async () => {
      await writeFile(join(projectDir, 'a.md'), '這份數據很完整', 'utf-8')
      const suggestions = (await messages('a.md')).flatMap(m => m.suggestions ?? [])
      expect(suggestions).toContain('數值')
      expect(suggestions).not.toContain('資料')
    })

    it('adds terms the built-in dictionaries do not have', async () => {
      await writeFile(join(projectDir, 'a.md'), '從伺服器獲取設定', 'utf-8')
      expect((await messages('a.md')).flatMap(m => m.suggestions ?? [])).toContain('取得')
    })

    it('treats a term mapped to itself as allowed', async () => {
      await writeFile(join(projectDir, 'a.md'), '執行部署腳本', 'utf-8')
      expect((await messages('a.md')).filter(m => m.message.includes('腳本'))).toEqual([])
    })

    it('fails the whole run when a configured dictionary cannot be read', async () => {
      await writeConfig('missing.csv')
      await writeFile(join(projectDir, 'a.md'), '這份數據很完整', 'utf-8')
      try {
        await execAsync(`node ${cliPath} check a.md`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        expect(error.stderr).toContain('Failed to load custom dictionary "missing.csv"')
        expect(error.stdout).not.toContain('file-read-error')
      }
    })

    it('rejects customDictionaries in a block scoped by files', async () => {
      await writeFile(join(projectDir, 'twlint.config.js'),
        'export default [{ files: ["docs/**/*.md"], customDictionaries: ["terms.csv"], rules: { "mainland-terms": "warning" } }]\n', 'utf-8')
      await writeFile(join(projectDir, 'a.md'), '這份數據很完整', 'utf-8')
      await expectRunToFail('customDictionaries')
    })

    it.each([
      ['a wrong header', 'id,taiwan\nx,y'],
      ['a non-numeric confidence', `${HEADER}\nd,數值,数据,數據,data,high,mainland-term,x,tech,exact,,,,true`],
      ['no entries', HEADER]
    ])('fails when the custom dictionary has %s', async (_label, csv) => {
      await writeFile(join(projectDir, 'terms.csv'), csv, 'utf-8')
      await writeFile(join(projectDir, 'a.md'), '這份數據很完整', 'utf-8')
      await expectRunToFail('Failed to load custom dictionary')
    })

    it('rejects single-character terms in a custom dictionary', async () => {
      await writeFile(join(projectDir, 'terms.csv'), [HEADER,
        'pkg,套件,包,包,package,0.9,mainland-term,x,tech,exact,,,,true'].join('\n'), 'utf-8')
      await writeFile(join(projectDir, 'a.md'), '安裝套件', 'utf-8')
      try {
        await execAsync(`node ${cliPath} check a.md`, { cwd: projectDir })
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.stderr).toContain('單一個字')
      }
    })
  })
})
