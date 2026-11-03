import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import * as winappcliconfigurator from './winappcliconfigurator'
import * as fs from 'fs-extra'
import {Agent, ProxyAgent, fetch} from 'undici'
import {getProxyUrl} from '@actions/http-client'

const Version = 'version'

class GitHubPipeline implements winappcliconfigurator.IPipeline {
  async getRelease(url: string): Promise<unknown> {
    const token = core.getInput('github-token')
    if (token) core.setSecret(token)
    const proxyUrl = getProxyUrl(url)
    const dispatcher = proxyUrl
      ? new ProxyAgent({
          uri: proxyUrl,
          token: winappcliconfigurator.proxyAuthorization(proxyUrl)
        })
      : new Agent()
    try {
      return await winappcliconfigurator.fetchRelease(
        url,
        token,
        (url, options) => fetch(url, {...options, dispatcher})
      )
    } finally {
      await dispatcher.destroy()
    }
  }
  debug(message: string): void {
    core.debug(message)
  }
  addPath(p: string): void {
    core.addPath(p)
  }
  async mkdirP(p: string): Promise<void> {
    return io.mkdirP(p)
  }
  async downloadTool(url: string, dest: string): Promise<string> {
    return tc.downloadTool(url, dest)
  }
  async extractZip(archivePath: string, dest: string): Promise<string> {
    return tc.extractZip(archivePath, dest)
  }
  async rmRF(p: string): Promise<void> {
    return io.rmRF(p)
  }
  moveSync(downloadPath: string, toolPath: string): void {
    fs.moveSync(downloadPath, toolPath, {overwrite: true})
  }
}

export async function run(): Promise<void> {
  try {
    await winappcliconfigurator
      .getConfig(
        core.getInput(Version, {trimWhitespace: false}),
        core.getInput('sha256', {trimWhitespace: false})
      )
      .configure(new GitHubPipeline())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
