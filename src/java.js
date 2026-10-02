'use strict'

const { Authflow } = require('prismarine-auth')

async function testJavaAccess(config, onMsaCode, onStage) {
  const stage = (name, detail = '') => {
    console.log(`[Java auth] ${name}${detail ? ': ' + detail : ''}`)
    if (typeof onStage === 'function') Promise.resolve(onStage(name, detail)).catch(() => {})
  }

  stage('START', 'Java entitlement/profile test (server protocol independent)')
  const cacheId = 'ESN-JAVA-CAM-' + Date.now()
  const flow = new Authflow(cacheId, config.profilesFolder, { flow: 'live', authTitle: 'ESN CAM', forceRefresh: true }, data => {
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
    if (!profile || profile.error) {
      const error = new Error('Microsoft authentication succeeded, but no Minecraft Java profile was returned.')
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

module.exports = { testJavaAccess }
