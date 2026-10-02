'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js')

const SERVICE_CHOICES = [
  { name: 'Minecraft Development', value: 'minecraft' },
  { name: 'Discord Setup', value: 'discord' },
  { name: 'ESN Guardian', value: 'guardian' },
  { name: 'Website / Builder', value: 'website' },
  { name: 'ESN SMP', value: 'smp' },
  { name: 'General ESN', value: 'general' }
]

const PLATFORM_CHOICES = [
  { name: 'Discord', value: 'discord' },
  { name: 'TikTok', value: 'tiktok' },
  { name: 'YouTube Shorts', value: 'youtube-shorts' },
  { name: 'Instagram Reels', value: 'instagram-reels' },
  { name: 'Minecraft Server List', value: 'server-list' }
]

const PRESET_CHOICES = [
  { name: 'Full Advertisement', value: 'full-ad' },
  { name: 'Spawn', value: 'spawn' },
  { name: 'PvP', value: 'pvp' },
  { name: 'Boss', value: 'boss' },
  { name: 'Exclusive Items', value: 'exclusive-items' }
]

function addServiceOption(sub) {
  return sub.addStringOption(option => option
    .setName('service')
    .setDescription('What ESN offer this is promoting')
    .setRequired(true)
    .addChoices(...SERVICE_CHOICES))
}

