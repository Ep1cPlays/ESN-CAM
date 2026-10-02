'use strict'

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

function commandExists(command, args = ['-version']) {
  try {
    const result = spawnSync(command, args, { stdio: 'ignore', timeout: 5000 })
    return result.status === 0
  } catch {
    return false
  }
}

function canRequire(name) {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

function runDiagnostics(config) {
  const checks = {
    node: process.version,
    ffmpeg: commandExists('ffmpeg'),
    xvfbRun: commandExists('xvfb-run', ['--help']),
    nodeCanvasWebgl: canRequire('node-canvas-webgl'),
    prismarineViewer: canRequire('prismarine-viewer'),
    authDirectoryWritable: true,
    recordingsDirectoryWritable: true,
    display: Boolean(process.env.DISPLAY)
  }

  for (const [key, dir] of [
    ['authDirectoryWritable', 'auth'],
    ['recordingsDirectoryWritable', config.recording.directory]
  ]) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.accessSync(dir, fs.constants.W_OK)
    } catch {
      checks[key] = false
    }
  }

  checks.rendererReady = Boolean(
    checks.prismarineViewer &&
    checks.nodeCanvasWebgl &&
    checks.ffmpeg &&
    (checks.display || checks.xvfbRun)
  )

  return checks
}

module.exports = { runDiagnostics }
