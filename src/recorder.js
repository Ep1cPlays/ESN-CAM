'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { getPreset } = require('./scenes')
const { runDiagnostics } = require('./diagnostics')

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function safeName(value) {
  return String(value).replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'shot'
}

function escapeDrawtext(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}

function ffmpegHasDrawtext() {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
  return result.status === 0 && /\bdrawtext\b/.test(`${result.stdout || ''}${result.stderr || ''}`)
}

function waitForFile(filePath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (fs.existsSync(filePath)) {
        try {
          if (fs.statSync(filePath).size > 0) {
            clearInterval(timer)
            resolve()
            return
          }
        } catch {}
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`Timed out waiting for renderer output: ${path.basename(filePath)}`))
      }
    }, 500)
  })
}

class Recorder {
  constructor(camera, config, fullConfig) {
    this.camera = camera
    this.config = config
    this.fullConfig = fullConfig
    this.active = false
    this.lastJob = null
  }

  getStatus() {
    return { active: this.active, lastJob: this.lastJob }
  }

  rendererDiagnostics() {
    return runDiagnostics(this.fullConfig)
  }

  assertRendererReady() {
    const diagnostics = this.rendererDiagnostics()
    if (!diagnostics.rendererReady) {
      const missing = []
      if (!diagnostics.nodeCanvasWebgl) missing.push('node-canvas-webgl')
      if (!diagnostics.ffmpeg) missing.push('ffmpeg')
      if (!diagnostics.display && !diagnostics.xvfbRun) missing.push('Xvfb/DISPLAY')
      throw new Error(`Raven recording renderer is not ready. Missing: ${missing.join(', ') || 'unknown dependency'}. Use /cam diagnostics.`)
    }
  }

  async recordPreset(name) {
    if (this.active) throw new Error('A recording job is already running.')
    this.assertRendererReady()

    require('node-canvas-webgl')
    const headless = require('prismarine-viewer').headless
    const bot = this.camera.requireOnline()
    const preset = getPreset(name)

    if (preset.shots.length === 0) {
      throw new Error(`Preset "${name}" has no shots. Stand at a camera position and use /cam shot-add first.`)
    }

    const jobId = `${safeName(name)}-${new Date().toISOString().replace(/[:.]/g, '-')}`
    const outputDir = path.join(process.cwd(), this.config.directory, jobId)
    fs.mkdirSync(outputDir, { recursive: true })

    this.active = true
    this.lastJob = {
      id: jobId,
      preset: name,
      state: 'recording',
      outputDir,
      startedAt: new Date().toISOString()
    }

    const clips = []

    try {
      for (let index = 0; index < preset.shots.length; index++) {
        const shot = preset.shots[index]
        if (!shot.position) throw new Error(`Shot ${index + 1} is missing a position.`)

        await this.camera.goTo(shot.position, shot.radius || 1)
        await this.camera.faceShot(shot)
        await wait(Math.max(0, shot.settleSeconds || 1) * 1000)

        const seconds = Math.max(1, Number(shot.durationSeconds) || 5)
        const frames = Math.max(1, Math.round(seconds * this.config.fps))
        const output = path.join(
          outputDir,
          `${String(index + 1).padStart(2, '0')}-${safeName(shot.name)}.mp4`
        )

        headless(bot, {
          output,
          frames,
          width: this.config.width,
          height: this.config.height,
          viewDistance: this.config.viewDistance,
          logFFMPEG: false
        })

        await wait(seconds * 1000)
        await waitForFile(output, Math.max(20000, seconds * 4000))
        clips.push(output)
      }

      const masterOutput = path.join(outputDir, `${safeName(name)}-master.mp4`)
      if (clips.length === 1) {
        fs.copyFileSync(clips[0], masterOutput)
      } else {
        const concatFile = path.join(outputDir, 'clips.txt')
        fs.writeFileSync(
          concatFile,
          `${clips.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')}\n`
        )
        const result = spawnSync('ffmpeg', [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFile,
          '-c', 'copy',
          masterOutput
        ], { encoding: 'utf8' })

        if (result.status !== 0) {
          throw new Error(`FFmpeg could not join the clips: ${(result.stderr || '').slice(-500)}`)
        }
      }

      const finalOutput = path.join(outputDir, `${safeName(name)}-ESN-SMP.mp4`)
      let overlayApplied = false
      if (this.config.overlayEnabled && ffmpegHasDrawtext()) {
        const title = escapeDrawtext(this.config.title)
        const subtitle = escapeDrawtext(this.config.subtitle)
        const filter = [
          `drawtext=text='${title}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=110:box=1:boxcolor=black@0.55:boxborderw=22`,
          `drawtext=text='${subtitle}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=h-190:box=1:boxcolor=black@0.55:boxborderw=18`
        ].join(',')
        const overlay = spawnSync('ffmpeg', [
          '-y', '-i', masterOutput, '-vf', filter,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
          '-movflags', '+faststart', finalOutput
        ], { encoding: 'utf8' })
        overlayApplied = overlay.status === 0 && fs.existsSync(finalOutput)
      }
      if (!overlayApplied) fs.copyFileSync(masterOutput, finalOutput)

      this.lastJob = {
        ...this.lastJob,
        state: 'complete',
        finalOutput,
        masterOutput,
        overlayApplied,
        completedAt: new Date().toISOString()
      }
      return this.lastJob
    } catch (error) {
      this.lastJob = {
        ...this.lastJob,
        state: 'failed',
        error: error.message,
        failedAt: new Date().toISOString()
      }
      throw error
    } finally {
      this.active = false
    }
  }
}

module.exports = { Recorder }
