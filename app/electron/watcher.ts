import chokidar from 'chokidar'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface SynkordConfig {
  project: string
  org: string
  consumes: string[]
}

type Callback = (cfg: SynkordConfig | null, dir: string) => void

let watcher: ReturnType<typeof chokidar.watch> | null = null

export function watchDirectory(dir: string, cb: Callback): void {
  watcher?.close()
  const target = join(dir, 'synkord.json')

  watcher = chokidar.watch(target, { ignoreInitial: false, awaitWriteFinish: true })

  const load = (path: string) => {
    try {
      cb(JSON.parse(readFileSync(path, 'utf8')) as SynkordConfig, dir)
    } catch {
      cb(null, dir)
    }
  }

  watcher.on('add', load)
  watcher.on('change', load)
  watcher.on('unlink', () => cb(null, dir))
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}
