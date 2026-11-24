import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, readFile, unlink, mkdir, rmdir, rm } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

describe('CLI Integration Tests', () => {
  const testDir = join(process.cwd(), 'test-temp')
  const testFile = join(testDir, 'sample.md')
  const nestedDir = join(testDir, 'nested')
  const cliPath = join(process.cwd(), 'dist', 'cli.js')

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(nestedDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await unlink(testFile)
      await rmdir(nestedDir)
      await rmdir(testDir)
    } catch {
      // Ignore cleanup errors
    }
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

  describe('directory arguments (#3)', () => {
    const docsDir = join(testDir, 'docs-dir')

    beforeEach(async () => {
      await mkdir(join(docsDir, 'sub'), { recursive: true })
      await writeFile(join(docsDir, 'sub', 'guide.md'), '这是简体字', 'utf-8')
      await writeFile(join(docsDir, 'script.sh'), 'echo 这是简体字', 'utf-8')
    })

    afterEach(async () => {
      await rm(docsDir, { recursive: true, force: true })
    })

    it('checks the files under a directory that the config covers', async () => {
      try {
        await execAsync(`node ${cliPath} check ${docsDir} --format json`)
        expect.fail('Should have exited with error code')
      } catch (error: any) {
        expect(error.code).toBe(1)
        const results = JSON.parse(error.stdout)
        expect(results.map((result: { filePath: string }) => result.filePath))
          .toEqual([join(docsDir, 'sub', 'guide.md')])
        expect(results[0].messages.length).toBeGreaterThan(0)
      }
    })

    it('warns on stderr when nothing is left to check, keeping exit 0', async () => {
      const { stdout, stderr } = await execAsync(`node ${cliPath} check "${docsDir}/**/*.none"`)
      expect(stderr).toContain('No files to check')
      expect(stdout).toContain('No problems found')
    })

    it('fixes the files under a directory', async () => {
      await execAsync(`node ${cliPath} check ${docsDir} --fix`)

      expect(await readFile(join(docsDir, 'sub', 'guide.md'), 'utf-8')).toBe('這是簡體字')
      expect(await readFile(join(docsDir, 'script.sh'), 'utf-8')).toBe('echo 这是简体字')
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
      await writeFile(join(projectDir, 'twlint.config.js'),
        'export default [{ files: ["**/*.md"], rules: { "simplified-chars": "error" } }, ' +
        '{ files: ["src/**/*.ts"], rules: { "simplified-chars": "error" } }]\n', 'utf-8')
      await writeFile(join(projectDir, 'docs', 'a.md'), '这是简体字', 'utf-8')
      await writeFile(join(projectDir, 'docs', 'generated', 'g.md'), '这是简体字', 'utf-8')
      await writeFile(join(projectDir, 'src', 'x.ts'), '// 这是简体字', 'utf-8')
    })

    afterEach(async () => {
      await rm(projectDir, { recursive: true, force: true })
    })

    it('applies path-prefixed .gitignore rules to a directory argument', async () => {
      expect(await listFiles('docs')).toEqual(['docs/a.md'])
    })

    it('matches config "files" patterns for an absolute directory argument', async () => {
      expect((await listFiles(projectDir)).map(file => file.replace(`${projectDir}/`, '')).sort())
        .toEqual(['docs/a.md', 'src/x.ts'])
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
})
