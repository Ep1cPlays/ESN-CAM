'use strict'

const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

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
    edition: 'bedrock',
    host: process.env.MC_HOST?.trim() || 'esn.ggwp.cc',
    port: optionalInt('MC_PORT', 17429),
    username: process.env.MC_USERNAME?.trim() || undefined,
    version: process.env.MC_VERSION?.trim() || undefined,
    profilesFolder: path.join(__dirname, '..', 'auth'),
    reconnectSeconds: optionalInt('MC_RECONNECT_SECONDS', 10)
  },
  recording: {
    width: optionalInt('RECORD_WIDTH', 1080),
    height: optionalInt('RECORD_HEIGHT', 1920),
    fps: optionalInt('RECORD_FPS', 20),
    viewDistance: optionalInt('RECORD_VIEW_DISTANCE', 8),
    directory: process.env.RECORDINGS_DIR?.trim() || 'recordings',
    overlayEnabled: optionalBool('AD_OVERLAY_ENABLED', true),
    title: process.env.AD_TITLE?.trim() || 'ESN SMP',
    subtitle: process.env.AD_SUBTITLE?.trim() || 'esn.ggwp.cc | JAVA + BEDROCK'
  },
  growth: {
    dataFile: process.env.GROWTH_DATA_FILE?.trim() || path.join(__dirname, '..', 'data', 'growth.json'),
    saleCommissionPercent: optionalInt('GROWTH_SALE_COMMISSION_PERCENT', 50),
    invitesPerReward: optionalInt('GROWTH_INVITES_PER_REWARD', 10),
    inviteRewardDollars: optionalInt('GROWTH_INVITE_REWARD_DOLLARS', 5),
    websiteUrl: process.env.ESN_WEBSITE_URL?.trim() || 'https://esnoffical.com',
    discordInvite: process.env.ESN_DISCORD_INVITE?.trim() || 'https://discord.gg/3gxA66KZ8',
    guardianInvite: process.env.ESN_GUARDIAN_INVITE?.trim() || 'https://discord.com/oauth2/authorize?client_id=1544503232674664573',
    smpBedrockPort: optionalInt('MC_PORT', 17429)
  },
  finance: {
    dataFile: process.env.ESN_FINANCE_DATA_FILE?.trim() || path.join(__dirname, '..', 'data', 'finance.json'),
    maxImportBytes: optionalInt('ESN_FINANCE_IMPORT_MAX_BYTES', 5 * 1024 * 1024)
  },
  cinematic: {
    workerUrl: process.env.CINEMATIC_WORKER_URL?.trim() || 'http://127.0.0.1:8765',
    workerToken: process.env.CINEMATIC_WORKER_TOKEN?.trim() || '',
    outputDir: process.env.CINEMATIC_LOCAL_OUTPUT_DIR?.trim() || path.join(__dirname, '..', 'cinematic-output'),
    maxSourceBytes: optionalInt('CINEMATIC_MAX_SOURCE_BYTES', 100 * 1024 * 1024),
    discordAttachmentBytes: optionalInt('CINEMATIC_DISCORD_ATTACHMENT_BYTES', 24 * 1024 * 1024),
    defaultSeconds: optionalInt('CINEMATIC_DEFAULT_SECONDS', 8),
    defaultQuality: process.env.CINEMATIC_DEFAULT_QUALITY?.trim() || 'fast',
    websiteUrl: process.env.ESN_WEBSITE_URL?.trim() || 'https://esnoffical.com',
    discordInvite: process.env.ESN_DISCORD_INVITE?.trim() || 'https://discord.gg/3gxA66KZ8'
  },
  viewer: {
    enabled: optionalBool('VIEWER_ENABLED', false),
    port: optionalInt('VIEWER_PORT', 3000)
  }
}
