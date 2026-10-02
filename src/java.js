'use strict'

const mineflayer = require('mineflayer')

function reasonText(value) {
  if (value == null) return 'unknown'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

async function testJavaAccess(config, onMsaCode) {
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
        if (typeof onMsaCode === 'function') {
          Promise.resolve(onMsaCode(data)).catch(() => {})
        }
      }
    }

    if (config.port) options.port = config.port
    if (config.version) options.version = config.version

    try {
      bot = mineflayer.createBot(options)
    } catch (error) {
      finish(error)
      return
    }

    timer = setTimeout(() => {
      finish(new Error('Java login/server test timed out after 90 seconds.'))
    }, 90_000)

    bot.once('spawn', () => {
      finish(null, {
        ok: true,
        username: bot.username || null,
        version: bot.version || null,
        host: config.host,
        port: config.port || 25565
      })
    })

    bot.on('kicked', reason => {
      finish(new Error('Java server rejected the CAM account: ' + reasonText(reason)))
    })

    bot.on('error', error => {
      finish(new Error(error?.message || reasonText(error)))
    })

    bot.on('end', reason => {
      if (!settled) finish(new Error('Java connection ended before spawn: ' + reasonText(reason)))
    })
  })
}

module.exports = { testJavaAccess }
