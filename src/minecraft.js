'use strict'

const { EventEmitter } = require('node:events')
const dns = require('node:dns')
const net = require('node:net')
const dgram = require('node:dgram')
const bedrock = require('bedrock-protocol')

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'


async function resolveHost(host) {
  if (net.isIP(host)) return host

  const systemLookup = () => new Promise((resolve, reject) => {
    dns.lookup(host, { family: 4 }, (error, address) => {
      if (error) reject(error)
      else resolve(address)
    })
  })

  const publicLookup = () => new Promise((resolve, reject) => {
    const resolver = new dns.Resolver()
    resolver.setServers(['1.1.1.1', '8.8.8.8'])
    resolver.resolve4(host, (error, addresses) => {
      if (error) reject(error)
      else if (!addresses?.length) reject(new Error('No IPv4 address returned'))
      else resolve(addresses[0])
    })
  })

  let lastError
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await systemLookup()
    } catch (error) {
      lastError = error
    }

    try {
      return await publicLookup()
    } catch (error) {
      lastError = error
    }

    await wait(1500)
  }

  const error = new Error(`Could not resolve ${host} after multiple attempts: ${lastError?.code || lastError?.message || 'DNS failure'}`)
  error.code = lastError?.code || 'DNS_LOOKUP_FAILED'
  throw error
}

function reasonText(reason) {
  if (reason == null) return 'unknown'
  if (typeof reason === 'string') return reason
  try { return JSON.stringify(reason) } catch { return String(reason) }
}

function sameRuntimeId(a, b) {
  if (a == null || b == null) return false
  try { return BigInt(a) === BigInt(b) } catch { return String(a) === String(b) }
}

class MinecraftCamera extends EventEmitter {
  constructor(config, viewerConfig) {
    super()
    this.config = config
    this.viewerConfig = viewerConfig
    this.client = null
    this.state = 'offline'
    this.lastError = null
    this.reconnectTimer = null
    this.intentionalStop = false
    this.username = null
    this.version = null
    this.position = null
    this.yaw = null
    this.pitch = null
    this.runtimeEntityId = null
    this.currentTick = 0n
    this.lastMsaCallback = null
  }

