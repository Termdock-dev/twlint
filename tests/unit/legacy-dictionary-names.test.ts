import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFile } from 'fs/promises'
import { DictionaryManager } from '../../src/core/dictionary-manager'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([])
}))

const dictionary = (name: string) => JSON.stringify({ metadata: { name, version: '1.0', entries: 0 }, lookup: {} })
const notFound = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })

// 只有這兩個檔案存在時，loadDictionary('extended') 讀到哪個檔
function serveFiles(files: Record<string, string>): void {
  vi.mocked(readFile).mockImplementation(async (path) => {
    const name = String(path).split('/').pop()!.replace('.json', '')
    if (name in files) return files[name]
    throw notFound()
  })
}

describe('Legacy dictionary name "extended" (#9)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('falls back to academic when extended.json does not exist', async () => {
    serveFiles({ academic: dictionary('academic') })
    const dict = await new DictionaryManager().loadDictionary('extended')
    expect(dict.metadata.name).toBe('academic')
  })

  it('loads extended.json when it exists', async () => {
    serveFiles({ extended: dictionary('extended'), academic: dictionary('academic') })
    const dict = await new DictionaryManager().loadDictionary('extended')
    expect(dict.metadata.name).toBe('extended')
  })

  it('does not fall back for other missing dictionaries', async () => {
    serveFiles({ academic: dictionary('academic') })
    await expect(new DictionaryManager().loadDictionary('missing')).rejects.toThrow('ENOENT')
  })
})
