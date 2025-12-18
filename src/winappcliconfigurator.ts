import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import * as fs from 'fs'

export function getConfig(version: string): WinAppCLIConfigurator {
  return new WinAppCLIConfigurator(version || 'latest')
}

export interface IPipeline {
  debug(message: string): void
  addPath(p: string): void
  mkdirP(p: string): Promise<void>
  downloadTool(url: string): Promise<string>
  extractZip(archivePath: string, dest: string): Promise<string>
  rmRF(p: string): Promise<void>
  moveSync(downloadPath: string, toolPath: string): void
}

export class WinAppCLIConfigurator {
  version: string

  constructor(version: string) {
    this.version = version
  }

  async configure(pipeline: IPipeline): Promise<void> {
    this.validate()

    let versionString: string

    let versionWithoutV = this.version
    if (this.version.startsWith('v')) {
      versionWithoutV = this.version.substring(1)
    }

    if (this.version === 'latest') {
      versionString = `latest/download`
    } else {
      versionString = `download/${this.version}`
    }

    const downloadURL = `https://github.com/microsoft/WinAppCli/releases/${versionString}/winappcli-${versionWithoutV}-${process.arch}.zip`

    pipeline.debug(`Downloading tool from ${downloadURL}`)
    let downloadPath: string | null = null
    let archivePath: string | null = null
    const randomDir: string = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(), 'tmp', 'runner', randomDir)
    pipeline.debug(`Creating tempdir ${tempDir}`)
    await pipeline.mkdirP(tempDir)
    downloadPath = await pipeline.downloadTool(downloadURL)

    archivePath = await pipeline.extractZip(downloadPath, tempDir)

    await this.moveToPath(archivePath, 'winapp.exe', pipeline)

    return pipeline.rmRF(tempDir)
  }

  async moveToPath(
    downloadPath: string,
    name: string,
    pipeline: IPipeline
  ): Promise<void> {
    const toolPath = binPath()
    await pipeline.mkdirP(toolPath)

    const dest = path.join(toolPath, name)
    if (!fs.existsSync(dest)) {
      pipeline.moveSync(downloadPath, toolPath)
    }

    pipeline.addPath(toolPath)
  }

  validate(): void {
    if (process.platform !== 'win32') {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }
}

export function binPath(): string {
  const baseLocation: string = process.env['USERPROFILE'] || 'C:\\'

  return path.join(baseLocation, os.userInfo().username, 'winapp')
}
