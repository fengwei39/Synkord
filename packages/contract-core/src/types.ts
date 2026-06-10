export type FieldType =
  | 'uuid'
  | 'string'
  | 'int'
  | 'boolean'
  | 'datetime'
  | 'enum'
  | 'json'

export type RelationType =
  | 'many-to-one'
  | 'one-to-many'
  | 'many-to-many'
  | 'one-to-one'

export interface Field {
  type: FieldType
  primary?: boolean
  unique?: boolean
  maxLength?: number
  values?: string[]
}

export interface Relation {
  type: RelationType
  target: string
  through?: string
}

export interface Entity {
  table: string
  fields: Record<string, Field>
  relations?: Record<string, Relation>
}

export interface NamingConventions {
  db?: 'snake_case' | 'camelCase' | 'PascalCase'
  api?: 'snake_case' | 'camelCase' | 'PascalCase'
  java?: 'snake_case' | 'camelCase' | 'PascalCase'
  go?: 'snake_case' | 'camelCase' | 'PascalCase'
}

export interface Conventions {
  id_type?: 'uuid' | 'int' | 'string'
  naming?: NamingConventions
  timestamps?: Record<string, string>
}

export interface ContractPack {
  pack: string
  version: string
  conventions?: Conventions
  entities: Record<string, Entity>
}
