import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { loadContractPack, validateContractJson } from '../src/index'

const authPackPath = join(__dirname, '..', '..', '..', 'examples', 'auth-pack.json')

describe('valid contracts', () => {
  it('loads auth-pack.json from file', async () => {
    const pack = await loadContractPack(authPackPath)
    expect(pack.pack).toBe('auth-pack')
    expect(pack.version).toBe('1.0.0')
  })

  it('auth-pack contains User and Role entities', async () => {
    const pack = await loadContractPack(authPackPath)
    expect(pack.entities).toHaveProperty('User')
    expect(pack.entities).toHaveProperty('Role')
  })

  it('User entity has required fields', async () => {
    const pack = await loadContractPack(authPackPath)
    const user = pack.entities['User']
    expect(user.fields).toHaveProperty('id')
    expect(user.fields).toHaveProperty('email')
    expect(user.fields).toHaveProperty('status')
    expect(user.fields).toHaveProperty('created_at')
    expect(user.fields).toHaveProperty('updated_at')
  })

  it('status field is enum with correct values', async () => {
    const pack = await loadContractPack(authPackPath)
    const status = pack.entities['User'].fields['status']
    expect(status.type).toBe('enum')
    expect(status.values).toContain('active')
    expect(status.values).toContain('suspended')
  })

  it('User has many-to-many roles relation', async () => {
    const pack = await loadContractPack(authPackPath)
    const rel = pack.entities['User'].relations?.['roles']
    expect(rel).toBeDefined()
    expect(rel!.type).toBe('many-to-many')
    expect(rel!.target).toBe('Role')
    expect(rel!.through).toBe('user_roles')
  })

  it('conventions are populated', async () => {
    const pack = await loadContractPack(authPackPath)
    expect(pack.conventions?.id_type).toBe('uuid')
    expect(pack.conventions?.naming?.db).toBe('snake_case')
    expect(pack.conventions?.naming?.api).toBe('camelCase')
  })

  it('validateContractJson works with string input', () => {
    const { readFileSync } = require('fs')
    const json = readFileSync(authPackPath, 'utf-8')
    const pack = validateContractJson(json)
    expect(pack.pack).toBe('auth-pack')
  })
})