  async testConnection() {
    const resolvedHost = await resolveHost(this.config.host)
    const port = this.config.port || 19132
    const started = Date.now()

    // Bedrock/RakNet unconnected ping. This is implemented directly with UDP so
    // Raven does not need the optional native raknet bindings just to test reachability.
    const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex')
    const packet = Buffer.alloc(1 + 8 + 16 + 8)
    packet[0] = 0x01
    packet.writeBigInt64BE(BigInt(Date.now()), 1)
    MAGIC.copy(packet, 9)
    packet.writeBigInt64BE(BigInt.asIntN(64, BigInt(Date.now()) * 1000n + BigInt(process.pid)), 25)

    return await new Promise(resolve => {
      const socket = dgram.createSocket('udp4')
      let finished = false

      const finish = result => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        try { socket.close() } catch {}
        resolve(result)
      }

      const timer = setTimeout(() => {
        finish({
          ok: false,
          host: this.config.host,
          resolvedHost,
          port,
          latencyMs: Date.now() - started,
          error: `UDP/RakNet ping timed out after 5000 ms. Raven could not reach ${this.config.host}:${port}/UDP.`
        })
      }, 5000)

      socket.once('error', error => {
        finish({
          ok: false,
          host: this.config.host,
          resolvedHost,
          port,
          latencyMs: Date.now() - started,
          error: error?.message || String(error)
        })
      })

      socket.once('message', message => {
        const text = message.toString('utf8')
        const motdIndex = text.indexOf('MCPE;')
        let motd = 'Bedrock server responded'
        let version = 'unknown'
        let players = 'unknown'

        if (motdIndex >= 0) {
          const fields = text.slice(motdIndex).replace(/\0+$/g, '').split(';')
          motd = fields[1] || motd
          version = fields[3] || 'unknown'
          if (fields[4] != null && fields[5] != null) players = `${fields[4]}/${fields[5]}`
        }

        finish({
          ok: true,
          host: this.config.host,
          resolvedHost,
          port,
          latencyMs: Date.now() - started,
          motd,
          version,
          players
        })
      })

      socket.send(packet, port, resolvedHost, error => {
        if (error) {
          finish({
            ok: false,
            host: this.config.host,
            resolvedHost,
            port,
            latencyMs: Date.now() - started,
            error: error.message
          })
        }
      })
    })
  }

  async start(onMsaCode) {
    if (!this.config.username) throw new Error('MC_USERNAME is not set on Raven.')
    if (this.client && ['connecting', 'joining', 'online'].includes(this.state)) return

    this.intentionalStop = false
    this.state = 'connecting'
    this.lastError = null
    if (typeof onMsaCode === 'function') this.lastMsaCallback = onMsaCode

    let resolvedHost
    try {
      resolvedHost = await resolveHost(this.config.host)
    } catch (error) {
      this.state = 'offline'
      this.lastError = error.message
      this.emit('warning', this.lastError)
      throw error
    }

    const options = {
      host: resolvedHost,
      port: this.config.port || 19132,
      username: this.config.username,
      profilesFolder: this.config.profilesFolder,
      offline: false,
      followPort: false,
      raknetBackend: 'jsp-raknet',
      useRaknetWorkers: true,
      connectTimeout: 20000,
      pingTimeout: 5000,
      conLog: null,
      onMsaCode: data => {
        this.emit('msaCode', data)
        const callback = typeof onMsaCode === 'function' ? onMsaCode : this.lastMsaCallback
        if (typeof callback === 'function') Promise.resolve(callback(data)).catch(() => {})
      }
    }

    if (this.config.version) options.version = this.config.version

    let client
    try {
      client = bedrock.createClient(options)
    } catch (error) {
      this.state = 'offline'
      this.lastError = error.message
      throw error
    }

    this.client = client

    client.on('status', status => {
      if (this.client !== client) return
      if (this.state !== 'online') this.state = 'connecting'
      this.emit('status', reasonText(status))
    })

    client.once('join', () => {
      if (this.client !== client) return
      this.state = 'joining'
      this.username = client.username || client.profile?.name || this.config.username
      this.version = client.version || this.config.version || null
      this.emit('joined')
    })

    client.on('start_game', packet => {
      if (this.client !== client) return
      this.runtimeEntityId = packet.runtime_entity_id ?? this.runtimeEntityId
      this.currentTick = packet.current_tick ?? this.currentTick
      if (packet.player_position) {
        this.position = {
          x: Number(packet.player_position.x),
          y: Number(packet.player_position.y),
          z: Number(packet.player_position.z)
        }
      }
      if (packet.rotation) {
        this.pitch = Number(packet.rotation.x ?? packet.rotation.pitch ?? this.pitch ?? 0)
        this.yaw = Number(packet.rotation.z ?? packet.rotation.yaw ?? this.yaw ?? 0)
      }
    })

    client.on('move_player', packet => {
      if (this.client !== client) return
      if (!sameRuntimeId(packet.runtime_id, this.runtimeEntityId)) return
      if (packet.position) {
        this.position = {
          x: Number(packet.position.x),
          y: Number(packet.position.y),
          z: Number(packet.position.z)
        }
      }
      if (Number.isFinite(packet.yaw)) this.yaw = Number(packet.yaw)
      if (Number.isFinite(packet.pitch)) this.pitch = Number(packet.pitch)
      if (packet.tick != null) this.currentTick = packet.tick
    })

    client.on('correct_player_move_prediction', packet => {
      if (this.client !== client) return
      if (packet.position) {
        this.position = {
          x: Number(packet.position.x),
          y: Number(packet.position.y),
          z: Number(packet.position.z)
        }
      }
      if (packet.tick != null) this.currentTick = packet.tick
    })

    client.once('spawn', () => {
      if (this.client !== client) return
      this.state = 'online'
      this.username = client.username || client.profile?.name || this.config.username
      this.version = client.version || this.config.version || null
      this.emit('online')

      if (this.viewerConfig.enabled) {
        this.emit('warning', 'VIEWER_ENABLED is on, but the old Prismarine Viewer is Java/Mineflayer-only. Bedrock connection is still active.')
      }
    })

    client.on('kick', reason => {
      if (this.client !== client) return
      this.lastError = `Kicked: ${reasonText(reason)}`
      this.emit('warning', this.lastError)
    })

    client.on('error', error => {
      if (this.client !== client) return
      this.lastError = error?.message || reasonText(error)
      if (/connect timed out/i.test(this.lastError)) {
        this.lastError += ` (Bedrock UDP could not reach ${this.config.host}:${this.config.port || 19132})`
      }
      this.emit('warning', this.lastError)
    })

    const closed = reason => {
      if (this.client !== client) return
      this.client = null
      this.state = 'offline'
      this.emit('offline', reasonText(reason))
      if (!this.intentionalStop) this.scheduleReconnect()
    }

    client.once('close', closed)
    client.once('disconnect', closed)
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

    const client = this.client
    this.client = null

    if (client) {
      try {
        if (typeof client.disconnect === 'function') client.disconnect('ESN CAM stopped')
        else if (typeof client.close === 'function') client.close()
      } catch {}
    }

    this.state = 'offline'
  }

  requireOnline() {
    if (!this.client || this.state !== 'online') {
      throw new Error('ESN CAM is not online in Minecraft Bedrock yet.')
    }
    return this.client
  }

  getStatus() {
    return {
      edition: 'Bedrock',
      state: this.state,
      username: this.username,
      version: this.version,
      health: null,
      food: null,
      position: this.position
        ? {
            x: Number(this.position.x.toFixed(2)),
            y: Number(this.position.y.toFixed(2)),
            z: Number(this.position.z.toFixed(2))
          }
        : null,
      yaw: Number.isFinite(this.yaw) ? Number(this.yaw.toFixed(4)) : null,
      pitch: Number.isFinite(this.pitch) ? Number(this.pitch.toFixed(4)) : null,
      lastError: this.lastError
    }
  }

  getCurrentShot(name, durationSeconds = 5) {
    this.requireOnline()
    if (!this.position) throw new Error('ESN CAM has not received its Bedrock position yet.')

    return {
      name,
      position: {
        x: Number(this.position.x.toFixed(2)),
        y: Number(this.position.y.toFixed(2)),
        z: Number(this.position.z.toFixed(2))
      },
      yaw: Number.isFinite(this.yaw) ? Number(this.yaw.toFixed(5)) : 0,
      pitch: Number.isFinite(this.pitch) ? Number(this.pitch.toFixed(5)) : 0,
      durationSeconds,
      settleSeconds: 1
    }
  }

  sendCommand(command) {
    const client = this.requireOnline()
    client.queue('command_request', {
      command,
      origin: {
        type: 0,
        uuid: client.profile?.uuid || client.uuid || ZERO_UUID,
        request_id: `esncam-${Date.now()}`
      },
      internal: false,
      interval: 0
    })
  }

  async goTo(position, radius = 1) {
    this.requireOnline()
    const target = {
      x: Number(position.x),
      y: Number(position.y),
      z: Number(position.z)
    }

    this.sendCommand(`/tp @s ${target.x} ${target.y} ${target.z}`)
    await wait(1200)

    if (!this.position) return
    const dx = this.position.x - target.x
    const dy = this.position.y - target.y
    const dz = this.position.z - target.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (distance > Math.max(2, radius + 1)) {
      throw new Error('Bedrock camera teleport was not accepted. Give the ESN CAM Bedrock account permission to use /tp (or OP it) on ESN SMP.')
    }
  }

  async lookAt(position) {
    this.requireOnline()
    if (!this.position) throw new Error('ESN CAM has not received its Bedrock position yet.')

    const dx = Number(position.x) - this.position.x
    const dy = Number(position.y) - this.position.y
    const dz = Number(position.z) - this.position.z
    const horizontal = Math.sqrt(dx * dx + dz * dz)

    const yaw = Math.atan2(-dx, dz) * (180 / Math.PI)
    const pitch = -Math.atan2(dy, horizontal) * (180 / Math.PI)

    this.sendCommand(`/tp @s ~ ~ ~ ${yaw.toFixed(4)} ${pitch.toFixed(4)}`)
    this.yaw = yaw
    this.pitch = pitch
    await wait(250)
  }

  async faceShot(shot) {
    this.requireOnline()
    if (!Number.isFinite(shot.yaw) || !Number.isFinite(shot.pitch)) {
      if (shot.lookAt) return this.lookAt(shot.lookAt)
      return
    }

    this.sendCommand(`/tp @s ~ ~ ~ ${Number(shot.yaw).toFixed(4)} ${Number(shot.pitch).toFixed(4)}`)
    this.yaw = Number(shot.yaw)
    this.pitch = Number(shot.pitch)
    await wait(250)
  }
}

module.exports = { MinecraftCamera }
