import * as taskLib from 'azure-pipelines-task-lib/task'
import * as toolLib from 'azure-pipelines-tool-lib/tool'
import * as winappcliconfigurator from './winappcliconfigurator'
import * as fs from 'fs'
import {Agent, ProxyAgent, fetch} from 'undici'
import type {ConnectionOptions} from 'tls'
import {buildProxyBypassRegexFromEnv} from 'typed-rest-client/Util'

const Version = 'version'

class AzurePipeline implements winappcliconfigurator.IPipeline {
  async getRelease(url: string): Promise<unknown> {
    const configuredProxy = taskLib.getHttpProxyConfiguration()
    const proxy = taskLib.getHttpProxyConfiguration(url)
    const cert = taskLib.getHttpCertConfiguration()
    const tls: ConnectionOptions = {
      ca: cert?.caFile ? fs.readFileSync(cert.caFile) : undefined,
      cert: cert?.certFile ? fs.readFileSync(cert.certFile) : undefined,
      key: cert?.keyFile ? fs.readFileSync(cert.keyFile) : undefined,
      pfx: cert?.certArchiveFile
        ? fs.readFileSync(cert.certArchiveFile)
        : undefined,
      passphrase: cert?.passphrase
    }
    const bypassEnvironmentProxy =
      !configuredProxy && process.env.NO_PROXY
        ? process.env.NO_PROXY.split(',').some(bypass =>
            buildProxyBypassRegexFromEnv(bypass).test(url)
          )
        : false
    const proxyUrl = configuredProxy
      ? proxy?.proxyUrl
      : bypassEnvironmentProxy
        ? undefined
        : process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    const dispatcher = proxyUrl
      ? new ProxyAgent({
          uri: proxyUrl,
          token: winappcliconfigurator.proxyAuthorization(
            proxyUrl,
            proxy?.proxyUsername,
            proxy?.proxyPassword
          ),
          requestTls: tls,
          proxyTls: tls
        })
      : new Agent({connect: tls})
    try {
      const token = taskLib.getInput('github-token') || ''
      if (token) taskLib.setSecret(token)
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
    taskLib.debug(message)
  }
  addPath(p: string): void {
    taskLib.prependPath(p)
  }
  async mkdirP(p: string): Promise<void> {
    taskLib.mkdirP(p)
  }
  async downloadTool(url: string): Promise<string> {
    return toolLib.downloadTool(url)
  }
  async extractZip(archivePath: string, dest: string): Promise<string> {
    return toolLib.extractZip(archivePath, dest)
  }
  async rmRF(p: string): Promise<void> {
    taskLib.rmRF(p)
  }
  moveSync(downloadPath: string, toolPath: string): void {
    this.rmRF(toolPath)
    fs.renameSync(downloadPath, toolPath)
  }
}

async function run(): Promise<void> {
  try {
    await winappcliconfigurator
      .getConfig(
        taskLib.getInput(Version) || 'latest',
        taskLib.getInput('sha256') || ''
      )
      .configure(new AzurePipeline())
  } catch (err) {
    if (err instanceof Error)
      taskLib.setResult(taskLib.TaskResult.Failed, err.message)
  }
}

run()
