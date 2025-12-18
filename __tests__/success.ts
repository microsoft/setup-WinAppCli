import ma = require('azure-pipelines-task-lib/mock-answer')
import tmrm = require('azure-pipelines-task-lib/mock-run')
import path = require('path')
const fs = require('fs')

const tempPath = path.join(__dirname, '..', 'tmp')
if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath)
}
process.env['AGENT_TEMPDIRECTORY'] = tempPath

let taskPath = path.join(
  __dirname,
  '..',
  '..',
  'setup-winappcli-task',
  'index.js'
)
let tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath)

// Set input through environment variable
// Temporary, until the release assets' naming is fixed, so latest can work again
process.env['INPUT_version'] = 'v0.1.8'
tmr.run(true)
