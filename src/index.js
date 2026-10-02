'use strict'

const config = require('./config')
const { MinecraftCamera } = require('./minecraft')
const { Recorder } = require('./recorder')
const { createDiscordController } = require('./discord')

async function main() {
  const camera = new MinecraftCamera(config.minecraft, config.viewer)
  const recorder = new Recorder(camera, config.recording, config)
  const discord = await createDiscordController(config.discord, camera, recorder, config)

  const shutdown = async signal => {
    console.log(`Received ${signal}; shutting down ESN CAM.`)
    try { await camera.stop() } catch {}
    try { discord.destroy() } catch {}
    process.exit(0)
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch(error => {
  console.error('[FATAL]', error)
  process.exit(1)
})
