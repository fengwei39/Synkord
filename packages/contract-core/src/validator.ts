import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ContractError } from './errors'
import type { ContractPack } from './types'

const schemaPath = join(__dirname, '..', '..', '..', 'schemas', 'contract-v1.json')
const schemaJson = JSON.parse(readFileSync(schemaPath, 'utf-8'))

const ajv = new Ajv({ allErrors: true })
addFormats(ajv)

const validate = ajv.compile(schemaJson)

export function validateContractJson(json: string): ContractPack {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (err) {
    throw new ContractError('$root', [`Invalid JSON: ${(err as Error).message}`])
  }

  const valid = validate(data)
  if (!valid && validate.errors) {
    const details = validate.errors.map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'unknown error'}`,
    )
    throw new ContractError('contract', details)
  }

  return data as ContractPack
}
