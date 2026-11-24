#!/usr/bin/env tsx

// TWLint 詞庫管理工具
// 提供 CSV 轉換、驗證、匯入等功能

import { readFile, writeFile, readdir, mkdir } from 'fs/promises'
import { join, dirname, basename, extname } from 'path'
import Papa from 'papaparse'
import { Command } from 'commander'
import chalk from 'chalk'
import { findUnmatchableRows, MIN_TERM_LENGTH } from '../src/core/matchable-term.js'

interface DictEntry {
  id: string
  taiwan: string
  china_simplified: string
  china_traditional: string
  english?: string
  confidence: number
  category: string
  reason: string
  domain: string
}

interface CSVRow {
  id: string
  taiwan: string
  china_simplified: string
  china_traditional: string
  english?: string
  confidence: string
  category: string
  reason: string
  domain: string
}

class DictManager {
  private readonly csvDir = join(process.cwd(), 'dictionaries-csv')

  async convertCSV(inputPath: string, domain: string): Promise<void> {
    console.log(chalk.blue(`🔄 轉換 CSV: ${inputPath} → 領域: ${domain}`))

    const content = await readFile(inputPath, 'utf-8')
    const { data, errors } = Papa.parse<any>(content, {
      header: true,
      skipEmptyLines: true
    })

    if (errors.length > 0) {
      console.error(chalk.red('❌ CSV 解析錯誤:'))
      errors.forEach(error => console.error(`  - ${error.message}`))
      return
    }

    const converted = this.autoConvertToStandard(data, domain)
    const outputPath = this.generateOutputPath(inputPath, domain)

    // 確保輸出目錄存在
    await mkdir(dirname(outputPath), { recursive: true })

    // 生成標準格式 CSV
    const csvContent = Papa.unparse(converted, {
      header: true,
      quotes: true
    })

    await writeFile(outputPath, csvContent, 'utf-8')
    console.log(chalk.green(`✅ 轉換完成: ${outputPath}`))
    console.log(chalk.dim(`   共 ${converted.length} 條目`))
  }

  private autoConvertToStandard(data: any[], domain: string): CSVRow[] {
    const converted: CSVRow[] = []
    let idCounter = 1

    for (const row of data) {
      const entry = this.detectAndConvert(row, domain, idCounter++)
      if (entry) {
        converted.push(entry)
      }
    }

    return converted
  }

  private detectAndConvert(row: any, domain: string, id: number): CSVRow | null {
    // 嘗試自動檢測欄位映射
    const mapping = this.detectFieldMapping(row)
    if (!mapping.taiwan || !mapping.china) {
      console.warn(chalk.yellow(`⚠️  跳過無效行: ${JSON.stringify(row)}`))
      return null
    }

    return {
      id: `${domain}-${String(id).padStart(3, '0')}`,
      taiwan: mapping.taiwan,
      china_simplified: mapping.china,
      china_traditional: mapping.china_traditional || mapping.china,
      english: mapping.english || '',
      confidence: String(mapping.confidence || 0.8),
      category: mapping.category || 'mainland-term',
      reason: mapping.reason || '台灣慣用語',
      domain: domain
    }
  }

  private detectFieldMapping(row: any): any {
    const keys = Object.keys(row).map(k => k.toLowerCase())
    const mapping: any = {}

    // 台灣用語檢測
    const taiwanFields = ['taiwan', 'tw', '台灣', '繁體', '正體', 'traditional']
    mapping.taiwan = this.findField(row, keys, taiwanFields)

    // 大陸用語檢測
    const chinaFields = ['china', 'cn', '大陸', '簡體', 'simplified', 'mainland']
    mapping.china = this.findField(row, keys, chinaFields)

    // 大陸繁體檢測
    const chinaTraditionalFields = ['china_traditional', 'china_trad', '大陸繁體']
    mapping.china_traditional = this.findField(row, keys, chinaTraditionalFields)

    // 英文檢測
    const englishFields = ['english', 'en', 'eng', '英文']
    mapping.english = this.findField(row, keys, englishFields)

    // 信心度檢測
    const confidenceFields = ['confidence', 'conf', '信心度', 'score']
    mapping.confidence = this.findField(row, keys, confidenceFields)

    // 分類檢測
    const categoryFields = ['category', 'type', '分類', '類別']
    mapping.category = this.findField(row, keys, categoryFields)

    // 理由檢測
    const reasonFields = ['reason', 'note', '理由', '說明', 'description']
    mapping.reason = this.findField(row, keys, reasonFields)

    return mapping
  }

  private findField(row: any, keys: string[], candidates: string[]): string | undefined {
    for (const candidate of candidates) {
      const key = keys.find(k => k.includes(candidate.toLowerCase()))
      if (key) {
        return row[Object.keys(row).find(k => k.toLowerCase() === key)!]
      }
    }
    return undefined
  }

  private generateOutputPath(inputPath: string, domain: string): string {
    const fileName = basename(inputPath, extname(inputPath))
    return join(this.csvDir, domain, `${fileName}.csv`)
  }

  async createTemplate(domain: string, category: string): Promise<void> {
    const template = `id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain
${domain}-001,程式,程序,程序,program,0.95,mainland-term,台灣技術標準用語,${domain}
${domain}-002,軟體,软件,軟件,software,0.95,mainland-term,台灣技術標準用語,${domain}
${domain}-003,演算法,算法,算法,algorithm,0.95,mainland-term,台灣學術標準,${domain}`

    const outputDir = join(this.csvDir, domain)
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `${category}.csv`)
    await writeFile(outputPath, template, 'utf-8')