function commandDefinition() {
  return new SlashCommandBuilder()
    .setName('growth')
    .setDescription('ESN Growth Center: campaigns, leads, referrals and content')
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Show ESN growth totals and active campaigns'))
    .addSubcommand(sub => addServiceOption(
      sub.setName('content')
        .setDescription('Generate ready-to-post promotional copy')
        .addStringOption(option => option.setName('platform').setDescription('Destination platform').setRequired(true).addChoices(...PLATFORM_CHOICES))
    ))
    .addSubcommand(sub => addServiceOption(
      sub.setName('post')
        .setDescription('Post an ESN promotion to an approved Discord channel')
        .addChannelOption(option => option.setName('channel').setDescription('Channel to post in').setRequired(true))
    ))
    .addSubcommand(sub => addServiceOption(
      sub.setName('schedule-add')
        .setDescription('Schedule a repeating post in an approved Discord channel')
        .addStringOption(option => option.setName('name').setDescription('Campaign name').setMinLength(2).setMaxLength(40).setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Channel to post in').setRequired(true))
        .addIntegerOption(option => option.setName('every-hours').setDescription('Hours between posts (minimum 1)').setMinValue(1).setMaxValue(168).setRequired(true))
    ))
    .addSubcommand(sub => sub.setName('schedule-list').setDescription('List active ESN campaigns'))
    .addSubcommand(sub => sub.setName('schedule-stop').setDescription('Stop a scheduled campaign')
      .addStringOption(option => option.setName('name').setDescription('Campaign name').setRequired(true)))
    .addSubcommand(sub => sub.setName('lead-add').setDescription('Add a sales lead')
      .addStringOption(option => option.setName('name').setDescription('Lead name').setRequired(true).setMaxLength(80))
      .addStringOption(option => option.setName('contact').setDescription('Discord/user/contact reference').setRequired(true).setMaxLength(120))
      .addStringOption(option => option.setName('service').setDescription('Service they want').setRequired(true).setMaxLength(80))
      .addNumberOption(option => option.setName('value').setDescription('Estimated sale value in USD').setMinValue(0).setRequired(false)))
    .addSubcommand(sub => sub.setName('lead-list').setDescription('List open sales leads'))
    .addSubcommand(sub => sub.setName('lead-close').setDescription('Close a lead and credit the staff member who made the sale')
      .addStringOption(option => option.setName('id').setDescription('Lead ID').setRequired(true))
      .addUserOption(option => option.setName('staff').setDescription('Staff member who closed the sale').setRequired(true))
      .addNumberOption(option => option.setName('amount').setDescription('Final sale amount in USD').setMinValue(0).setRequired(true)))
    .addSubcommand(sub => sub.setName('referral-code').setDescription('Create or show a staff referral code')
      .addUserOption(option => option.setName('staff').setDescription('Staff member (defaults to you)').setRequired(false)))
    .addSubcommand(sub => sub.setName('referral-sale').setDescription('Credit a sale to a referral code')
      .addStringOption(option => option.setName('code').setDescription('Referral code').setRequired(true))
      .addNumberOption(option => option.setName('amount').setDescription('Sale amount in USD').setMinValue(0).setRequired(true))
      .addStringOption(option => option.setName('note').setDescription('Optional order/ticket note').setMaxLength(120).setRequired(false)))
    .addSubcommand(sub => sub.setName('referral-invites').setDescription('Credit invites to a referral code')
      .addStringOption(option => option.setName('code').setDescription('Referral code').setRequired(true))
      .addIntegerOption(option => option.setName('count').setDescription('Invites to add').setMinValue(1).setMaxValue(1000).setRequired(true)))
    .addSubcommand(sub => sub.setName('staff-stats').setDescription('Show sales, commission and invite reward totals')
      .addUserOption(option => option.setName('staff').setDescription('Staff member (defaults to you)').setRequired(false)))
    .addSubcommand(sub => addServiceOption(
      sub.setName('ad-record')
        .setDescription('Record a CAM ad and post it with ESN promotional copy')
        .addStringOption(option => option.setName('preset').setDescription('CAM preset').setRequired(true).addChoices(...PRESET_CHOICES))
        .addChannelOption(option => option.setName('channel').setDescription('Channel to post the finished ad in').setRequired(true))
    ))
}

function defaultData() {
  return {
    version: 1,
    campaigns: [],
    leads: [],
    referrals: {},
    staff: {},
    metrics: { posts: 0, generatedContent: 0, adsRecorded: 0, leadsCreated: 0, leadsClosed: 0, revenueTracked: 0 },
    nextLeadId: 1
  }
}

class GrowthStore {
  constructor(config) {
    this.config = config
    this.file = path.resolve(config.dataFile)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    this.data = this.load()
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      return { ...defaultData(), ...parsed, metrics: { ...defaultData().metrics, ...(parsed.metrics || {}) } }
    } catch {
      return defaultData()
    }
  }

  save() {
    const temp = `${this.file}.tmp`
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2))
    fs.renameSync(temp, this.file)
  }

  staff(userId) {
    if (!this.data.staff[userId]) {
      this.data.staff[userId] = { salesCount: 0, salesTotal: 0, commissionOwed: 0, invites: 0, inviteRewardOwed: 0 }
    }
    return this.data.staff[userId]
  }

  referralByUser(userId) {
    return Object.entries(this.data.referrals).find(([, value]) => value.staffUserId === userId)
  }

  getOrCreateReferral(user) {
    const existing = this.referralByUser(user.id)
    if (existing) return { code: existing[0], ...existing[1] }

    const base = (user.username || 'STAFF').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10) || 'STAFF'
    let code = `ESN-${base}-${user.id.slice(-4)}`
    let suffix = 2
    while (this.data.referrals[code]) code = `ESN-${base}-${user.id.slice(-4)}-${suffix++}`
    this.data.referrals[code] = { staffUserId: user.id, createdAt: new Date().toISOString() }
    this.staff(user.id)
    this.save()
    return { code, ...this.data.referrals[code] }
  }

  creditSale(userId, amount) {
    const staff = this.staff(userId)
    const commission = amount * (this.config.saleCommissionPercent / 100)
    staff.salesCount += 1
    staff.salesTotal += amount
    staff.commissionOwed += commission
    this.data.metrics.revenueTracked += amount
    return commission
  }

  creditInvites(userId, count) {
    const staff = this.staff(userId)
    const beforeBlocks = Math.floor(staff.invites / this.config.invitesPerReward)
    staff.invites += count
    const afterBlocks = Math.floor(staff.invites / this.config.invitesPerReward)
    const newBlocks = Math.max(0, afterBlocks - beforeBlocks)
    const reward = newBlocks * this.config.inviteRewardDollars
    staff.inviteRewardOwed += reward
    return reward
  }
}

