'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js')

const FORMAT_CHOICES = [
  { name: 'Vertical 9:16 (TikTok/Reels/Shorts)', value: '9:16' },
  { name: 'Widescreen 16:9 (YouTube/Discord)', value: '16:9' },
  { name: 'Square 1:1', value: '1:1' }
]

const STYLE_CHOICES = [
  { name: 'ESN Cinematic', value: 'esn-cinematic' },
  { name: 'Dark Epic', value: 'dark-epic' },
  { name: 'High Energy', value: 'high-energy' },
  { name: 'Clean Tech', value: 'clean-tech' },
  { name: 'Minecraft Trailer', value: 'minecraft-trailer' }
]

const PRESETS = {
  'smp-trailer': {
    title: 'ESN SMP',
    prompt: 'Epic cinematic gaming trailer for ESN SMP. Sweeping fantasy-world establishing shots, dramatic aerial movement, monumental spawn architecture, intense PvP energy, boss-battle scale, lightning and atmospheric particles, premium game-trailer lighting, strong depth, fast but readable edits, no copyrighted logos or characters. End with a clean heroic visual suitable for an ESN SMP join call-to-action.'
  },
  guardian: {
    title: 'ESN Guardian',
    prompt: 'Cinematic cybersecurity trailer for ESN Guardian, a Discord server security system. Dark command-center atmosphere, abstract server infrastructure, incoming raid visualized as waves of hostile red signals stopped by a powerful protective shield, clean futuristic UI motifs without copying any real interface, dramatic camera pushes, premium blue-black lighting, confident secure tone, final hero shot for the ESN Guardian brand.'
  },
  services: {
    title: 'ES Network Services',
    prompt: 'Premium cinematic commercial for ES Network digital services. Fast elegant montage of website development, Discord community systems, Minecraft server development, automation, security and creative production. Modern dark studio look, precise macro shots, cinematic camera movement, glowing interface-inspired shapes, premium business-tech advertising style, polished final frame for an ES Network call-to-action.'
  }
}