    console.log(chalk.green(`✅ 範本建立: ${outputPath}`))
  }

  async validateCSV(filePath: string): Promise<boolean> {
    console.log(chalk.blue(`🔍 驗證 CSV: ${filePath}`))

    try {
      const content = await readFile(filePath, 'utf-8')
      const { data, errors } = Papa.parse<CSVRow>(content, {
        header: true,
        skipEmptyLines: true
      })

      if (errors.length > 0) {
        console.error(chalk.red('❌ CSV 格式錯誤:'))
        errors.forEach(error => console.error(`  - ${error.message}`))
        return false
      }

      const issues: string[] = []

      data.forEach((row, index) => {
        if (!row.id) issues.push(`第 ${index + 2} 行: 缺少 id`)
        if (!row.taiwan) issues.push(`第 ${index + 2} 行: 缺少 taiwan`)
        if (!row.china_simplified) issues.push(`第 ${index + 2} 行: 缺少 china_simplified`)
        if (!row.confidence || isNaN(Number(row.confidence))) {
          issues.push(`第 ${index + 2} 行: confidence 必須是數字`)
        }
        if (!row.category) issues.push(`第 ${index + 2} 行: 缺少 category`)
        if (!row.domain) issues.push(`第 ${index + 2} 行: 缺少 domain`)
      })

      for (const id of findUnmatchableRows(data)) {
        issues.push(`${id}: 單一個字的詞條不收（至少 ${MIN_TERM_LENGTH} 個字）`)
      }

      if (issues.length > 0) {
        console.error(chalk.red(`❌ 發現 ${issues.length} 個問題:`))
        issues.forEach(issue => console.error(`  - ${issue}`))
        return false
      }

      console.log(chalk.green(`✅ 驗證通過: ${data.length} 條目`))
      return true
    } catch (error) {
      console.error(chalk.red(`❌ 檔案讀取錯誤: ${error}`))
      return false
    }
  }

  async listDictionaries(): Promise<void> {
    console.log(chalk.blue('📚 現有詞庫:'))

    try {
      const domains = await readdir(this.csvDir)

      for (const domain of domains) {
        const domainPath = join(this.csvDir, domain)
        const files = await readdir(domainPath)
        const csvFiles = files.filter(f => f.endsWith('.csv'))

        console.log(chalk.yellow(`\n📁 ${domain}:`))
        for (const file of csvFiles) {
          const filePath = join(domainPath, file)
          const content = await readFile(filePath, 'utf-8')
          const { data } = Papa.parse(content, { header: true })
          console.log(`  - ${file} (${data.length} 條目)`)
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ 無法讀取詞庫目錄'))
    }
  }

  async mergeCSV(inputFiles: string[], outputPath: string, domain: string): Promise<void> {
    console.log(chalk.blue(`🔀 合併 CSV 檔案到: ${outputPath}`))

    const allEntries: CSVRow[] = []
    let idCounter = 1

    for (const file of inputFiles) {
      console.log(chalk.dim(`  處理: ${file}`))
      const content = await readFile(file, 'utf-8')
      const { data } = Papa.parse<any>(content, { header: true, skipEmptyLines: true })

      for (const row of data) {
        const entry = this.detectAndConvert(row, domain, idCounter++)
        if (entry) {
          allEntries.push(entry)
        }
      }
    }

    // 去除重複項目
    const unique = this.removeDuplicates(allEntries)

    const csvContent = Papa.unparse(unique, { header: true, quotes: true })
    await writeFile(outputPath, csvContent, 'utf-8')

    console.log(chalk.green(`✅ 合併完成: ${unique.length} 條目 (去除 ${allEntries.length - unique.length} 重複項)`))
  }

  private removeDuplicates(entries: CSVRow[]): CSVRow[] {
    const seen = new Set<string>()
    return entries.filter(entry => {
      const key = `${entry.taiwan}-${entry.china_simplified}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
}

// CLI 介面
async function main() {
  const program = new Command()
  const dictManager = new DictManager()

  program
    .name('dict-manager')
    .description('TWLint 詞庫管理工具')
    .version('1.0.0')

  program
    .command('convert')
    .description('轉換 CSV 到標準格式')
    .argument('<input>', 'CSV 輸入檔案')
    .argument('<domain>', '領域名稱 (如: tech, business)')
    .action(async (input, domain) => {
      await dictManager.convertCSV(input, domain)
    })

  program
    .command('template')
    .description('建立詞庫範本')
    .argument('<domain>', '領域名稱')
    .argument('<category>', '分類名稱')
    .action(async (domain, category) => {
      await dictManager.createTemplate(domain, category)
    })

  program
    .command('validate')
    .description('驗證 CSV 格式')
    .argument('<files...>', 'CSV 檔案路徑')
    .action(async (files: string[]) => {
      for (const file of files) {
        if (!(await dictManager.validateCSV(file))) process.exitCode = 1
      }
    })

  program
    .command('list')
    .description('列出所有詞庫')
    .action(async () => {
      await dictManager.listDictionaries()
    })

  program
    .command('merge')
    .description('合併多個 CSV 檔案')
    .argument('<files...>', 'CSV 檔案列表')
    .option('-o, --output <path>', '輸出檔案路徑')
    .option('-d, --domain <name>', '領域名稱')
    .action(async (files, options) => {
      if (!options.output || !options.domain) {
        console.error(chalk.red('❌ 請指定 --output 和 --domain 參數'))
        return
      }
      await dictManager.mergeCSV(files, options.output, options.domain)
    })

  await program.parseAsync()
}

if (import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error(chalk.red('❌ 執行錯誤:'), error.message)
    process.exit(1)
  })
}