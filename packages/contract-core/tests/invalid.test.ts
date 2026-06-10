import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { loadContractPack, validateContractJson, ContractError } from '../src/index'

const fixture = (name: string) =>
  join(__dirname, '..', '..', '..', 'fixtures', 'contracts', name)

describe('invalid contracts', () => {
  it('rejects contract missing pack field', async () => {
    await expect(loadContractPack(fixture('invalid-missing-pack.json')))
      .rejects.toThrow(ContractError)
  })

  it('error message mentions pack when pack is missing', async () => {
    await expect(loadContractPack(fixture('invalid-missing-pack.json')))
      .rejects.toSatisfy((err: unknown) => {
        const msg = (err as Error).message
        return msg.includes('pack') || msg.includes('required')
      })
  })

  it('rejects contract with invalid field type varchar', async () => {
    await expect(loadContractPack(fixture('invalid-bad-field-type.json')))
      .rejects.toThrow(ContractError)
  })

  it('rejects empty entities object', () => {
    const json = JSON.stringify({
      pack: 'test-pack',
      version: '1.0.0',
      entities: {},
    })
    expect(() => validateContractJson(json)).toThrow(ContractError)
  })

  it('rejects missing version field', () => {
    const json = JSON.stringify({
      pack: 'test-pack',
      entities: {
        Foo: { table: 'foos', fields: { id: { type: 'uuid' } } },
      },
    })
    expect(() => validateContractJson(json)).toThrow(ContractError)
  })

  it('rejects invalid JSON string', () => {
    expect(() => validateContractJson('{ not valid json')).toThrow(ContractError)
  })

  it('ContractError has non-empty details array', async () => {
    try {
      await loadContractPack(fixture('invalid-missing-pack.json'))
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError)
      expect((err as ContractError).details.length).toBeGreaterThan(0)
    }
  })
})
