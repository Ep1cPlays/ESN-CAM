'use strict'

const mineflayer = require('mineflayer')

function reasonText(value) {
  if (value == null) return 'unknown'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

async function testJavaAccess(config, onMsaCode, onStage) {
  const stage = (name, detail = '') => {
    console.log(`[Java auth] ${name}${detail ? ': ' + detail : ''}`)
    if (typeof onStage === 'function') Promise.resolve(onStage(name, detail)).catch(() => {})
  }
  stage('START', `${config.host}:${config.port || 25565}`)
  return await new Promise((resolve, reject) => {
    let bot
    let timer
    let settled = false

    const finish = (error, result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (bot) {
        try { bot.quit('ESN Java entitlement test complete') } catch {}
      }
      if (error) reject(error)
      else resolve(result)
    }

    const options = {
      host: config.host,
      // With Microsoft device-code auth this is a cache identifier, not the Minecraft profile name.
      // Use a fresh identifier for entitlement tests so stale pre-entitlement tokens can never be reused.
      username: 'ESN-JAVA-CAM-' + Date.now(),
      auth: 'microsoft',
      profilesFolder: config.profilesFolder,
      hideErrors: true,
      onMsaCode: data => {
        stage('MICROSOFT_DEVICE_CODE', 'waiting for user authorization')
        if (typeof onMsaCode === 'function') {
          Promise.resolve(onMsaCode(data)).catch(() => {})
        }
      }
    }

    if (config.port) options.port = config.port
    // Always auto-detect the Java protocol from the server. MC_VERSION is the Bedrock/Geyser version and must not be reused here.
    // Only an explicit MC_JAVA_VERSION should ever be supplied by config; for this entitlement test, auto-detection is safer.

    try {
      stage('MINECRAFT_AUTH', 'starting Microsoft/Xbox/Minecraft Services authentication')
      bot = mineflayer.createBot(options)
    } catch (error) {
      finish(error)
      return
    }

    timer = setTimeout(() => {
      finish(new Error('Java login/server test timed out after 90 seconds.'))
    }, 90_000)

    bot.once('login', () => stage('SERVER_LOGIN', `authenticated as ${bot.username || 'unknown'}`))

    bot.once('spawn', () => {
      stage('SPAWN', 'Java profile authenticated and server join completed')
      finish(null, {
        ok: true,
        username: bot.username || null,
        version: bot.version || null,
        host: config.host,
        port: config.port || 25565
      })
    })

    bot.on('kicked', reason => {
      stage('SERVER_REJECTED', reasonText(reason))
      finish(new Error('Java server rejected the CAM account: ' + reasonText(reason)))
    })

    bot.on('error', error => {
      const message = error?.message || reasonText(error)
      let authStage = 'UNKNOWN'
      if (/profile data|own minecraft|profile/i.test(message)) authStage = 'JAVA_PROFILE'
      else if (/xsts|xbox/i.test(message)) authStage = 'XBOX_XSTS'
      else if (/token|minecraft services|minecraftservices/i.test(message)) authStage = 'MINECRAFT_SERVICES_TOKEN'
      else if (/microsoft|msa|device/i.test(message)) authStage = 'MICROSOFT_LOGIN'
      else if (/connect|econn|timeout|dns|socket/i.test(message)) authStage = 'SERVER_CONNECTION'
      stage('FAILED_' + authStage, message)
      const wrapped = new Error(`[${authStage}] ${message}`)
      wrapped.authStage = authStage
      finish(wrapped)
    })

    bot.on('end', reason => {
      if (!settled) finish(new Error('Java connection ended before spawn: ' + reasonText(reason)))
    })
  })
}

module.exports = { testJavaAccess }
