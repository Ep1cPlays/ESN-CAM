'use strict'

require('dotenv').config()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function optionalInt(name, fallback) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer`)
  return value
}

function optionalBool(name, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  throw new Error(`${name} must be true or false`)
}

function csv(name) {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

module.exports = {
  discord: {
    token: required('DISCORD_TOKEN'),
    guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    ownerUserId: process.env.CAM_OWNER_USER_ID?.trim() || undefined,
    allowedRoleIds: csv('CAM_ALLOWED_ROLE_IDS')
  },
  minecraft: {
    host: process.env.MC_HOST?.trim() || 'esn.ggwp.cc',
    port: optionalInt('MC_PORT', undefined),
    username: process.env.MC_USERNAME?.trim() || undefined,
    auth: process.env.MC_AUTH?.trim() || 'microsoft',
    version: process.env.MC_VERSION?.trim() || undefined,
    profilesFolder: 'auth',
    reconnectSeconds: optionalInt('MC_RECONNECT_SECONDS', 10)
  },
  recording: {
    width: optionalInt('RECORD_WIDTH', 1080),
    height: optionalInt('RECORD_HEIGHT', 1920),
    fps: optionalInt('RECORD_FPS', 20),
    viewDistance: optionalInt('RECORD_VIEW_DISTANCE', 8),
    directory: process.env.RECORDINGS_DIR?.trim() || 'recordings'
  },
  viewer: {
    enabled: optionalBool('VIEWER_ENABLED', false),
    port: optionalInt('VIEWER_PORT', 3000)
  }
}
