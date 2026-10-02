'use strict'

const {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js')
const fs = require('node:fs')
const { addShot, clearPreset, listPresets } = require('./scenes')
const { runDiagnostics } = require('./diagnostics')

const PRESET_CHOICES = [
  { name: 'Full Advertisement', value: 'full-ad' },
  { name: 'Spawn', value: 'spawn' },
  { name: 'PvP', value: 'pvp' },
  { name: 'Boss', value: 'boss' },
  { name: 'Exclusive Items', value: 'exclusive-items' }
]

function addPresetOption(sub, required = true) {
  return sub.addStringOption(option => option
    .setName('preset')
    .setDescription('Advertisement preset')
    .setRequired(required)
    .addChoices(...PRESET_CHOICES))
}

function commandDefinition() {
  return new SlashCommandBuilder()
    .setName('cam')
    .setDescription('Control ESN CAM')
    .addSubcommand(sub => sub.setName('start').setDescription('Connect ESN CAM to ESN SMP'))
    .addSubcommand(sub => sub.setName('stop').setDescription('Disconnect ESN CAM from Minecraft'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show ESN CAM status'))
    .addSubcommand(sub => sub.setName('diagnostics').setDescription('Check Raven recording support'))
    .addSubcommand(sub => sub.setName('presets').setDescription('List recording presets and shot counts'))
    .addSubcommand(sub => addPresetOption(
      sub.setName('record').setDescription('Record an advertisement preset')
    ))
    .addSubcommand(sub =>
      sub.setName('shot-add')
        .setDescription('Save ESN CAM current position as a shot')
        .addStringOption(option => option
          .setName('preset')
          .setDescription('Advertisement preset')
          .setRequired(true)
          .addChoices(...PRESET_CHOICES))
        .addStringOption(option => option
          .setName('name')
          .setDescription('Shot name')
          .setRequired(true))
        .addIntegerOption(option => option
          .setName('seconds')
          .setDescription('Clip length in seconds')
          .setMinValue(1)
          .setMaxValue(30)
          .setRequired(false)))
    .addSubcommand(sub => addPresetOption(
      sub.setName('shot-clear').setDescription('Delete every shot in a preset')
    ))
    .addSubcommand(sub => sub
      .setName('goto')
      .setDescription('Move ESN CAM to coordinates')
      .addNumberOption(option => option.setName('x').setDescription('X').setRequired(true))
      .addNumberOption(option => option.setName('y').setDescription('Y').setRequired(true))
      .addNumberOption(option => option.setName('z').setDescription('Z').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('look')
      .setDescription('Aim ESN CAM at coordinates')
      .addNumberOption(option => option.setName('x').setDescription('Target X').setRequired(true))
      .addNumberOption(option => option.setName('y').setDescription('Target Y').setRequired(true))
      .addNumberOption(option => option.setName('z').setDescription('Target Z').setRequired(true)))
}

function isAuthorized(interaction, config) {
  if (config.ownerUserId && interaction.user.id === config.ownerUserId) return true
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true

  const roles = interaction.member?.roles
  const roleIds = roles?.cache ? [...roles.cache.keys()] : Array.isArray(roles) ? roles : []
  return config.allowedRoleIds.some(id => roleIds.includes(id))
}

function statusLine(value) {
  return value ? 'YES' : 'NO'
}

async function safeReply(interaction, options) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(options)
  return interaction.reply(options)
}

async function createDiscordController(config, camera, recorder, fullConfig) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', async () => {
    const definition = commandDefinition().toJSON()
    if (config.guildId) {
      const guild = await client.guilds.fetch(config.guildId)
      await guild.commands.set([definition])
      console.log(`ESN CAM ready as ${client.user.tag}; /cam registered in ${guild.name}`)
    } else {
      await client.application.commands.set([definition])
      console.log(`ESN CAM ready as ${client.user.tag}; /cam registered globally`)
    }
  })

  camera.on('warning', message => console.warn(`[Minecraft] ${message}`))
  camera.on('online', () => console.log('[Minecraft] ESN CAM joined the server'))
  camera.on('offline', reason => console.log(`[Minecraft] Disconnected: ${reason || 'unknown'}`))

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'cam') return

    if (!isAuthorized(interaction, config)) {
      await interaction.reply({ content: 'You are not authorized to control ESN CAM.', ephemeral: true })
      return
    }

    const sub = interaction.options.getSubcommand()

    try {
      if (sub === 'start') {
        await interaction.deferReply({ ephemeral: true })
        await camera.start(async data => {
          const url = data.verification_uri || data.verification_uri_complete || 'https://www.microsoft.com/link'
          const code = data.user_code || data.code || 'Check the Raven console'
          await interaction.followUp({
            content: `**Microsoft login required**\nOpen: ${url}\nCode: **${code}**\nAfter you approve it, ESN CAM will continue connecting automatically.`,
            ephemeral: true
          }).catch(() => {})
        })
        await interaction.editReply('ESN CAM is connecting to **esn.ggwp.cc**. If Microsoft needs authorization, I will send the login code here.')
        return
      }

      if (sub === 'stop') {
        await camera.stop()
        await interaction.reply({ content: 'ESN CAM has been disconnected.', ephemeral: true })
        return
      }

      if (sub === 'status') {
        const mc = camera.getStatus()
        const recording = recorder.getStatus()
        const pos = mc.position ? `${mc.position.x}, ${mc.position.y}, ${mc.position.z}` : 'unknown'
        await interaction.reply({
          content:
            `**Minecraft:** ${mc.state}\n` +
            `**Account:** ${mc.username || 'not connected'}\n` +
            `**Minecraft version:** ${mc.version || 'unknown'}\n` +
            `**Position:** ${pos}\n` +
            `**Recording:** ${recording.active ? 'ACTIVE' : 'idle'}\n` +
            `**Last job:** ${recording.lastJob?.state || 'none'}` +
            (mc.lastError ? `\n**Last error:** ${mc.lastError}` : ''),
          ephemeral: true
        })
        return
      }

      if (sub === 'diagnostics') {
        const d = runDiagnostics(fullConfig)
        await interaction.reply({
          content:
            `**Raven renderer ready:** ${statusLine(d.rendererReady)}\n` +
            `Node: ${d.node}\n` +
            `FFmpeg: ${statusLine(d.ffmpeg)}\n` +
            `node-canvas-webgl: ${statusLine(d.nodeCanvasWebgl)}\n` +
            `Xvfb or DISPLAY: ${statusLine(d.xvfbRun || d.display)}\n` +
            `Prismarine Viewer: ${statusLine(d.prismarineViewer)}\n` +
            `Writable auth storage: ${statusLine(d.authDirectoryWritable)}\n` +
            `Writable recordings storage: ${statusLine(d.recordingsDirectoryWritable)}`,
          ephemeral: true
        })
        return
      }

      if (sub === 'presets') {
        const lines = listPresets().map(p => `**${p.name}** — ${p.shots} shots — ${p.description}`)
        await interaction.reply({ content: lines.join('\n') || 'No presets configured.', ephemeral: true })
        return
      }

      if (sub === 'goto') {
        await interaction.deferReply({ ephemeral: true })
        const x = interaction.options.getNumber('x', true)
        const y = interaction.options.getNumber('y', true)
        const z = interaction.options.getNumber('z', true)
        await camera.goTo({ x, y, z }, 1)
        await interaction.editReply(`ESN CAM reached **${x}, ${y}, ${z}**.`)
        return
      }

      if (sub === 'look') {
        const x = interaction.options.getNumber('x', true)
        const y = interaction.options.getNumber('y', true)
        const z = interaction.options.getNumber('z', true)
        await camera.lookAt({ x, y, z })
        await interaction.reply({ content: `ESN CAM is now aimed at **${x}, ${y}, ${z}**.`, ephemeral: true })
        return
      }

      if (sub === 'shot-add') {
        const preset = interaction.options.getString('preset', true)
        const name = interaction.options.getString('name', true)
        const seconds = interaction.options.getInteger('seconds') || 5
        const shot = camera.getCurrentShot(name, seconds)
        const count = addShot(preset, shot)
        await interaction.reply({
          content: `Saved **${name}** to **${preset}** as shot #${count}.`,
          ephemeral: true
        })
        return
      }

      if (sub === 'shot-clear') {
        const preset = interaction.options.getString('preset', true)
        clearPreset(preset)
        await interaction.reply({ content: `Cleared every shot from **${preset}**.`, ephemeral: true })
        return
      }

      if (sub === 'record') {
        const preset = interaction.options.getString('preset', true)
        await interaction.deferReply({ ephemeral: true })
        await interaction.editReply(`Recording **${preset}** now...`)

        const result = await recorder.recordPreset(preset)
        if (!result.finalOutput || !fs.existsSync(result.finalOutput)) {
          await interaction.followUp({ content: `Recording completed, but the final output file could not be found. Job: ${result.id}`, ephemeral: true })
          return
        }

        const size = fs.statSync(result.finalOutput).size
        const discordLimit = 24 * 1024 * 1024
        if (size <= discordLimit) {
          const attachment = new AttachmentBuilder(result.finalOutput)
          await interaction.followUp({
            content: `**${preset}** recording complete.`,
            files: [attachment]
          })
        } else {
          await interaction.followUp({
            content: `**${preset}** recording complete, but it is too large to attach here. Saved as: \`${result.finalOutput}\``,
            ephemeral: true
          })
        }
      }
    } catch (error) {
      console.error(error)
      await safeReply(interaction, { content: `ESN CAM error: ${error.message}`, ephemeral: true })
    }
  })

  await client.login(config.token)
  return client
}

module.exports = { createDiscordController }
