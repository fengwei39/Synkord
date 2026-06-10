import { readFileSync } from 'fs'
import { validateContractJson } from './validator'

export { validateContractJson } from './validator'
export { ContractError } from './errors'
export type {
  ContractPack,
  Entity,
  Field,
  FieldType,
  Relation,
  RelationType,
  Conventions,
  NamingConventions,
} from './types'

export async function loadContractPack(path: string) {
  const json = readFileSync(path, 'utf-8')
  return validateContractJson(json)
}
