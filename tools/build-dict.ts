#!/usr/bin/env tsx

// TWLint 詞庫建構工具
// 將 CSV 詞庫轉換為優化的 JSON 格式供運行時使用

import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises'
import { join, basename } from 'path'
import type { DictEntry, CompiledDict } from '../src/types.js'
import { parseCSV, compileRows, buildDictionary, type CSVRow } from '../src/core/dictionary-compiler.js'
import { findInconsistentEntries } from './dict-consistency.js'

// 詞庫版本跟著套件版本，發布時不用另外同步
const PACKAGE_VERSION: string = JSON.parse(
  await readFile(join(process.cwd(), 'package.json'), 'utf-8')
).version

async function readCSVRows(file: string): Promise<CSVRow[]> {
  return parseCSV(await readFile(file, 'utf-8'))
}

class DictBuilder {
  private readonly csvDir = join(process.cwd(), 'dictionaries-csv')
  private readonly domainsDir = join(process.cwd(), 'dictionaries-csv', 'domains')
  private readonly outputDir = join(process.cwd(), 'src', 'dictionaries')
  private readonly builtNames = new Set<string>()

  async buildAll(): Promise<void> {
    console.log('🔨 開始建構 TWLint 詞庫...')

    await this.checkConsistency()

    // 確保輸出目錄存在
    await mkdir(this.outputDir, { recursive: true })

    // 建構核心詞庫（如果存在）
    await this.buildCoreDict()

    // 建構領域詞庫
    await this.buildDomainDictionaries()

    // 建構學術詞庫（保持向後相容）
    await this.buildAcademicDict()

    // 建構擴展詞庫（保持向後相容）
    await this.buildExtendedDict()

    await this.removeUnbuiltDictionaries()

    // 建構索引文件
    await this.generateIndex()

    console.log('✅ 詞庫建構完成！')
  }

  private async checkConsistency(): Promise<void> {
    const files = [
      join(this.csvDir, 'core', 'core.csv'),
      ...await this.findCSVFiles(this.domainsDir),
      ...await this.findCSVFiles(join(this.csvDir, 'extended'))
    ]
    const rows = []
    for (const file of files) {
      const fileName = basename(file)
      rows.push(...(await readCSVRows(file)).map(row => ({ ...row, file: fileName })))
    }

    const inconsistent = findInconsistentEntries(rows)
    if (inconsistent.length > 0) {
      throw new Error(`同一詞條在不同 CSV 的比對設定不一致:\n  ${inconsistent.join('\n  ')}`)
    }
  }

  async buildCoreDict(): Promise<void> {
    console.log('📚 建構核心詞庫...')

    const coreDir = join(this.csvDir, 'core')
    const csvFiles = await this.findCSVFiles(coreDir)

    const coreFiles = csvFiles.filter(file => basename(file) === 'core.csv')

    if (coreFiles.length === 0) {
      console.log('⚠️  未找到核心詞庫 core.csv，建立示例文件')
      await this.createSampleCSV()
      return
    }

    const dict = await this.compileDict(coreFiles, 'core')
    await this.saveDict(dict, 'core')

    console.log(`✅ 核心詞庫建構完成 (${dict.metadata.entries} 條目)`)
  }

  async buildAcademicDict(): Promise<void> {
    console.log('🎓 建構學術詞庫...')

    const academicFiles = (await this.findCSVFiles(join(this.csvDir, 'extended')))
      .filter(file => basename(file) === 'academic.csv')

    if (academicFiles.length === 0) {
      console.log('ℹ️  未找到學術詞庫，跳過')
      return
    }

    const dict = await this.compileDict(academicFiles, 'academic')
    await this.saveDict(dict, 'academic')
    console.log(`✅ 學術詞庫建構完成 (${dict.metadata.entries} 條目)`)
  }

  async buildDomainDictionaries(): Promise<void> {
    console.log('🌐 建構領域詞庫...')

    const domainFiles = await this.findCSVFiles(this.domainsDir)
    if (domainFiles.length === 0) {
      console.log('ℹ️  未找到領域詞庫，跳過')
      return
    }

    for (const domainFile of domainFiles) {
      const domainName = basename(domainFile, '.csv')
      console.log(`  📂 建構領域: ${domainName}`)

      const dict = await this.compileDict([domainFile], domainName)
      await this.saveDict(dict, domainName)

      console.log(`  ✅ ${domainName} 完成 (${dict.metadata.entries} 條目)`)
    }

    console.log(`✅ 所有領域詞庫建構完成`)
  }

