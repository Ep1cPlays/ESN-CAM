'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = __dirname
const RUNTIME_DIR = path.join(ROOT, '.node22-runtime')
const NODE22 = path.join(RUNTIME_DIR, 'node_modules', 'node', 'bin', 'node')
const NPM_CLI = path.join(RUNTIME_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')

function exists(file) {
  try { return fs.existsSync(file) } catch { return false }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: 'inherit',
    env: options.env || process.env
  })
}

function startCam() {
  console.log('[ESN CAM] Starting ESN CAM...')
  require('./src/index')
}

if (!/^v22\./.test(process.version)) {
  console.log('[ESN CAM] CogitHost Node:', process.version)
  console.log('[ESN CAM] Preparing private Node 22 LTS runtime...')

  if (!exists(NODE22) || !exists(NPM_CLI)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true })
    fs.writeFileSync(
      path.join(RUNTIME_DIR, 'package.json'),
      JSON.stringify({
        name: 'esn-cam-node22-runtime',
        private: true,
        dependencies: {
          node: '22.23.3',
          npm: '10.9.4'
        }
      }, null, 2)
    )

    const bootstrap = run('npm', ['install', '--prefix', RUNTIME_DIR, '--no-audit', '--no-fund', '--foreground-scripts'], {
      env: { ...process.env, npm_config_ignore_scripts: 'false' }
    })

    if (bootstrap.error || bootstrap.status !== 0 || !exists(NODE22) || !exists(NPM_CLI)) {
      console.error('[ESN CAM] Could not create the private Node 22 runtime. Starting CAM with the host runtime instead.')
      startCam()
      return
    }
  }

  console.log('[ESN CAM] Private Node 22 runtime ready.')
  const runtimeBin = path.join(RUNTIME_DIR, 'node_modules', '.bin')
  const child = run(NODE22, [__filename], {
    env: {
      ...process.env,
      ESN_CAM_NODE22: '1',
      PATH: runtimeBin + path.delimiter + (process.env.PATH || '')
    }
  })

  if (child.error) {
    console.error('[ESN CAM] Node 22 launch failed:', child.error.message)
    startCam()
    return
  }

  process.exit(child.status == null ? 1 : child.status)
}

console.log('[ESN CAM] Running under private Node 22:', process.version)

const viewerPackages = ['prismarine-viewer', 'node-canvas-webgl', 'canvas', 'gl']
const missing = viewerPackages.filter(name => {
  try {
    require.resolve(name, { paths: [ROOT] })
    return false
  } catch {
    return true
  }
})

if (missing.length) {
  console.log('[ESN CAM] Installing viewer packages under Node 22...')
  const runtimeBin = path.join(RUNTIME_DIR, 'node_modules', '.bin')
  const install = run(NODE22, [NPM_CLI, 'install', '--no-audit', '--no-fund', '--foreground-scripts'], {
    env: {
      ...process.env,
      PATH: runtimeBin + path.delimiter + (process.env.PATH || ''),
      npm_config_ignore_scripts: 'false'
    }
  })

  if (install.error || install.status !== 0) {
    console.error('[ESN CAM] Viewer install still failed. CAM will start so Discord commands keep working.')
  }
}

console.log('[ESN CAM] Viewer dependency result:')
for (const name of viewerPackages) {
  let ok = false
  try {
    require.resolve(name, { paths: [ROOT] })
    ok = true
  } catch {}
  console.log('[ESN CAM] ' + name + ': ' + (ok ? 'YES' : 'NO'))
}

startCam()
