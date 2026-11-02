import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import type {IPipeline} from '../src/winappcliconfigurator'

describe.each(['GitHub Actions', 'Azure DevOps'])(
  '%s integrity inputs',
  integration => {
    const digest = 'a'.repeat(64)
    let configure: jest.Mock<(pipeline: IPipeline) => Promise<void>>
    let getConfig: jest.Mock
    let getInput: jest.Mock<(name: string) => string | undefined>
    let setFailed: jest.Mock
    let setResult: jest.Mock

    beforeEach(() => {
      jest.resetModules()
      configure = jest
        .fn<(pipeline: IPipeline) => Promise<void>>()
        .mockResolvedValue()
      getConfig = jest.fn().mockReturnValue({configure})
      getInput = jest.fn<(name: string) => string | undefined>(name => {
        return name === 'version' ? 'v0.1.8' : digest
      })
      setFailed = jest.fn()
      setResult = jest.fn()
      jest.doMock('../src/winappcliconfigurator', () => ({getConfig}))
      jest.doMock('@actions/core', () => ({getInput, setFailed}))
      jest.doMock('azure-pipelines-tool-lib/tool', () => ({}))
      jest.doMock('azure-pipelines-task-lib/task', () => ({
        getInput,
        setResult,
        TaskResult: {Failed: 1}
      }))
    })

    afterEach(() => {
      jest.dontMock('../src/winappcliconfigurator')
      jest.dontMock('@actions/core')
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
      expect(getInput).toHaveBeenCalledWith('version')
      expect(getInput).toHaveBeenCalledWith('sha256')
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
  }
)
