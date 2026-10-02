'use strict'

const { Authflow, Titles } = require('prismarine-auth')

async function testJavaAccess(config, onMsaCode, onStage) {
  const stage = (name, detail = '') => {
    console.log(`[Java auth] ${name}${detail ? ': ' + detail : ''}`)
    if (typeof onStage === 'function') Promise.resolve(onStage(name, detail)).catch(() => {})
  }

  stage('START', 'Java entitlement/profile test (server protocol independent)')
  const cacheId = 'ESN-JAVA-CAM-' + Date.now()
  const flow = new Authflow(cacheId, config.profilesFolder, { flow: 'sisu', authTitle: Titles.MinecraftJava, deviceType: 'Win32', forceRefresh: true }, data => {
    stage('MICROSOFT_DEVICE_CODE', 'waiting for user authorization')
    if (typeof onMsaCode === 'function') Promise.resolve(onMsaCode(data)).catch(() => {})
  })

  try {
    stage('MINECRAFT_AUTH', 'requesting Java token, entitlements, and profile')
    const result = await flow.getMinecraftJavaToken({
      fetchEntitlements: true,
      fetchProfile: true
    })

    const profile = result?.profile
    const items = result?.entitlements?.items || []
    // Safe diagnostics: never log the access token or raw auth response.
    stage('MINECRAFT_TOKEN', result?.token ? 'received' : 'missing')
    stage('ENTITLEMENTS_RESPONSE', result?.entitlements ? `received (${items.length} item(s))` : 'missing')
    stage('PROFILE_RESPONSE', profile ? `received (${profile.name || 'unnamed'})` : 'missing')
    if (!profile || profile.error) {
      const error = new Error('Microsoft/Xbox authentication succeeded, but Minecraft Services did not return a Java profile. Token/entitlement/profile diagnostics were logged above.')
      error.authStage = 'JAVA_PROFILE'
      throw error
    }

    stage('JAVA_PROFILE', `confirmed as ${profile.name}`)
    stage('JAVA_ENTITLEMENT', `${items.length} entitlement item(s) returned`)
    return {
      ok: true,
      username: profile.name,
      uuid: profile.id,
      entitlements: items.map(item => item?.name).filter(Boolean),
      version: 'profile-confirmed',
      host: config.host,
      port: config.port || 25565,
      serverJoinTested: false
    }
  } catch (error) {
    const message = error?.message || String(error)
    let authStage = error?.authStage || 'UNKNOWN'
    if (authStage === 'UNKNOWN') {
      if (/profile|own minecraft|not found/i.test(message)) authStage = 'JAVA_PROFILE'
      else if (/xsts|xbox/i.test(message)) authStage = 'XBOX_XSTS'
      else if (/token|entitlement|minecraft services|minecraftservices/i.test(message)) authStage = 'MINECRAFT_SERVICES_TOKEN'
      else if (/microsoft|msa|device|authorization/i.test(message)) authStage = 'MICROSOFT_LOGIN'
    }
    stage('FAILED_' + authStage, message)
    const wrapped = new Error(`[${authStage}] ${message}`)
    wrapped.authStage = authStage
    throw wrapped
  }
}

async function testJavaConnection(config, onMsaCode, onStage) {
  const stage = (name, detail = '') => {
    console.log(`[Java 26.2] ${name}${detail ? ': ' + detail : ''}`)
    if (typeof onStage === 'function') Promise.resolve(onStage(name, detail)).catch(() => {})
  }

  stage('START', `authenticating Java profile before connecting to ${config.host}`)
  const flow = new Authflow('ESN-JAVA-CAM-CONNECT', config.profilesFolder, {
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
    const error = new Error('Working Microsoft login did not return the Java token/profile needed for the server connection.')
    error.authStage = 'JAVA_PROFILE'
    throw error
  }
  stage('JAVA_PROFILE', `reusing authenticated profile ${profile.name}`)

  const mineflayer = require('mineflayer')
  const options = {
    host: config.host,
    username: profile.name,
    version: '26.2',
    session: {
      accessToken: authResult.token,
      selectedProfile: { name: profile.name, id: profile.id }
    },
    skipValidation: true
  }
  // Important: when no Java port is configured, omit it entirely so
  // node-minecraft-protocol can follow the server's Minecraft SRV record.
  if (config.port) options.port = config.port

  let bot
  try {
    bot = mineflayer.createBot(options)
    return await new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => finish(new Error('Java 26.2 connection timed out after 45 seconds.')), 45000)
      const cleanup = () => {
        clearTimeout(timer)
        bot?.removeListener('spawn', onSpawn)
        bot?.removeListener('kicked', onKicked)
        bot?.removeListener('error', onError)
        bot?.removeListener('end', onEnd)
      }
      const finish = (error, result) => {
        if (settled) return
        settled = true
        cleanup()
        try { bot?.quit('ESN CAM connection test complete') } catch {}
        if (error) reject(error)
        else resolve(result)
      }
      const onSpawn = () => {
        const p = bot.entity?.position
        stage('SPAWN', `joined as ${bot.username || profile.name}`)
        finish(null, {
          ok: true,
          username: bot.username || profile.name,
          version: bot.version || '26.2',
          host: config.host,
          port: config.port || 'SRV/default',
          position: p ? { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)), z: Number(p.z.toFixed(2)) } : null
        })
      }
      const onKicked = reason => finish(new Error('Server kicked Java CAM: ' + (typeof reason === 'string' ? reason : JSON.stringify(reason))))
      const onError = error => finish(error)
      const onEnd = reason => finish(new Error('Java connection ended before spawn: ' + (reason || 'unknown')))
      bot.once('spawn', onSpawn)
      bot.once('kicked', onKicked)
      bot.once('error', onError)
      bot.once('end', onEnd)
    })
  } catch (error) {
    try { bot?.quit() } catch {}
    throw error
  }
}

module.exports = { testJavaAccess, testJavaConnection }
