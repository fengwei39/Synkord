export class ContractError extends Error {
  constructor(
    public readonly path: string,
    public readonly details: string[],
  ) {
    super(`Contract validation failed at '${path}': ${details.join('; ')}`)
    this.name = 'ContractError'
  }
}