function commandDefinition() {
  const command = new SlashCommandBuilder()
    .setName('video')
    .setDescription('ESN Cinematic AI and video studio')

  command.addSubcommand(sub => sub
    .setName('status')
    .setDescription('Check the ESN Cinematic AI worker'))

  command.addSubcommand(sub => sub
    .setName('cinematic')
    .setDescription('Generate a custom ESN cinematic AI clip')
    .addStringOption(option => option.setName('prompt').setDescription('What the cinematic should show').setRequired(true).setMaxLength(1500))
    .addStringOption(option => option.setName('style').setDescription('Visual direction').setRequired(false).addChoices(...STYLE_CHOICES))
    .addStringOption(option => option.setName('format').setDescription('Video format').setRequired(false).addChoices(...FORMAT_CHOICES))
    .addIntegerOption(option => option.setName('seconds').setDescription('Clip length').setRequired(false).setMinValue(4).setMaxValue(30))
    .addStringOption(option => option.setName('quality').setDescription('Generation quality').setRequired(false)
      .addChoices({ name: 'Fast', value: 'fast' }, { name: 'Production', value: 'production' })))

  for (const [name, preset] of Object.entries(PRESETS)) {
    command.addSubcommand(sub => sub
      .setName(name)
      .setDescription('Generate the ' + preset.title + ' cinematic preset')
      .addStringOption(option => option.setName('format').setDescription('Video format').setRequired(false).addChoices(...FORMAT_CHOICES))
      .addIntegerOption(option => option.setName('seconds').setDescription('Clip length').setRequired(false).setMinValue(4).setMaxValue(30))
      .addStringOption(option => option.setName('quality').setDescription('Generation quality').setRequired(false)
        .addChoices({ name: 'Fast', value: 'fast' }, { name: 'Production', value: 'production' })))
  }

  command.addSubcommand(sub => sub
    .setName('animate')
    .setDescription('Animate an image with ESN Cinematic AI')
    .addAttachmentOption(option => option.setName('image').setDescription('PNG/JPG/WebP reference image').setRequired(true))
    .addStringOption(option => option.setName('prompt').setDescription('How the image should move or transform').setRequired(true).setMaxLength(1200))
    .addStringOption(option => option.setName('style').setDescription('Visual direction').setRequired(false).addChoices(...STYLE_CHOICES))
    .addStringOption(option => option.setName('format').setDescription('Video format').setRequired(false).addChoices(...FORMAT_CHOICES))
    .addIntegerOption(option => option.setName('seconds').setDescription('Clip length').setRequired(false).setMinValue(4).setMaxValue(30))
    .addStringOption(option => option.setName('quality').setDescription('Generation quality').setRequired(false)
      .addChoices({ name: 'Fast', value: 'fast' }, { name: 'Production', value: 'production' })))

  command.addSubcommand(sub => sub
    .setName('retake')
    .setDescription('AI-remix uploaded gameplay or CAM footage')
    .addAttachmentOption(option => option.setName('video').setDescription('MP4/MOV/WebM/MKV source footage').setRequired(true))
    .addStringOption(option => option.setName('prompt').setDescription('Describe the cinematic result').setRequired(true).setMaxLength(1200))
    .addIntegerOption(option => option.setName('seconds').setDescription('Seconds from the start to remix').setRequired(false).setMinValue(4).setMaxValue(30)))

  command.addSubcommand(sub => sub
    .setName('product')
    .setDescription('Generate a cinematic ad for an ESN product or exclusive')
    .addStringOption(option => option.setName('name').setDescription('Product name').setRequired(true).setMaxLength(120))
    .addStringOption(option => option.setName('details').setDescription('What should be shown').setRequired(false).setMaxLength(1000))
    .addStringOption(option => option.setName('format').setDescription('Video format').setRequired(false).addChoices(...FORMAT_CHOICES))
    .addIntegerOption(option => option.setName('seconds').setDescription('Clip length').setRequired(false).setMinValue(4).setMaxValue(30)))

  command.addSubcommand(sub => sub
    .setName('free-edit')
    .setDescription('Turn existing footage into a cinematic edit without paid AI generation')
    .addAttachmentOption(option => option.setName('video').setDescription('Your source MP4/MOV/WebM').setRequired(true))
    .addStringOption(option => option.setName('format').setDescription('Output format').setRequired(false).addChoices(...FORMAT_CHOICES))
    .addStringOption(option => option.setName('title').setDescription('Optional title for the finished edit').setRequired(false).setMaxLength(80)))

  command.addSubcommand(sub => sub
    .setName('job')
    .setDescription('Check a cinematic AI job and download it when ready')
    .addStringOption(option => option.setName('id').setDescription('Job ID').setRequired(true).setMaxLength(80)))

  command.addSubcommand(sub => sub
    .setName('cancel')
    .setDescription('Cancel a queued or running cinematic AI job')
    .addStringOption(option => option.setName('id').setDescription('Job ID').setRequired(true).setMaxLength(80)))

  return command
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function videoDimensions(format) {
  if (format === '16:9') return { width: 1280, height: 720 }
  if (format === '1:1') return { width: 720, height: 720 }
  return { width: 720, height: 1280 }
}

function stylePrompt(style) {
  const styles = {
    'esn-cinematic': 'ESN house style: premium dark cinematic lighting, strong contrast, controlled glow, smooth dolly and crane movement, dramatic scale, polished commercial pacing.',
    'dark-epic': 'Dark epic blockbuster mood, volumetric atmosphere, powerful silhouettes, deep shadows, dramatic highlights, slow heroic camera movement mixed with impact cuts.',
    'high-energy': 'High-energy advertising style, rapid but readable cuts, whip transitions, speed ramps, dynamic camera motion, bright impact lighting and exciting momentum.',
    'clean-tech': 'Clean premium technology commercial, dark glass surfaces, precise lighting, restrained motion graphics aesthetic, smooth controlled camera movement and modern polish.',
    'minecraft-trailer': 'Cinematic voxel-world game trailer style, large environmental reveals, smooth flythroughs, dramatic weather, boss-scale action, PvP energy and premium game-trailer lighting.'
  }
  return styles[style] || styles['esn-cinematic']
}

function brandPrompt(config) {
  return 'Brand: ES Network (ESN). Website: ' + config.websiteUrl + '. Discord: ' + config.discordInvite +
    '. Keep text inside generated imagery minimal because final titles are added during editing. Avoid imitating copyrighted studio logos or trademarked title sequences.'
}

class CinematicWorkerClient {
  constructor(config) {
    this.config = config
  }

  headers() {
    const headers = { 'content-type': 'application/json' }
    if (this.config.workerToken) headers.authorization = 'Bearer ' + this.config.workerToken
    return headers
  }

  async health() {
    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/health', {
      headers: this.headers(),
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error('Cinematic worker returned HTTP ' + response.status)
    return response.json()
  }

  async uploadAsset(attachment) {
    if (attachment.size > this.config.maxSourceBytes) throw new Error('Attachment exceeds the configured upload limit.')
    const source = await fetch(attachment.url, { signal: AbortSignal.timeout(30000) })
    if (!source.ok) throw new Error('Could not download the Discord attachment.')
    const bytes = Buffer.from(await source.arrayBuffer())
    if (bytes.length > this.config.maxSourceBytes) throw new Error('Attachment exceeded the configured upload limit.')

    const headers = {}
    if (this.config.workerToken) headers.authorization = 'Bearer ' + this.config.workerToken
    headers['content-type'] = attachment.contentType || 'application/octet-stream'
    headers['x-filename'] = attachment.name || 'asset.bin'
    headers['content-length'] = String(bytes.length)

    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/assets', {
      method: 'POST',
      headers,
      body: bytes,
      signal: AbortSignal.timeout(120000)
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Cinematic worker asset upload failed.')
    return body
  }

  async submit(payload) {
    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/jobs', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Cinematic worker returned HTTP ' + response.status)
    return body
  }

  async job(id) {
    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/jobs/' + encodeURIComponent(id), {
      headers: this.headers(),
      signal: AbortSignal.timeout(8000)
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Cinematic worker returned HTTP ' + response.status)
    return body
  }

  async cancel(id) {
    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/jobs/' + encodeURIComponent(id) + '/cancel', {
      method: 'POST',
      headers: this.headers(),
      body: '{}',
      signal: AbortSignal.timeout(8000)
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Cinematic worker returned HTTP ' + response.status)
    return body
  }

  async download(id, outputPath, maxBytes) {
    const response = await fetch(this.config.workerUrl.replace(/\/$/, '') + '/v1/jobs/' + encodeURIComponent(id) + '/file', {
      headers: this.headers(),
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || 'Could not download cinematic output.')
    }

    const declared = Number(response.headers.get('content-length') || 0)
    if (declared && declared > maxBytes) throw new Error('Finished cinematic is larger than the configured download limit.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new Error('Finished cinematic exceeded the configured download limit.')
    ensureDir(path.dirname(outputPath))
    fs.writeFileSync(outputPath, bytes)
    return outputPath
  }
}

function ffmpegExists() {
  const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  return result.status === 0
}

function escapeDrawtext(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}

function ffmpegHasFilter(name) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
  return result.status === 0 && new RegExp('\\b' + name + '\\b').test(String(result.stdout || '') + String(result.stderr || ''))
}