  async buildExtendedDict(): Promise<void> {
    console.log('📖 建構擴展詞庫...')

    const extendedDir = join(this.csvDir, 'extended')
    const allCsvFiles = await this.findCSVFiles(extendedDir)

    // 排除 academic.csv，因為它已經被單獨處理了
    const csvFiles = allCsvFiles.filter(file => !file.endsWith('academic.csv'))

    if (csvFiles.length === 0) {
      console.log('ℹ️  未找到其他擴展詞庫，跳過')
      return
    }

    const dict = await this.compileDict(csvFiles, 'extended')
    await this.saveDict(dict, 'extended')

    console.log(`✅ 擴展詞庫建構完成 (${dict.metadata.entries} 條目)`)
  }

  // src/dictionaries/ 只放這次從 CSV 建出來的詞庫；CSV 刪掉後留下的舊 JSON 一併移除
  private async removeUnbuiltDictionaries(): Promise<void> {
    const stale = (await readdir(this.outputDir))
      .filter(file => file.endsWith('.json') && file !== 'index.json')
      .filter(file => !this.builtNames.has(basename(file, '.json')))

    for (const file of stale) {
      await rm(join(this.outputDir, file))
      console.log(`🗑️  移除沒有來源 CSV 的詞庫: ${file}`)
    }
  }

  async generateIndex(): Promise<void> {
    console.log('📝 生成詞庫索引...')

    // 掃描實際生成的詞庫文件
    const builtDictionaries = []

    try {
      const files = await readdir(this.outputDir)
      const dictFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json')

      for (const file of dictFiles) {
        const name = basename(file, '.json')
        const dictPath = join(this.outputDir, file)
        const content = await readFile(dictPath, 'utf-8')
        const dict = JSON.parse(content)

        // 根據名稱判斷類型和描述
        let description = name
        let required = false
        let type = 'domain'

        if (name === 'core') {
          description = '核心詞庫'
          required = true
          type = 'core'
        } else if (name === 'academic') {
          description = '學術詞庫'
          type = 'extended'
        } else if (name === 'extended') {
          description = '擴展詞庫'
          type = 'extended'
        } else {
          // 領域詞庫，美化名稱
          description = this.formatDomainName(name)
          type = 'domain'
        }

        builtDictionaries.push({
          name,
          description,
          type,
          required,
          entries: dict.metadata?.entries || 0
        })
      }
    } catch (error) {
      console.warn('Warning: Failed to scan dictionary files')
    }

    const index = {
      dictionaries: builtDictionaries,
      version: PACKAGE_VERSION
    }

    await writeFile(
      join(this.outputDir, 'index.json'),
      JSON.stringify(index, null, 2),
      'utf-8'
    )

    console.log('✅ 詞庫索引生成完成')
  }

  private formatDomainName(domainName: string): string {
    const nameMap: Record<string, string> = {
      'software-development': '軟體開發',
      'hardware-3c': '硬體3C',
      'network-cloud': '網路雲端',
      'business-finance': '商業金融',
      'user-interface': '使用者介面',
      'operating-system': '作業系統',
      'social-media': '社群媒體',
      'ai-emerging-tech': 'AI新興技術'
    }
    return nameMap[domainName] || domainName
  }

  private async findCSVFiles(dir: string): Promise<string[]> {
    try {
      const files = await readdir(dir)
      return files
        .filter(file => file.endsWith('.csv'))
        .map(file => join(dir, file))
    } catch {
      return []
    }
  }

  private async compileDict(csvFiles: string[], name: string): Promise<CompiledDict> {
    const entries: DictEntry[] = []
    for (const csvFile of csvFiles) {
      entries.push(...compileRows(await readCSVRows(csvFile), csvFile))
    }
    return buildDictionary(entries, name, PACKAGE_VERSION)
  }

  private async saveDict(dict: CompiledDict, name: string): Promise<void> {
    this.builtNames.add(name)
    const filePath = join(this.outputDir, `${name}.json`)
    await writeFile(filePath, JSON.stringify(dict, null, 2), 'utf-8')
  }

  private async createSampleCSV(): Promise<void> {
    const sampleData = `id,taiwan,china_simplified,china_traditional,english,confidence,category,reason,domain
software-term,軟體,软件,軟件,software,0.95,mainland-term,台灣技術標準用語,tech
network-term,網路,网络,網絡,network,0.90,mainland-term,台灣慣用語,tech
program-term,程式,程序,程序,program,0.85,mainland-term,台灣標準用語,tech`

    const coreDir = join(this.csvDir, 'core')
    await mkdir(coreDir, { recursive: true })

    await writeFile(
      join(coreDir, 'tech-basic.csv'),
      sampleData,
      'utf-8'
    )

    console.log('📝 已建立示例詞庫文件: dictionaries-csv/core/tech-basic.csv')
  }
}

// 執行建構
if (import.meta.url.endsWith(process.argv[1])) {
  const builder = new DictBuilder()
  builder.buildAll().catch(error => {
    console.error('❌ 詞庫建構失敗:', error.message)
    throw error  // 讓上層決定是否退出
  })
}
