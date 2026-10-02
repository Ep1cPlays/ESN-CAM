'use strict'

const fs = require('node:fs')
const path = require('node:path')

const sceneFile = path.join(__dirname, '..', 'config', 'scenes.json')

function loadSceneConfig() {
  if (!fs.existsSync(sceneFile)) {
    throw new Error(`Scene configuration does not exist: ${sceneFile}`)
  }
  const parsed = JSON.parse(fs.readFileSync(sceneFile, 'utf8'))
  if (!parsed.presets || typeof parsed.presets !== 'object') {
    throw new Error('config/scenes.json must contain a presets object')
  }
  return parsed
}

function saveSceneConfig(config) {
  fs.mkdirSync(path.dirname(sceneFile), { recursive: true })
  fs.writeFileSync(sceneFile, `${JSON.stringify(config, null, 2)}\n`)
}

function listPresets() {
  const config = loadSceneConfig()
  return Object.entries(config.presets).map(([name, value]) => ({
    name,
    description: value.description || '',
    shots: Array.isArray(value.shots) ? value.shots.length : 0
  }))
}

function getPreset(name) {
  const config = loadSceneConfig()
  const preset = config.presets[name]
  if (!preset) throw new Error(`Unknown preset: ${name}`)
  if (!Array.isArray(preset.shots)) preset.shots = []
  return preset
}

function addShot(presetName, shot) {
  const config = loadSceneConfig()
  if (!config.presets[presetName]) {
    config.presets[presetName] = {
      description: `ESN CAM preset: ${presetName}`,
      shots: []
    }
  }
  if (!Array.isArray(config.presets[presetName].shots)) config.presets[presetName].shots = []
  config.presets[presetName].shots.push(shot)
  saveSceneConfig(config)
  return config.presets[presetName].shots.length
}

function clearPreset(presetName) {
  const config = loadSceneConfig()
  if (!config.presets[presetName]) throw new Error(`Unknown preset: ${presetName}`)
  config.presets[presetName].shots = []
  saveSceneConfig(config)
}

module.exports = {
  addShot,
  clearPreset,
  getPreset,
  listPresets,
  loadSceneConfig
}