function promo(service, config) {
  const website = config.websiteUrl
  const discord = config.discordInvite
  const guardian = config.guardianInvite
  const blocks = {
    minecraft: `**Need a Minecraft server that actually feels custom?**\nESN can help with custom plugins, menus, ranks, bosses, cosmetics, setup and server development.\n\nSee ESN: ${website}\nTalk to us: ${discord}`,
    discord: `**Want your Discord to look and run like a real community?**\nESN can help with server setup, channels, roles, automation, moderation systems and custom bots.\n\nSee ESN: ${website}\nTalk to us: ${discord}`,
    guardian: `**Protect your Discord with ESN Guardian.**\nAnti-raid, anti-nuke, moderation, verification, backups and ESN security tools in one bot.\n\nAdd Guardian: ${guardian}\nMore from ESN: ${website}`,
    website: `**Need a website without building everything from zero?**\nESN offers website services and tools for communities, creators and game servers.\n\nSee what ESN can build: ${website}\nTalk to us: ${discord}`,
    smp: `**Join ESN SMP.**\nCustom systems, exclusive gear, bosses, events and Java + Bedrock support.\n\nJava: esn.ggwp.cc\nBedrock: esn.ggwp.cc:${config.smpBedrockPort}\nCommunity: ${discord}`,
    general: `**ES Network builds tools for communities and game servers.**\nMinecraft development, Discord systems, ESN Guardian, websites and more.\n\nWebsite: ${website}\nDiscord: ${discord}`
  }
  return blocks[service] || blocks.general
}

