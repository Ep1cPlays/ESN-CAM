'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Authflow, Titles } = require('prismarine-auth')

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function waitForStableFile(filePath, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let lastSize = -1
    let stableChecks = 0

    const timer = setInterval(() => {
      try {
        if (fs.existsSync(filePath)) {
          const size = fs.statSync(filePath).size
          if (size > 1024) {
            if (size === lastSize) stableChecks += 1
            else stableChecks = 0
            lastSize = size
            if (stableChecks >= 3) {
              clearInterval(timer)
              resolve(size)
              return
            }
          }
        }
      } catch {}

      if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error('Timed out waiting for the Java renderer to produce an MP4.'))
      }
    }, 750)
  })
}

async function testJavaRender(config, onMsaCode, onStage) {
  const stage = (name, detail = '') => {
    console.log(`[Java render] ${name}${detail ? ': ' + detail : ''}`)
    if (typeof onStage === 'function') Promise.resolve(onStage(name, detail)).catch(() => {})
  }

  stage('AUTH', 'authenticating the working Java profile')
  const flow = new Authflow('ESN-JAVA-CAM-RENDER', config.profilesFolder, {
    flow: 'sisu',
    authTitle: Titles.MinecraftJava,
    deviceType: 'Win32'
  }, data => {
    stage('MICROSOFT_DEVICE_CODE', 'waiting for user authorization')
    if (typeof onMsaCode === 'function') Promise.resolve(onMsaCode(data)).catch(() => {})
  })

  const authResult = await flow.getMinecraftJavaToken({
    fetchEntitlements: true,
    fetchProfile: true
  })

  const profile = authResult?.profile
  if (!authResult?.token || !profile?.name || !profile?.id) {
    throw new Error('Java render test could not obtain the working Minecraft Java profile/token.')
  }

  const mineflayer = require('mineflayer')
  const session = {
    accessToken: authResult.token,
    selectedProfile: profile,
    availableProfile: [profile]
  }

  const authenticatedJava = (client, options) => {
    client.session = session
    client.username = profile.name
    options.username = profile.name
    options.accessToken = authResult.token
    options.haveCredentials = true
    client.emit('session', session)
    options.connect(client)
  }

  const botOptions = {
    host: config.host,
    username: profile.name,
    auth: authenticatedJava,
    version: '26.2'
  }
  if (config.port) botOptions.port = config.port

  let bot
  try {
    stage('CONNECT', `joining ${config.host}`)
    bot = mineflayer.createBot(botOptions)

    await new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => finish(new Error('Java render test timed out before spawn.')), 45000)

      const cleanup = () => {
        clearTimeout(timer)
        bot?.removeListener('spawn', onSpawn)
        bot?.removeListener('kicked', onKicked)
        bot?.removeListener('error', onError)
        bot?.removeListener('end', onEnd)
      }

      const finish = error => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }

      const onSpawn = () => finish()
      const onKicked = reason => finish(new Error('Server kicked Java CAM: ' + (typeof reason === 'string' ? reason : JSON.stringify(reason))))
      const onError = error => finish(error)
      const onEnd = reason => finish(new Error('Java CAM disconnected before render: ' + (reason || 'unknown')))

      bot.once('spawn', onSpawn)
      bot.once('kicked', onKicked)
      bot.once('error', onError)
      bot.once('end', onEnd)
    })

    stage('SPAWN', `joined as ${bot.username || profile.name}`)
    await wait(2500)

    stage('RENDERER', 'starting Prismarine Viewer headless smoke test')
    require('node-canvas-webgl')
    const viewer = require('prismarine-viewer')
    if (typeof viewer.headless !== 'function') {
      throw new Error('Prismarine Viewer loaded, but its headless renderer is unavailable.')
    }

    const outputDir = path.join(__dirname, '..', 'recordings', 'java-render-tests')
    fs.mkdirSync(outputDir, { recursive: true })
    const output = path.join(outputDir, `java-render-${Date.now()}.mp4`)

    const maybePromise = viewer.headless(bot, {
      output,
      frames: 60,
      width: 640,
      height: 360,
      viewDistance: 6,
      logFFMPEG: true
    })

    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise
    }

    const size = await waitForStableFile(output, 45000)
    stage('PASS', `rendered ${size} bytes`)

    return {
      ok: true,
      username: bot.username || profile.name,
      version: bot.version || '26.2',
      host: config.host,
      port: config.port || 'SRV/default',
      output,
      size
    }
  } finally {
    try { bot?.quit('ESN CAM render test complete') } catch {}
  }
}

module.exports = { testJavaRender }