function cpuVideoDimensions(format) {
  if (format === '16:9') return { width: 960, height: 540 }
  if (format === '1:1') return { width: 640, height: 640 }
  return { width: 540, height: 960 }
}

function shortHeadline(prompt, fallback = 'ES NETWORK') {
  const cleaned = String(prompt || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[^a-z0-9 &+_.!?'/-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return fallback
  const first = cleaned.split(/[.!?]/)[0].trim()
  return (first || cleaned).slice(0, 58).toUpperCase()
}

function cpuPalette(style) {
  const palettes = {
    'dark-epic': { bg: '0x07070b', accent: '0x9b1c31' },
    'high-energy': { bg: '0x0b0710', accent: '0xd13b3b' },
    'clean-tech': { bg: '0x061015', accent: '0x1b8ea6' },
    'minecraft-trailer': { bg: '0x071008', accent: '0x3f8f4c' },
    'esn-cinematic': { bg: '0x05070c', accent: '0x3867d6' }
  }
  return palettes[style] || palettes['esn-cinematic']
}

function cpuCinematic(prompt, format, seconds, style, config, title = 'ES NETWORK') {
  if (!ffmpegExists()) throw new Error('FFmpeg is required for CPU cinematic mode.')

  const duration = Math.max(4, Math.min(Number(seconds) || 8, 30))
  const { width, height } = cpuVideoDimensions(format)
  const palette = cpuPalette(style)
  const headline = shortHeadline(prompt, title)
  const jobId = 'cpu-' + Date.now().toString(36)
  const dir = path.resolve(config.outputDir, jobId)
  const output = path.join(dir, 'ESN-CPU-cinematic.mp4')
  ensureDir(dir)

  const filters = [
    'noise=alls=7:allf=t',
    'eq=contrast=1.12:saturation=1.08:brightness=-0.025',
    'vignette=PI/5',
    'drawbox=x=0:y=ih*0.15:w=iw:h=2:color=' + palette.accent + '@0.55:t=fill',
    'drawbox=x=0:y=ih*0.85:w=iw:h=2:color=' + palette.accent + '@0.45:t=fill',
    'fade=t=in:st=0:d=0.45',
    'fade=t=out:st=' + Math.max(0.1, duration - 0.6).toFixed(2) + ':d=0.6'
  ]

  if (ffmpegHasFilter('drawtext')) {
    const mainSize = Math.max(30, Math.round(width / 14))
    const smallSize = Math.max(20, Math.round(width / 28))
    const finalStart = Math.max(2, duration * 0.72).toFixed(2)
    filters.push(
      "drawtext=text='" + escapeDrawtext(title) + "':fontcolor=white:fontsize=" + mainSize +
      ":x=(w-text_w)/2:y=h*0.17:enable='between(t,0," + (duration * 0.34).toFixed(2) + ")'",
      "drawtext=text='" + escapeDrawtext(headline) + "':fontcolor=white:fontsize=" + smallSize +
      ":x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=18:enable='between(t," +
      (duration * 0.22).toFixed(2) + "," + (duration * 0.76).toFixed(2) + ")'",
      "drawtext=text='ES NETWORK':fontcolor=white:fontsize=" + mainSize +
      ":x=(w-text_w)/2:y=h*0.40:enable='gte(t," + finalStart + ")'",
      "drawtext=text='" + escapeDrawtext(config.websiteUrl) + "':fontcolor=white:fontsize=" + smallSize +
      ":x=(w-text_w)/2:y=h*0.55:enable='gte(t," + finalStart + ")'"
    )
  }

  const result = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=' + palette.bg + ':s=' + width + 'x' + height + ':r=24:d=' + duration,
    '-vf', filters.join(','),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '24',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

  if (result.status !== 0 || !fs.existsSync(output)) {
    throw new Error('CPU cinematic render failed: ' + String(result.stderr || '').slice(-900))
  }

  return { id: jobId, output, backend: 'CPU Cinematic Lite' }
}

async function cpuAnimateImage(attachment, prompt, format, seconds, style, config) {
  if (!ffmpegExists()) throw new Error('FFmpeg is required for CPU image animation.')

  const duration = Math.max(4, Math.min(Number(seconds) || 8, 30))
  const { width, height } = cpuVideoDimensions(format)
  const jobId = 'cpu-image-' + Date.now().toString(36)
  const dir = path.resolve(config.outputDir, jobId)
  ensureDir(dir)

  const ext = path.extname(attachment.name || '').toLowerCase()
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Use a PNG, JPG, JPEG, or WebP image.')

  const input = path.join(dir, 'source' + ext)
  const output = path.join(dir, 'ESN-image-cinematic.mp4')
  await downloadAttachment(attachment, input, config.maxSourceBytes)

  const filters = [
    'scale=' + width + ':' + height + ':force_original_aspect_ratio=increase',
    'crop=' + width + ':' + height,
    "zoompan=z='min(zoom+0.0012,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=" + width + 'x' + height + ':fps=24',
    'eq=contrast=1.08:saturation=1.1:brightness=-0.015',
    'vignette=PI/5',
    'fade=t=in:st=0:d=0.45',
    'fade=t=out:st=' + Math.max(0.1, duration - 0.6).toFixed(2) + ':d=0.6'
  ]

  if (ffmpegHasFilter('drawtext')) {
    filters.push(
      "drawtext=text='" + escapeDrawtext(shortHeadline(prompt, 'ES NETWORK')) + "':fontcolor=white:fontsize=" +
      Math.max(22, Math.round(width / 24)) +
      ":x=(w-text_w)/2:y=h*0.82:box=1:boxcolor=black@0.35:boxborderw=14"
    )
  }

  const result = spawnSync('ffmpeg', [
    '-y', '-loop', '1', '-i', input,
    '-vf', filters.join(','),
    '-t', String(duration),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

  if (result.status !== 0 || !fs.existsSync(output)) {
    throw new Error('CPU image animation failed: ' + String(result.stderr || '').slice(-900))
  }

  return { id: jobId, output, backend: 'CPU Image Cinematic' }
}

async function downloadAttachment(attachment, outputPath, maxBytes) {
  if (attachment.size > maxBytes) throw new Error('Source video is larger than the configured free-edit limit.')
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Could not download the source video.')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > maxBytes) throw new Error('Source video exceeded the configured free-edit limit.')
  fs.writeFileSync(outputPath, bytes)
}

async function cinematicFreeEdit(attachment, format, title, config) {
  if (!ffmpegExists()) throw new Error('FFmpeg is required for free cinematic editing on this host.')

  const jobId = 'free-' + Date.now().toString(36)
  const dir = path.resolve(config.outputDir, jobId)
  ensureDir(dir)

  const ext = path.extname(attachment.name || '').toLowerCase()
  if (!['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) throw new Error('Use an MP4, MOV, WebM, or MKV source video.')

  const input = path.join(dir, 'source' + ext)
  const output = path.join(dir, 'ESN-cinematic.mp4')
  await downloadAttachment(attachment, input, config.maxSourceBytes)

  const { width, height } = videoDimensions(format)
  const filters = [
    'scale=' + width + ':' + height + ':force_original_aspect_ratio=increase',
    'crop=' + width + ':' + height,
    'eq=contrast=1.08:saturation=1.12:brightness=-0.02',
    'vignette=PI/5',
    'fade=t=in:st=0:d=0.4'
  ]

  if (title) {
    filters.push("drawtext=text='" + escapeDrawtext(title) + "':fontcolor=white:fontsize=" +
      Math.max(32, Math.round(width / 16)) +
      ":x=(w-text_w)/2:y=h*0.10:box=1:boxcolor=black@0.45:boxborderw=18")
  }

  const result = spawnSync('ffmpeg', [
    '-y', '-i', input,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    output
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

  if (result.status !== 0 || !fs.existsSync(output)) {
    throw new Error('FFmpeg cinematic edit failed: ' + String(result.stderr || '').slice(-700))
  }

  return { id: jobId, output }
}

function createVideoManager(config) {
  const worker = new CinematicWorkerClient(config)

  async function submitPreset(interaction, presetName, customPrompt) {
    const format = interaction.options.getString('format') || '9:16'
    const seconds = interaction.options.getInteger('seconds') || config.defaultSeconds
    const quality = interaction.options.getString('quality') || config.defaultQuality
    const style = interaction.options.getString('style') || 'esn-cinematic'
    const presetTitle = PRESETS[presetName]?.title || (presetName === 'product' ? 'ESN PRODUCT' : 'ES NETWORK')

    const prompt = [
      customPrompt || PRESETS[presetName]?.prompt || '',
      stylePrompt(style),
      brandPrompt(config),
      'Create one coherent cinematic clip. No watermarks.'
    ].filter(Boolean).join(' ')

    await interaction.deferReply({ ephemeral: true })

    try {
      const job = await worker.submit({
        prompt,
        preset: presetName || 'custom',
        format,
        seconds,
        quality,
        requested_by: interaction.user.id
      })

      await interaction.editReply(
        '**ESN Cinematic AI job submitted.**\n' +
        'Job: ' + job.id + '\n' +
        'Format: **' + format + '**\n' +
        'Length: **' + seconds + ' sec**\n' +
        'Quality: **' + quality + '**\n\n' +
        'Use /video job with ID ' + job.id + ' to check it.'
      )
      return
    } catch (workerError) {
      const result = cpuCinematic(customPrompt || prompt, format, seconds, style, config, presetTitle)
      const size = fs.statSync(result.output).size
      if (size <= config.discordAttachmentBytes) {
        await interaction.editReply({
          content:
            '**CPU cinematic complete.**\n' +
            'The GPU worker was unavailable, so ESN automatically rendered this on the current host with the CPU cinematic engine.\n' +
            'Backend: **' + result.backend + '**',
          files: [new AttachmentBuilder(result.output)]
        })
      } else {
        await interaction.editReply(
          'CPU cinematic completed at ' + result.output + ', but it is too large to attach to Discord.'
        )
      }
    }
  }

  async function handle(interaction) {
    const sub = interaction.options.getSubcommand()

    if (sub === 'status') {
      await interaction.deferReply({ ephemeral: true })
      try {
        const status = await worker.health()
        await interaction.editReply(
          '**ESN Cinematic AI**\n' +
          'GPU worker: **ONLINE**\n' +
          'Backend: **' + (status.backend || 'LTX') + '**\n' +
          'GPU: **' + (status.gpu || 'unknown') + '**\n' +
          'Queue: **' + (status.queued ?? 0) + '**\n' +
          'Running: **' + (status.running ?? 0) + '**\n' +
          'ESN LoRA: **' + (status.esn_lora ? 'LOADED' : 'not configured') + '**\n' +
          'CPU fallback: **' + (ffmpegExists() ? 'READY' : 'FFmpeg missing') + '**'
        )
      } catch {
        await interaction.editReply(
          '**ESN Cinematic Studio**\n' +
          'GPU worker: **OFFLINE / NOT CONNECTED**\n' +
          'CPU cinematic fallback: **' + (ffmpegExists() ? 'READY' : 'FFmpeg missing') + '**\n' +
          'Text/preset/product cinematics automatically use the current host when the GPU worker is unavailable.'
        )
      }
      return
    }

    if (sub === 'cinematic') {
      const userPrompt = interaction.options.getString('prompt', true)
      await submitPreset(interaction, 'custom', userPrompt)
      return
    }

    if (PRESETS[sub]) {
      await submitPreset(interaction, sub, PRESETS[sub].prompt)
      return
    }

    if (sub === 'animate') {
      const attachment = interaction.options.getAttachment('image', true)
      const userPrompt = interaction.options.getString('prompt', true)
      const format = interaction.options.getString('format') || '9:16'
      const seconds = interaction.options.getInteger('seconds') || config.defaultSeconds
      const quality = interaction.options.getString('quality') || config.defaultQuality
      const style = interaction.options.getString('style') || 'esn-cinematic'

      await interaction.deferReply({ ephemeral: true })
      const prompt = [
        userPrompt,
        stylePrompt(style),
        brandPrompt(config),
        'Preserve the recognizable subject and composition from the reference image while creating convincing cinematic motion.'
      ].join(' ')

      try {
        const asset = await worker.uploadAsset(attachment)
        const job = await worker.submit({
          prompt,
          preset: 'image-animation',
          mode: 'image',
          asset_id: asset.id,
          format,
          seconds,
          quality,
          requested_by: interaction.user.id
        })
        await interaction.editReply('**Image-to-video submitted.**\nJob: ' + job.id + '\nUse /video job with ID ' + job.id + ' to check it.')
      } catch {
        const result = await cpuAnimateImage(attachment, userPrompt, format, seconds, style, config)
        const size = fs.statSync(result.output).size
        if (size <= config.discordAttachmentBytes) {
          await interaction.editReply({
            content: '**CPU image cinematic complete.**\nGPU unavailable, so ESN animated the image locally.',
            files: [new AttachmentBuilder(result.output)]
          })
        } else {
          await interaction.editReply('CPU image cinematic completed at ' + result.output + ', but it is too large to attach.')
        }
      }
      return
    }

    if (sub === 'retake') {
      const attachment = interaction.options.getAttachment('video', true)
      const userPrompt = interaction.options.getString('prompt', true)
      const seconds = interaction.options.getInteger('seconds') || Math.min(12, config.defaultSeconds)

      await interaction.deferReply({ ephemeral: true })
      const prompt = [
        userPrompt,
        stylePrompt('esn-cinematic'),
        brandPrompt(config),
        'Use the uploaded gameplay or CAM footage as motion/context and remake the selected segment with polished cinematic direction.'
      ].join(' ')

      try {
        const asset = await worker.uploadAsset(attachment)
        const job = await worker.submit({
          prompt,
          preset: 'cam-retake',
          mode: 'retake',
          asset_id: asset.id,
          format: '16:9',
          seconds,
          quality: 'fast',
          requested_by: interaction.user.id
        })
        await interaction.editReply('**AI CAM/gameplay retake submitted.**\nJob: ' + job.id + '\nUse /video job with ID ' + job.id + ' to check it.')
      } catch {
        const result = await cinematicFreeEdit(attachment, '16:9', shortHeadline(userPrompt, 'ESN CINEMATIC'), config)
        const size = fs.statSync(result.output).size
        if (size <= config.discordAttachmentBytes) {
          await interaction.editReply({
            content: '**CPU CAM/gameplay cinematic complete.**\nGPU unavailable, so ESN processed the footage locally.',
            files: [new AttachmentBuilder(result.output)]
          })
        } else {
          await interaction.editReply('CPU CAM/gameplay cinematic completed at ' + result.output + ', but it is too large to attach.')
        }
      }
      return
    }

    if (sub === 'product') {
      const name = interaction.options.getString('name', true)
      const details = interaction.options.getString('details') || ''
      const prompt =
        'Premium cinematic product reveal for an ES Network product called "' + name + '". ' +
        details + ' Hero lighting, detailed close-ups, dramatic reveal, powerful camera motion, clean final hero frame for branding.'
      await submitPreset(interaction, 'product', prompt)
      return
    }

    if (sub === 'free-edit') {
      const attachment = interaction.options.getAttachment('video', true)
      const format = interaction.options.getString('format') || '9:16'
      const title = interaction.options.getString('title') || 'ES Network'
      await interaction.deferReply({ ephemeral: true })
      const result = await cinematicFreeEdit(attachment, format, title, config)
      const size = fs.statSync(result.output).size

      if (size <= config.discordAttachmentBytes) {
        await interaction.followUp({
          content: '**Free ESN cinematic edit complete.**',
          files: [new AttachmentBuilder(result.output)]
        })
        await interaction.editReply('Finished without using AI-generation credits.')
      } else {
        await interaction.editReply(
          'Free cinematic edit finished, but the MP4 is too large for the configured Discord attachment limit. Saved as ' +
          result.output + '.'
        )
      }
      return
    }

    if (sub === 'job') {
      const id = interaction.options.getString('id', true)
      await interaction.deferReply({ ephemeral: true })
      const job = await worker.job(id)

      let responseText =
        '**ESN Cinematic AI Job** ' + id + '\n' +
        'Status: **' + String(job.status || 'unknown').toUpperCase() + '**'

      if (job.progress !== undefined) responseText += '\nProgress: **' + Math.round(Number(job.progress) * 100) + '%**'
      if (job.error) responseText += '\nError: ' + String(job.error).slice(0, 1200)

      if (job.status === 'complete') {
        const output = path.resolve(config.outputDir, 'ai-' + id + '.mp4')
        try {
          if (!fs.existsSync(output)) await worker.download(id, output, config.maxSourceBytes)
          const size = fs.statSync(output).size
          if (size <= config.discordAttachmentBytes) {
            await interaction.editReply({
              content: responseText + '\n**Finished cinematic attached.**',
              files: [new AttachmentBuilder(output)]
            })
          } else {
            await interaction.editReply(responseText + '\nFinished MP4 saved locally at ' + output + ', but it is too large to attach to Discord.')
          }
        } catch (error) {
          await interaction.editReply(responseText + '\nOutput is ready, but automatic download failed: ' + error.message)
        }
        return
      }

      await interaction.editReply(responseText)
      return
    }

    if (sub === 'cancel') {
      const id = interaction.options.getString('id', true)
      await interaction.deferReply({ ephemeral: true })
      const job = await worker.cancel(id)
      await interaction.editReply('Cinematic job ' + job.id + ' is now **' + String(job.status).toUpperCase() + '**.')
    }
  }

  return { commandDefinition, handle }
}

module.exports = { createVideoManager }
