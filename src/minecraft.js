'use strict'

const { EventEmitter } = require('node:events')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

class MinecraftCamera extends EventEmitter {
  constructor(config, viewerConfig) {
    super()
    this.config = config
    this.viewerConfig = viewerConfig
    this.bot = null
    this.state = 'offline'
    this.lastError = null
    this.reconnectTimer = null
    this.intentionalStop = false
    this.viewerStarted = false
  }

  async start(onMsaCode) {
    if (!this.config.username) throw new Error('MC_USERNAME is not set on Raven.')
    if (this.bot && ['connecting', 'online'].includes(this.state)) return

    this.intentionalStop = false
    this.state = 'connecting'
    this.lastError = null

    const options = {
      host: this.config.host,
      username: this.config.username,
      auth: this.config.auth,
      profilesFolder: this.config.profilesFolder,
      onMsaCode: data => {
        this.emit('msaCode', data)
        if (typeof onMsaCode === 'function') onMsaCode(data)
      }
    }
    if (this.config.port) options.port = this.config.port
    if (this.config.version) options.version = this.config.version

    const bot = mineflayer.createBot(options)
    this.bot = bot
    bot.loadPlugin(pathfinder)

    bot.once('spawn', async () => {
      if (this.bot !== bot) return
      this.state = 'online'
      this.emit('online')

      if (this.viewerConfig.enabled && !this.viewerStarted) {
        try {
          const viewer = require('prismarine-viewer').mineflayer
          viewer(bot, {
            port: this.viewerConfig.port,
            firstPerson: true,
            viewDistance: 8
          })
          this.viewerStarted = true
          this.emit('viewer', this.viewerConfig.port)
        } catch (error) {
          this.lastError = `Viewer failed: ${error.message}`
          this.emit('warning', this.lastError)
        }
      }
    })

    bot.on('kicked', reason => {
      this.lastError = `Kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`
      this.emit('warning', this.lastError)
    })

    bot.on('error', error => {
      this.lastError = error.message
      this.emit('warning', error.message)
    })

    bot.on('end', reason => {
      if (this.bot !== bot) return
      this.bot = null
      this.viewerStarted = false
      this.state = 'offline'
      this.emit('offline', reason)
      if (!this.intentionalStop) this.scheduleReconnect()
    })
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalStop) return
    this.state = 'reconnecting'
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.start()
      } catch (error) {
        this.lastError = error.message
        this.emit('warning', error.message)
        this.scheduleReconnect()
      }
    }, Math.max(1, this.config.reconnectSeconds) * 1000)
  }

  async stop() {
    this.intentionalStop = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const bot = this.bot
    this.bot = null
    this.viewerStarted = false
    if (bot) {
      try { bot.quit('ESN CAM stopped') } catch {}
    }
    this.state = 'offline'
  }

  requireOnline() {
    if (!this.bot || this.state !== 'online' || !this.bot.entity) {
      throw new Error('ESN CAM is not online in Minecraft yet.')
    }
    return this.bot
  }

  getStatus() {
    const bot = this.bot
    return {
      state: this.state,
      username: bot?.username || null,
      version: bot?.version || null,
      health: bot?.health ?? null,
      food: bot?.food ?? null,
      position: bot?.entity?.position
        ? {
            x: Number(bot.entity.position.x.toFixed(2)),
            y: Number(bot.entity.position.y.toFixed(2)),
            z: Number(bot.entity.position.z.toFixed(2))
          }
        : null,
      yaw: bot?.entity ? Number(bot.entity.yaw.toFixed(4)) : null,
      pitch: bot?.entity ? Number(bot.entity.pitch.toFixed(4)) : null,
      lastError: this.lastError
    }
  }

  getCurrentShot(name, durationSeconds = 5) {
    const bot = this.requireOnline()
    return {
      name,
      position: {
        x: Number(bot.entity.position.x.toFixed(2)),
        y: Number(bot.entity.position.y.toFixed(2)),
        z: Number(bot.entity.position.z.toFixed(2))
      },
      yaw: Number(bot.entity.yaw.toFixed(5)),
      pitch: Number(bot.entity.pitch.toFixed(5)),
      durationSeconds,
      settleSeconds: 1
    }
  }

  async goTo(position, radius = 1) {
    const bot = this.requireOnline()
    const movements = new Movements(bot)
    movements.canDig = false
    movements.allow1by1towers = false
    bot.pathfinder.setMovements(movements)
    await bot.pathfinder.goto(new goals.GoalNear(
      Math.round(position.x),
      Math.round(position.y),
      Math.round(position.z),
      Math.max(1, Math.round(radius))
    ))
  }

  async faceShot(shot) {
    const bot = this.requireOnline()
    if (Number.isFinite(shot.yaw) && Number.isFinite(shot.pitch)) {
      await bot.look(shot.yaw, shot.pitch, true)
      return
    }
    if (shot.lookAt) {
      const Vec3 = require('vec3')
      await bot.lookAt(new Vec3(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z), true)
    }
  }
}

module.exports = { MinecraftCamera }
