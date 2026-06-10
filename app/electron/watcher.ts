import chokidar from 'chokidar'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface SynkordConfig {
  project: string
  org: string           // legacy field (orgSlug)
  orgId?: string
  orgSlug?: string
  consumes: string[]
}

type Callback = (cfg: SynkordConfig | null, dir: string) => void

let watcher: ReturnType<typeof chokidar.watch> | null = null

export function watchDirectory(dir: string, cb: Callback): void {
  watcher?.close()

  // Prefer .synkord/config.json; fall back to synkord.json for backward compat
  const newConfig = join(dir, '.synkord', 'config.json')
  const legacyConfig = join(dir, 'synkord.json')

  // Watch both paths
  const targets = [newConfig, legacyConfig]

  watcher = chokidar.watch(targets, { ignoreInitial: false, awaitWriteFinish: true })

  const load = (_path: string) => {
    // Always prefer .synkord/config.json if it exists
    const preferred = existsSync(newConfig) ? newConfig : legacyConfig
    if (!existsSync(preferred)) {
      cb(null, dir)
      return
    }
    try {
      const raw = JSON.parse(readFileSync(preferred, 'utf8')) as Record<string, unknown>
      // Normalize both formats into SynkordConfig
      const cfg: SynkordConfig = {
        project: (raw.project as string) ?? '',
        org: (raw.org as string) ?? (raw.orgSlug as string) ?? '',
        orgId: raw.orgId as string | undefined,
        orgSlug: (raw.orgSlug as string) ?? (raw.org as string) ?? '',
        consumes: (raw.consumes as string[]) ?? [],
      }
      cb(cfg, dir)
    } catch {
      cb(null, dir)
    }
  }

  watcher.on('add', load)
  watcher.on('change', load)
  watcher.on('unlink', () => {
    // If one is deleted, reload from the other
    load('')
  })
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}