function contentFor(platform, service, config) {
  const base = promo(service, config)
  if (platform === 'discord') return base
  if (platform === 'tiktok') return `HOOK: We built this so server owners don't have to do everything themselves.\n\nCAPTION:\n${base}\n\n#Minecraft #Discord #ServerOwner #ESN`
  if (platform === 'youtube-shorts') return `TITLE: We built this for server owners 👀\n\nSHORTS CAPTION:\n${base}\n\n#shorts #minecraft #discord`
  if (platform === 'instagram-reels') return `REEL HOOK: Your server can look way more professional than this.\n\nCAPTION:\n${base}\n\n#MinecraftServer #DiscordServer #ESN`
  if (platform === 'server-list') return `ESN SMP — Java + Bedrock\n\n${promo('smp', config)}\n\nCustom content • events • bosses • exclusive gear • active development`
  return base
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

async function postToChannel(client, channelId, content, files = []) {
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') throw new Error('That channel cannot receive messages from this bot.')
  await channel.send({ content, files, allowedMentions: { parse: [] } })
}

function createGrowthManager(config, recorder) {
  const store = new GrowthStore(config)
  let scheduler = null
  let clientRef = null

  async function runDueCampaigns() {
    if (!clientRef?.isReady()) return
    const now = Date.now()
    let dirty = false
    for (const campaign of store.data.campaigns.filter(item => item.active)) {
      if (Date.parse(campaign.nextRunAt) > now) continue
      try {
        await postToChannel(clientRef, campaign.channelId, promo(campaign.service, config))
        campaign.lastRunAt = new Date().toISOString()
        campaign.lastError = null
        store.data.metrics.posts += 1
      } catch (error) {
        campaign.lastError = error.message
      }
      campaign.nextRunAt = new Date(now + campaign.everyHours * 60 * 60 * 1000).toISOString()
      dirty = true
    }
    if (dirty) store.save()
  }

  function start(client) {
    clientRef = client
    if (scheduler) clearInterval(scheduler)
    scheduler = setInterval(() => runDueCampaigns().catch(error => console.error('[Growth scheduler]', error)), 60_000)
    scheduler.unref?.()
  }

  function stop() {
    if (scheduler) clearInterval(scheduler)
    scheduler = null
  }

  async function handle(interaction) {
    const sub = interaction.options.getSubcommand()

    if (sub === 'dashboard') {
      const m = store.data.metrics
      const active = store.data.campaigns.filter(item => item.active).length
      const openLeads = store.data.leads.filter(item => item.status === 'open').length
      const totalOwed = Object.values(store.data.staff).reduce((sum, s) => sum + s.commissionOwed + s.inviteRewardOwed, 0)
      await interaction.reply({ content: `**ESN Growth Dashboard**\nActive campaigns: **${active}**\nOpen leads: **${openLeads}**\nPosts sent: **${m.posts}**\nContent generated: **${m.generatedContent}**\nTracked revenue: **${money(m.revenueTracked)}**\nStaff payout currently tracked: **${money(totalOwed)}**`, ephemeral: true })
      return
    }

    if (sub === 'content') {
      const platform = interaction.options.getString('platform', true)
      const service = interaction.options.getString('service', true)
      store.data.metrics.generatedContent += 1
      store.save()
      await interaction.reply({ content: contentFor(platform, service, config), ephemeral: true, allowedMentions: { parse: [] } })
      return
    }

    if (sub === 'post') {
      await interaction.deferReply({ ephemeral: true })
      const channel = interaction.options.getChannel('channel', true)
      const service = interaction.options.getString('service', true)
      await postToChannel(interaction.client, channel.id, promo(service, config))
      store.data.metrics.posts += 1
      store.save()
      await interaction.editReply(`Posted the **${service}** ESN promotion in <#${channel.id}>.`)
      return
    }

    if (sub === 'schedule-add') {
      const name = interaction.options.getString('name', true).trim()
      const channel = interaction.options.getChannel('channel', true)
      const service = interaction.options.getString('service', true)
      const everyHours = interaction.options.getInteger('every-hours', true)
      if (store.data.campaigns.some(item => item.active && item.name.toLowerCase() === name.toLowerCase())) throw new Error('An active campaign already uses that name.')
      store.data.campaigns.push({ name, channelId: channel.id, service, everyHours, active: true, createdAt: new Date().toISOString(), nextRunAt: new Date(Date.now() + everyHours * 60 * 60 * 1000).toISOString(), lastRunAt: null, lastError: null })
      store.save()
      await interaction.reply({ content: `Campaign **${name}** is active in <#${channel.id}> every **${everyHours} hour(s)**.`, ephemeral: true })
      return
    }

    if (sub === 'schedule-list') {
      const active = store.data.campaigns.filter(item => item.active)
      const lines = active.map(item => `**${item.name}** — ${item.service} — <#${item.channelId}> — every ${item.everyHours}h — next: <t:${Math.floor(Date.parse(item.nextRunAt) / 1000)}:R>${item.lastError ? ` — last error: ${item.lastError}` : ''}`)
      await interaction.reply({ content: lines.join('\n') || 'No active campaigns.', ephemeral: true })
      return
    }

    if (sub === 'schedule-stop') {
      const name = interaction.options.getString('name', true).trim().toLowerCase()
      const campaign = store.data.campaigns.find(item => item.active && item.name.toLowerCase() === name)
      if (!campaign) throw new Error('No active campaign was found with that name.')
      campaign.active = false
      campaign.stoppedAt = new Date().toISOString()
      store.save()
      await interaction.reply({ content: `Stopped campaign **${campaign.name}**.`, ephemeral: true })
      return
    }

    if (sub === 'lead-add') {
      const lead = { id: `L${store.data.nextLeadId++}`, name: interaction.options.getString('name', true), contact: interaction.options.getString('contact', true), service: interaction.options.getString('service', true), estimatedValue: interaction.options.getNumber('value') || 0, status: 'open', createdAt: new Date().toISOString(), createdBy: interaction.user.id }
      store.data.leads.push(lead)
      store.data.metrics.leadsCreated += 1
      store.save()
      await interaction.reply({ content: `Added lead **${lead.id}** — ${lead.name} — ${lead.service} — estimated ${money(lead.estimatedValue)}.`, ephemeral: true })
      return
    }

    if (sub === 'lead-list') {
      const open = store.data.leads.filter(item => item.status === 'open').slice(-20)
      const lines = open.map(item => `**${item.id}** — ${item.name} — ${item.service} — ${money(item.estimatedValue)} — ${item.contact}`)
      await interaction.reply({ content: lines.join('\n') || 'No open leads.', ephemeral: true, allowedMentions: { parse: [] } })
      return
    }

    if (sub === 'lead-close') {
      const id = interaction.options.getString('id', true).toUpperCase()
      const staffUser = interaction.options.getUser('staff', true)
      const amount = interaction.options.getNumber('amount', true)
      const lead = store.data.leads.find(item => item.id.toUpperCase() === id)
      if (!lead) throw new Error('Lead not found.')
      if (lead.status !== 'open') throw new Error('That lead is already closed.')
      const commission = store.creditSale(staffUser.id, amount)
      lead.status = 'closed'
      lead.closedAt = new Date().toISOString()
      lead.closedBy = staffUser.id
      lead.saleAmount = amount
      store.data.metrics.leadsClosed += 1
      store.save()
      await interaction.reply({ content: `Closed **${lead.id}** for **${money(amount)}**. <@${staffUser.id}> gets **${money(commission)}** tracked at ${config.saleCommissionPercent}% commission.`, ephemeral: true, allowedMentions: { parse: [] } })
      return
    }

    if (sub === 'referral-code') {
      const staffUser = interaction.options.getUser('staff') || interaction.user
      const referral = store.getOrCreateReferral(staffUser)
      await interaction.reply({ content: `<@${staffUser.id}>'s referral code: **${referral.code}**`, ephemeral: true, allowedMentions: { parse: [] } })
      return
    }

    if (sub === 'referral-sale') {
      const code = interaction.options.getString('code', true).trim().toUpperCase()
      const amount = interaction.options.getNumber('amount', true)
      const note = interaction.options.getString('note') || ''
      const ref = store.data.referrals[code]
      if (!ref) throw new Error('Referral code not found.')
      const commission = store.creditSale(ref.staffUserId, amount)
      if (!ref.sales) ref.sales = []
      ref.sales.push({ amount, note, at: new Date().toISOString() })
      store.save()
      await interaction.reply({ content: `Credited **${money(amount)}** to **${code}**. Staff commission tracked: **${money(commission)}**.`, ephemeral: true })
      return
    }

    if (sub === 'referral-invites') {
      const code = interaction.options.getString('code', true).trim().toUpperCase()
      const count = interaction.options.getInteger('count', true)
      const ref = store.data.referrals[code]
      if (!ref) throw new Error('Referral code not found.')
      const reward = store.creditInvites(ref.staffUserId, count)
      store.save()
      await interaction.reply({ content: `Added **${count} invite(s)** to **${code}**.${reward > 0 ? ` New reward unlocked: **${money(reward)}**.` : ''}`, ephemeral: true })
      return
    }

    if (sub === 'staff-stats') {
      const staffUser = interaction.options.getUser('staff') || interaction.user
      const stats = store.staff(staffUser.id)
      const codeEntry = store.referralByUser(staffUser.id)
      store.save()
      await interaction.reply({ content: `**Staff Growth Stats — ${staffUser.username}**\nReferral code: **${codeEntry?.[0] || 'not created'}**\nSales closed: **${stats.salesCount}**\nSales total: **${money(stats.salesTotal)}**\nCommission owed: **${money(stats.commissionOwed)}**\nInvites: **${stats.invites}**\nInvite rewards owed: **${money(stats.inviteRewardOwed)}**\nTotal tracked payout: **${money(stats.commissionOwed + stats.inviteRewardOwed)}**`, ephemeral: true })
      return
    }

    if (sub === 'ad-record') {
      await interaction.deferReply({ ephemeral: true })
      const preset = interaction.options.getString('preset', true)
      const channel = interaction.options.getChannel('channel', true)
      const service = interaction.options.getString('service', true)
      await interaction.editReply(`Recording CAM preset **${preset}** for the **${service}** campaign...`)
      const result = await recorder.recordPreset(preset)
      if (!result.finalOutput || !fs.existsSync(result.finalOutput)) throw new Error(`Recording finished but no output file was found. Job: ${result.id}`)
      const size = fs.statSync(result.finalOutput).size
      if (size > 24 * 1024 * 1024) throw new Error(`Recording finished, but it is over 24 MB. Saved at ${result.finalOutput}`)
      const attachment = new AttachmentBuilder(result.finalOutput)
      await postToChannel(interaction.client, channel.id, promo(service, config), [attachment])
      store.data.metrics.posts += 1
      store.data.metrics.adsRecorded += 1
      store.save()
      await interaction.editReply(`Finished **${preset}** and posted the ad in <#${channel.id}>.`)
    }
  }

  return { commandDefinition, handle, start, stop, store }
}

module.exports = { createGrowthManager }
