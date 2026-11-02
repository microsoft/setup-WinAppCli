import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import type {IPipeline} from '../src/winappcliconfigurator'
import type {
  CertConfiguration,
  ProxyConfiguration
} from 'azure-pipelines-task-lib/task'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as http from 'http'
import type {Socket} from 'net'

describe.each(['GitHub Actions', 'Azure DevOps'])(
  '%s integrity inputs',
  integration => {
    const digest = 'a'.repeat(64)
    let configure: jest.Mock<(pipeline: IPipeline) => Promise<void>>
    let getConfig: jest.Mock
    let getInput: jest.Mock<
      (name: string, options?: {trimWhitespace?: boolean}) => string | undefined
    >
    let setFailed: jest.Mock
    let setResult: jest.Mock
    let setSecret: jest.Mock
    type MetadataFetch = (
      url: string,
      options: RequestInit & {dispatcher: {destroy(): Promise<void>}}
    ) => Promise<Response>
    let fetchMock: jest.Mock<MetadataFetch>
    let destroy: jest.Mock<() => Promise<void>>
    let proxyAgent: jest.Mock
    let directAgent: jest.Mock
    let getProxy: jest.Mock<(url?: string) => ProxyConfiguration | null>
    let getCert: jest.Mock<() => CertConfiguration | null>
    const originalEnvironment = process.env

    beforeEach(() => {
      jest.resetModules()
      jest.replaceProperty(process, 'env', {...originalEnvironment})
      for (const name of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'NO_PROXY',
        'http_proxy',
        'https_proxy',
        'no_proxy'
      ]) {
        delete process.env[name]
      }
      configure = jest
        .fn<(pipeline: IPipeline) => Promise<void>>()
        .mockResolvedValue()
      getConfig = jest.fn().mockReturnValue({configure})
      getInput = jest.fn<
        (
          name: string,
          options?: {trimWhitespace?: boolean}
        ) => string | undefined
      >(name => {
        return name === 'version' ? 'v0.1.8' : digest
      })
      setFailed = jest.fn()
      setResult = jest.fn()
      setSecret = jest.fn()
      destroy = jest.fn<() => Promise<void>>().mockResolvedValue()
      proxyAgent = jest.fn().mockImplementation(() => ({destroy}))
      directAgent = jest.fn().mockImplementation(() => ({destroy}))
      fetchMock = jest
        .fn<MetadataFetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({tag_name: 'v0.1.8', assets: []}))
        )
      getProxy = jest
        .fn<(url?: string) => ProxyConfiguration | null>()
        .mockReturnValue(null)
      getCert = jest.fn<() => CertConfiguration | null>().mockReturnValue(null)
      jest.doMock('../src/winappcliconfigurator', () => ({
        ...jest.requireActual<typeof import('../src/winappcliconfigurator')>(
          '../src/winappcliconfigurator'
        ),
        getConfig
      }))
      jest.doMock('undici', () => ({
        fetch: fetchMock,
        ProxyAgent: proxyAgent,
        Agent: directAgent
      }))
      jest.doMock('@actions/core', () => ({getInput, setFailed, setSecret}))
      jest.doMock('azure-pipelines-tool-lib/tool', () => ({}))
      jest.doMock('azure-pipelines-task-lib/task', () => ({
        getInput,
        setResult,
        setSecret,
        getHttpProxyConfiguration: getProxy,
        getHttpCertConfiguration: getCert,
        TaskResult: {Failed: 1}
      }))
    })

    afterEach(() => {
      jest.restoreAllMocks()
      jest.dontMock('../src/winappcliconfigurator')
      jest.dontMock('@actions/core')
      jest.dontMock('undici')
      jest.dontMock('azure-pipelines-tool-lib/tool')
      jest.dontMock('azure-pipelines-task-lib/task')
      jest.resetModules()
    })

    async function runIntegration(): Promise<void> {
      if (integration === 'GitHub Actions') {
        const main = await import('../src/main')
        await main.run()
      } else {
        await import('../src/azure-devops-task')
      }
    }

    it('passes the version and SHA-256 pin to the shared configurator', async () => {
      await runIntegration()
      if (integration === 'GitHub Actions') {
        expect(getInput).toHaveBeenCalledWith('version', {
          trimWhitespace: false
        })
        expect(getInput).toHaveBeenCalledWith('sha256', {trimWhitespace: false})
      } else {
        expect(getInput).toHaveBeenCalledWith('version')
        expect(getInput).toHaveBeenCalledWith('sha256')
      }
      expect(getConfig).toHaveBeenCalledWith('v0.1.8', digest)
      expect(configure).toHaveBeenCalledTimes(1)
      expect(setFailed).not.toHaveBeenCalled()
      expect(setResult).not.toHaveBeenCalled()
    })

    it('preserves empty input defaults', async () => {
      getInput.mockReturnValue('')
      await runIntegration()
      expect(getConfig).toHaveBeenCalledWith(
        integration === 'GitHub Actions' ? '' : 'latest',
        ''
      )
    })

    it('reports verification failures through the pipeline failure surface', async () => {
      configure.mockRejectedValue(new Error('SHA-256 verification failed'))
      await runIntegration()
      if (integration === 'GitHub Actions') {
        expect(setFailed).toHaveBeenCalledWith('SHA-256 verification failed')
      } else {
        expect(setResult).toHaveBeenCalledWith(1, 'SHA-256 verification failed')
      }
    })

    async function getPipeline(): Promise<IPipeline> {
      await runIntegration()
      return configure.mock.calls[0][0]
    }

    const url =
      'https://api.github.com/repos/microsoft/WinAppCli/releases/latest'

    it('authenticates only the metadata request and masks the token', async () => {
      const pipeline = await getPipeline()
      await expect(pipeline.getRelease(url)).resolves.toEqual({
        tag_name: 'v0.1.8',
        assets: []
      })
      expect(setSecret).toHaveBeenCalledWith(digest)
      expect(fetchMock).toHaveBeenCalledWith(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'setup-WinAppCli',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${digest}`
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
        dispatcher: {destroy}
      })
      expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('allows an omitted API token without sending an Authorization header', async () => {
      const pipeline = await getPipeline()
      getInput.mockReturnValue('')
      await pipeline.getRelease(url)
      const options = fetchMock.mock.calls[0][1]
      expect(options?.headers).not.toHaveProperty('Authorization')
      expect(setSecret).not.toHaveBeenCalled()
    })

    it.each([new Error('network failure'), new TypeError('redirect rejected')])(
      'destroys the transport when the request fails: %s',
      async error => {
        const pipeline = await getPipeline()
        fetchMock.mockRejectedValue(error)
        await expect(pipeline.getRelease(url)).rejects.toThrow(error)
        expect(destroy).toHaveBeenCalledTimes(1)
      }
    )

    it('consumes an error response and reports rate limits without leaking credentials', async () => {
      const pipeline = await getPipeline()
      const response = new Response('rate limited', {
        status: 403,
        headers: {'x-ratelimit-remaining': '0'}
      })
      fetchMock.mockResolvedValue(response)
      await expect(pipeline.getRelease(url)).rejects.toThrow(
        'GitHub API returned 403 (API rate limit exceeded)'
      )
      expect(response.bodyUsed).toBe(true)
      expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('destroys the transport when JSON is malformed', async () => {
      const pipeline = await getPipeline()
      fetchMock.mockResolvedValue(new Response('{invalid'))
      await expect(pipeline.getRelease(url)).rejects.toThrow(SyntaxError)
      expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('uses a direct transport when no proxy is configured', async () => {
      const pipeline = await getPipeline()
      await pipeline.getRelease(url)
      expect(directAgent).toHaveBeenCalledTimes(1)
      expect(proxyAgent).not.toHaveBeenCalled()
      if (integration === 'Azure DevOps') {
        expect(getProxy).toHaveBeenCalledWith(url)
      }
    })

    it.each([
      {bypass: 'github.com', usesProxy: false},
      {bypass: 'API.GITHUB.COM', usesProxy: false},
      {bypass: '.github.com', usesProxy: false},
      {bypass: '*', usesProxy: false},
      {bypass: 'github.com:443', usesProxy: integration === 'Azure DevOps'},
      {bypass: 'unrelated.example', usesProxy: true},
      {bypass: '', usesProxy: true}
    ])(
      'preserves actual toolkit NO_PROXY matching for $bypass (proxy: $usesProxy)',
      async ({bypass, usesProxy}) => {
        const undici = jest.requireActual<typeof import('undici')>('undici')
        jest.doMock('undici', () => ({...undici, fetch: fetchMock}))
        process.env.HTTPS_PROXY = 'http://proxy.example:8080'
        process.env.NO_PROXY = bypass
        const pipeline = await getPipeline()
        await pipeline.getRelease(url)
        const dispatcher = fetchMock.mock.calls[0][1].dispatcher
        expect(dispatcher).toBeInstanceOf(
          usesProxy ? undici.ProxyAgent : undici.Agent
        )
      }
    )

    async function withLocalProxy(
      run: (proxyUrl: string, server: http.Server) => Promise<void>
    ): Promise<void> {
      const undici = jest.requireActual<typeof import('undici')>('undici')
      jest.doMock('undici', () => undici)
      const server = http.createServer()
      const sockets = new Set<Socket>()
      server.on('connection', socket => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      try {
        const address = server.address()
        if (!address || typeof address === 'string') {
          throw new Error('Expected a local TCP proxy address')
        }
        const proxyUrl = `http://127.0.0.1:${address.port}`
        process.env.HTTPS_PROXY = proxyUrl
        await run(proxyUrl, server)
      } finally {
        for (const socket of sockets) socket.destroy()
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    }

    it.each([
      {username: 'proxy-user', password: ''},
      {username: '', password: 'proxy-password'},
      {username: 'proxy-user', password: 'proxy-password'},
      {username: 'proxy user', password: 'p@ss:word'}
    ])(
      'sends proxy Basic auth with username $username and password $password',
      async ({username, password}) => {
        await withLocalProxy(async (proxyUrl, server) => {
          const proxy = new URL(proxyUrl)
          proxy.username = username
          proxy.password = password
          process.env.HTTPS_PROXY = proxy.href
          let authorization: string | undefined
          server.on('connect', (request, socket) => {
            authorization = request.headers['proxy-authorization']
            socket.end(
              'HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n'
            )
          })
          const pipeline = await getPipeline()
          await expect(pipeline.getRelease(url)).rejects.toThrow()
          expect(authorization).toBe(
            `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
          )
        })
      }
    )

    it('cancels a stalled CONNECT promptly when the metadata deadline expires', async () => {
      await withLocalProxy(async (_proxyUrl, server) => {
        let connected: () => void = () => {}
        const connection = new Promise<void>(resolve => {
          connected = resolve
        })
        server.on('connect', connected)
        const controller = new AbortController()
        const timeout = jest
          .spyOn(AbortSignal, 'timeout')
          .mockReturnValue(controller.signal)
        const pipeline = await getPipeline()
        let watchdog: ReturnType<typeof setTimeout> | undefined
        const deadline = new Promise<never>((_resolve, reject) => {
          watchdog = setTimeout(
            () => reject(new Error('Stalled proxy exceeded cleanup deadline')),
            3000
          )
        })
        try {
          const request = pipeline.getRelease(url)
          await Promise.race([connection, deadline])
          const started = Date.now()
          controller.abort(new Error('metadata deadline expired'))
          await expect(Promise.race([request, deadline])).rejects.toThrow(
            'metadata deadline expired'
          )
          expect(timeout).toHaveBeenCalledWith(30000)
          expect(Date.now() - started).toBeLessThan(1000)
        } finally {
          clearTimeout(watchdog)
        }
      })
    })

    if (integration === 'Azure DevOps') {
      it('does not reapply environment proxies when the agent bypasses this URL', async () => {
        const pipeline = await getPipeline()
        getProxy.mockImplementation(requestUrl =>
          requestUrl
            ? null
            : {
                proxyUrl: 'http://proxy.example:8080',
                proxyFormattedUrl: 'http://proxy.example:8080'
              }
        )
        await pipeline.getRelease(url)
        expect(directAgent).toHaveBeenCalledTimes(1)
        expect(proxyAgent).not.toHaveBeenCalled()
      })

      it('honors agent proxy credentials and CA/client certificate configuration', async () => {
        const pipeline = await getPipeline()
        const directory = fs.mkdtempSync(
          path.join(os.tmpdir(), 'winapp-agent-tls-')
        )
        try {
          const caFile = path.join(directory, 'ca.pem')
          const certFile = path.join(directory, 'cert.pem')
          const keyFile = path.join(directory, 'key.pem')
          fs.writeFileSync(caFile, 'test CA')
          fs.writeFileSync(certFile, 'test cert')
          fs.writeFileSync(keyFile, 'test key')
          getProxy.mockReturnValue({
            proxyUrl: 'http://proxy.example:8080',
            proxyFormattedUrl: 'http://proxy.example:8080',
            proxyUsername: 'test-user',
            proxyPassword: 'test-password'
          })
          getCert.mockReturnValue({
            caFile,
            certFile,
            keyFile,
            passphrase: 'test-passphrase'
          })
          await pipeline.getRelease(url)
          const tls = {
            ca: Buffer.from('test CA'),
            cert: Buffer.from('test cert'),
            key: Buffer.from('test key'),
            pfx: undefined,
            passphrase: 'test-passphrase'
          }
          expect(getProxy).toHaveBeenCalledWith(url)
          expect(proxyAgent).toHaveBeenCalledWith({
            uri: 'http://proxy.example:8080',
            token: `Basic ${Buffer.from('test-user:test-password').toString('base64')}`,
            requestTls: tls,
            proxyTls: tls
          })
        } finally {
          fs.rmSync(directory, {recursive: true, force: true})
        }
      })

      it('surfaces unreadable agent certificate files before making a request', async () => {
        const pipeline = await getPipeline()
        getCert.mockReturnValue({
          caFile: path.join(os.tmpdir(), `missing-ca-${Date.now()}.pem`)
        })
        await expect(pipeline.getRelease(url)).rejects.toThrow('ENOENT')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(proxyAgent).not.toHaveBeenCalled()
      })
    }
  }
)

it('defaults to the workflow token only for the public GitHub server', () => {
  const manifest = fs.readFileSync(
    path.join(__dirname, '..', 'action.yml'),
    'utf8'
  )
  expect(manifest).toContain(
    "default: ${{ github.server_url == 'https://github.com' && github.token || '' }}"
  )
})
