'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { SlashCommandBuilder } = require('discord.js')

function money(value) {
  return '$' + Number(value || 0).toFixed(2)
}

function parseDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) return direct
  const match = raw.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{2,4})$/)
  if (!match) return null
  let year = Number(match[3])
  if (year < 100) year += 2000
  const date = new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAmount(value) {
  let raw = String(value ?? '').trim()
  if (!raw) return null
  const negative = /^\\(.*\\)$/.test(raw)
  raw = raw.replace(/[,$£€\\s]/g, '').replace(/[()]/g, '')
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

function normalizeMerchant(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/HTTPS?:\\/\\/\\S+/g, ' ')
    .replace(/\\b(POS|PURCHASE|PAYMENT|DEBIT|CARD|ONLINE|RECURRING|AUTOPAY|ACH|INC|LLC|LTD|COM)\\b/g, ' ')
    .replace(/[#*]\\w+/g, ' ')
    .replace(/\\b\\d{3,}\\b/g, ' ')
    .replace(/[^A-Z0-9&' -]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\\n') {
      row.push(cell.replace(/\\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  row.push(cell.replace(/\\r$/, ''))
  if (row.some(value => value.trim())) rows.push(row)
  if (rows.length < 2) return []

  const headers = rows[0].map(header => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))
  return rows.slice(1).map(values => {
    const result = {}
    headers.forEach((header, index) => { result[header] = values[index] ?? '' })
    return result
  })
}

function firstField(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && String(row[name]).trim()) return row[name]
  }
  return ''
}

function transactionFromRow(row, source, index) {
  const date = parseDate(firstField(row, ['date', 'transaction_date', 'activity_date', 'posted_date', 'time', 'timestamp']))
  let amount = parseAmount(firstField(row, ['amount', 'transaction_amount', 'net_amount', 'total', 'value']))
  const rawMerchant = firstField(row, ['merchant', 'name', 'description', 'notes', 'memo', 'transaction', 'activity', 'details'])
  const type = String(firstField(row, ['type', 'transaction_type', 'category'])).toLowerCase()

  if (!date || amount === null || !rawMerchant) return null
  if (/refund|deposit|received|cash in|credit/.test(type) && amount > 0) return null

  amount = Math.abs(amount)
  const merchant = normalizeMerchant(rawMerchant)
  if (!merchant || !amount) return null

  return {
    id: source + '-' + date.toISOString().slice(0, 10) + '-' + index + '-' + Math.round(amount * 100),
    source,
    date: date.toISOString(),
    merchant,
    rawDescription: String(rawMerchant).slice(0, 180),
    amount
  }
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function cadence(days) {
  if (days >= 5 && days <= 9) return { name: 'weekly', days: 7 }
  if (days >= 12 && days <= 18) return { name: 'biweekly', days: 14 }
  if (days >= 25 && days <= 35) return { name: 'monthly', days: 30 }
  if (days >= 55 && days <= 70) return { name: 'every ~2 months', days: 60 }
  if (days >= 80 && days <= 100) return { name: 'quarterly', days: 90 }
  if (days >= 330 && days <= 400) return { name: 'yearly', days: 365 }
  return null
}

function detectSubscriptions(transactions, ignored) {
  const ignoredSet = new Set((ignored || []).map(normalizeMerchant))
  const groups = new Map()

  for (const tx of transactions) {
    const merchant = normalizeMerchant(tx.merchant)
    if (!merchant || ignoredSet.has(merchant)) continue
    if (!groups.has(merchant)) groups.set(merchant, [])
    groups.get(merchant).push(tx)
  }

  const results = []

  for (const [merchant, items] of groups.entries()) {
    if (items.length < 2) continue
    const sorted = [...items].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    const gaps = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((Date.parse(sorted[i].date) - Date.parse(sorted[i - 1].date)) / 86400000)
    }

    const typicalGap = median(gaps)
    const schedule = cadence(typicalGap)
    if (!schedule) continue

    const amounts = sorted.map(item => Number(item.amount))
    const typicalAmount = median(amounts)
    const variance = typicalAmount
      ? Math.max(...amounts.map(amount => Math.abs(amount - typicalAmount) / typicalAmount))
      : 1
    if (variance > 0.65) continue

    const gapError = gaps.length > 1
      ? Math.max(...gaps.map(gap => Math.abs(gap - schedule.days))) / schedule.days
      : 0.45
    const score = Math.max(0, 1 - gapError) * 0.5 +
      Math.min(1, (sorted.length - 1) / 3) * 0.3 +
      Math.max(0, 1 - variance) * 0.2

    const confidence = score >= 0.78 ? 'high' : score >= 0.58 ? 'medium' : 'possible'
    const last = sorted[sorted.length - 1]
    const next = new Date(Date.parse(last.date) + schedule.days * 86400000)

    results.push({
      merchant,
      cadence: schedule.name,
      typicalAmount,
      occurrences: sorted.length,
      nextExpectedAt: next.toISOString(),
      confidence
    })
  }

  return results.sort((a, b) => Date.parse(a.nextExpectedAt) - Date.parse(b.nextExpectedAt))
}

function defaultData() {
  return {
    version: 1,
    lockdown: false,
    transactions: [],
    ignoredMerchants: [],
    purchaseRequests: [],
    nextPurchaseId: 1,
    imports: []
  }
}

class FinanceStore {
  constructor(config) {
    this.file = path.resolve(config.dataFile)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    this.data = this.load()
  }

  load() {
    try {
      return { ...defaultData(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }
    } catch {
      return defaultData()
    }
  }

  save() {
    const temp = this.file + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2))
    fs.renameSync(temp, this.file)
  }

  importTransactions(transactions, source, fileName) {
    const existing = new Set(this.data.transactions.map(tx => tx.id))
    let added = 0

    for (const tx of transactions) {
      if (existing.has(tx.id)) continue
      this.data.transactions.push(tx)
      existing.add(tx.id)
      added++
    }

    this.data.transactions.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    this.data.imports.push({ source, fileName, added, at: new Date().toISOString() })
    this.data.imports = this.data.imports.slice(-50)
    this.save()
    return added
  }
}

function commandDefinition() {
  return new SlashCommandBuilder()
    .setName('esn')
    .setDescription('ESN Operator finance and purchasing')
    .addSubcommand(sub => sub.setName('finance-status').setDescription('Show ESN finance status'))
    .addSubcommand(sub => sub.setName('import-transactions').setDescription('Import a Cash App or bank CSV')
      .addAttachmentOption(option => option.setName('file').setDescription('CSV transaction export').setRequired(true))
      .addStringOption(option => option.setName('source').setDescription('Source label, such as cashapp').setRequired(false).setMaxLength(40)))
    .addSubcommand(sub => sub.setName('transaction-add').setDescription('Add one outgoing transaction')
      .addStringOption(option => option.setName('merchant').setDescription('Merchant').setRequired(true).setMaxLength(100))
      .addNumberOption(option => option.setName('amount').setDescription('Amount charged').setRequired(true).setMinValue(0.01))
      .addStringOption(option => option.setName('date').setDescription('Date, such as 2026-10-02').setRequired(true).setMaxLength(30)))
    .addSubcommand(sub => sub.setName('subscriptions').setDescription('Show detected subscriptions'))
    .addSubcommand(sub => sub.setName('subscription-ignore').setDescription('Ignore a recurring merchant')
      .addStringOption(option => option.setName('merchant').setDescription('Merchant').setRequired(true).setMaxLength(100)))
    .addSubcommand(sub => sub.setName('purchase-request').setDescription('Create an ESN purchase request')
      .addStringOption(option => option.setName('item').setDescription('Item or service').setRequired(true).setMaxLength(120))
      .addStringOption(option => option.setName('vendor').setDescription('Vendor').setRequired(true).setMaxLength(100))
      .addNumberOption(option => option.setName('amount').setDescription('Expected total').setRequired(true).setMinValue(0.01))
      .addStringOption(option => option.setName('checkout-url').setDescription('Optional product or checkout URL').setRequired(false).setMaxLength(500)))
    .addSubcommand(sub => sub.setName('purchase-review').setDescription('Owner-only purchase approval')
      .addStringOption(option => option.setName('id').setDescription('Purchase ID').setRequired(true))
      .addStringOption(option => option.setName('decision').setDescription('Approve or deny').setRequired(true)
        .addChoices({ name: 'Approve', value: 'approve' }, { name: 'Deny', value: 'deny' })))
    .addSubcommand(sub => sub.setName('purchases').setDescription('Show recent purchase requests'))
    .addSubcommand(sub => sub.setName('lockdown').setDescription('Owner-only purchasing lock')
      .addStringOption(option => option.setName('mode').setDescription('Lock on or off').setRequired(true)
        .addChoices({ name: 'ON', value: 'on' }, { name: 'OFF', value: 'off' })))
}

function requireOwner(interaction, discordConfig) {
  if (!discordConfig.ownerUserId) throw new Error('CAM_OWNER_USER_ID must be configured for finance approvals.')
  if (interaction.user.id !== discordConfig.ownerUserId) throw new Error('Only the configured ESN owner can do that.')
}

function monthlyBurn(subscriptions) {
  return subscriptions.reduce((sum, item) => {
    if (item.cadence === 'weekly') return sum + item.typicalAmount * 52 / 12
    if (item.cadence === 'biweekly') return sum + item.typicalAmount * 26 / 12
    if (item.cadence === 'monthly') return sum + item.typicalAmount
    if (item.cadence === 'every ~2 months') return sum + item.typicalAmount / 2
    if (item.cadence === 'quarterly') return sum + item.typicalAmount / 3
    if (item.cadence === 'yearly') return sum + item.typicalAmount / 12
    return sum
  }, 0)
}

function createFinanceManager(config, discordConfig) {
  const store = new FinanceStore(config)

  async function handle(interaction) {
    const sub = interaction.options.getSubcommand()

    if (sub === 'finance-status') {
      const subscriptions = detectSubscriptions(store.data.transactions, store.data.ignoredMerchants)
      const pending = store.data.purchaseRequests.filter(item => item.status === 'pending').length
      await interaction.reply({
        content:
          '**ESN Operator — Finance**\\n' +
          'Transactions stored: **' + store.data.transactions.length + '**\\n' +
          'Recurring charges detected: **' + subscriptions.length + '**\\n' +
          'Estimated subscription burn: **' + money(monthlyBurn(subscriptions)) + '/month**\\n' +
          'Pending purchase requests: **' + pending + '**\\n' +
          'Purchasing lockdown: **' + (store.data.lockdown ? 'ON' : 'OFF') + '**\\n' +
          'Payment credentials stored by bot: **NO**',
        ephemeral: true
      })
      return
    }

    if (sub === 'import-transactions') {
      const attachment = interaction.options.getAttachment('file', true)
      const source = (interaction.options.getString('source') || 'cashapp')
        .trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'import'

      if (!/\\.csv$/i.test(attachment.name || '') && !String(attachment.contentType || '').includes('csv')) {
        throw new Error('Please upload a CSV transaction export.')
      }
      if (attachment.size > config.maxImportBytes) throw new Error('CSV is larger than the configured import limit.')

      await interaction.deferReply({ ephemeral: true })
      const response = await fetch(attachment.url)
      if (!response.ok) throw new Error('Could not download the CSV. HTTP ' + response.status)

      const rows = parseCsv(await response.text())
      const transactions = rows.map((row, index) => transactionFromRow(row, source, index)).filter(Boolean)
      if (!transactions.length) throw new Error('No usable outgoing transactions were found in that CSV.')

      const added = store.importTransactions(transactions, source, attachment.name || 'transactions.csv')
      const subscriptions = detectSubscriptions(store.data.transactions, store.data.ignoredMerchants)

      await interaction.editReply(
        'Imported **' + added + '** new transaction(s).\\n' +
        'Detected **' + subscriptions.length + '** recurring charge(s). Use /esn subscriptions to review them.'
      )
      return
    }

    if (sub === 'transaction-add') {
      const merchant = normalizeMerchant(interaction.options.getString('merchant', true))
      const amount = interaction.options.getNumber('amount', true)
      const date = parseDate(interaction.options.getString('date', true))
      if (!date) throw new Error('Use a date like 2026-10-02.')

      store.data.transactions.push({
        id: 'manual-' + Date.now(),
        source: 'manual',
        date: date.toISOString(),
        merchant,
        rawDescription: merchant,
        amount
      })
      store.save()
      await interaction.reply({ content: 'Added **' + merchant + ' — ' + money(amount) + '**.', ephemeral: true })
      return
    }

    if (sub === 'subscriptions') {
      const subscriptions = detectSubscriptions(store.data.transactions, store.data.ignoredMerchants)
      if (!subscriptions.length) {
        await interaction.reply({ content: 'No recurring charges detected yet. Import more transaction history first.', ephemeral: true })
        return
      }

      const lines = subscriptions.slice(0, 25).map(item => {
        const unix = Math.floor(Date.parse(item.nextExpectedAt) / 1000)
        return '**' + item.merchant + '** — ~' + money(item.typicalAmount) + ' ' + item.cadence +
          ' — ' + item.occurrences + ' charges — ' + item.confidence + ' confidence — next ~<t:' + unix + ':D>'
      })

      await interaction.reply({
        content: '**Detected subscriptions / recurring charges**\\n' + lines.join('\\n'),
        ephemeral: true
      })
      return
    }

    if (sub === 'subscription-ignore') {
      const merchant = normalizeMerchant(interaction.options.getString('merchant', true))
      if (!store.data.ignoredMerchants.map(normalizeMerchant).includes(merchant)) {
        store.data.ignoredMerchants.push(merchant)
        store.save()
      }
      await interaction.reply({ content: 'Ignoring **' + merchant + '** in subscription detection.', ephemeral: true })
      return
    }

    if (sub === 'purchase-request') {
      if (store.data.lockdown) throw new Error('Purchasing lockdown is ON.')

      const purchase = {
        id: 'P' + store.data.nextPurchaseId++,
        item: interaction.options.getString('item', true),
        vendor: interaction.options.getString('vendor', true),
        amount: interaction.options.getNumber('amount', true),
        checkoutUrl: interaction.options.getString('checkout-url') || null,
        status: 'pending',
        requestedBy: interaction.user.id,
        requestedAt: new Date().toISOString()
      }

      store.data.purchaseRequests.push(purchase)
      store.save()

      await interaction.reply({
        content:
          '**ESN Purchase Request ' + purchase.id + '**\\n' +
          'Item: **' + purchase.item + '**\\n' +
          'Vendor: **' + purchase.vendor + '**\\n' +
          'Expected total: **' + money(purchase.amount) + '**\\n' +
          (purchase.checkoutUrl ? 'Checkout: <' + purchase.checkoutUrl + '>\\n' : '') +
          'Status: **PENDING OWNER APPROVAL**\\n\\n' +
          'No Cash App login, PIN, CVV, or full card number is stored by ESN Operator.',
        ephemeral: true,
        allowedMentions: { parse: [] }
      })
      return
    }

    if (sub === 'purchase-review') {
      requireOwner(interaction, discordConfig)
      const id = interaction.options.getString('id', true).trim().toUpperCase()
      const decision = interaction.options.getString('decision', true)
      const purchase = store.data.purchaseRequests.find(item => item.id.toUpperCase() === id)

      if (!purchase) throw new Error('Purchase request not found.')
      if (purchase.status !== 'pending') throw new Error('That purchase is already ' + purchase.status + '.')
      if (decision === 'approve' && store.data.lockdown) throw new Error('Purchasing lockdown is ON.')

      purchase.status = decision === 'approve' ? 'approved' : 'denied'
      purchase.reviewedBy = interaction.user.id
      purchase.reviewedAt = new Date().toISOString()
      store.save()

      await interaction.reply({
        content:
          'Purchase **' + purchase.id + '** is **' + purchase.status.toUpperCase() + '**.\\n' +
          '**' + purchase.vendor + ' — ' + purchase.item + ' — ' + money(purchase.amount) + '**' +
          (purchase.status === 'approved' && purchase.checkoutUrl
            ? '\\nCheckout: <' + purchase.checkoutUrl + '>\\n\\nApproval is recorded. No payment is charged until a tokenized payment provider is connected.'
            : ''),
        ephemeral: true,
        allowedMentions: { parse: [] }
      })
      return
    }

    if (sub === 'purchases') {
      const recent = store.data.purchaseRequests.slice(-20).reverse()
      const lines = recent.map(item =>
        '**' + item.id + '** — ' + item.vendor + ' — ' + item.item + ' — ' + money(item.amount) + ' — **' + item.status.toUpperCase() + '**'
      )
      await interaction.reply({ content: lines.join('\\n') || 'No purchase requests yet.', ephemeral: true })
      return
    }

    if (sub === 'lockdown') {
      requireOwner(interaction, discordConfig)
      store.data.lockdown = interaction.options.getString('mode', true) === 'on'
      store.save()
      await interaction.reply({
        content: 'ESN purchasing lockdown is now **' + (store.data.lockdown ? 'ON' : 'OFF') + '**.',
        ephemeral: true
      })
    }
  }

  return { commandDefinition, handle, store }
}

module.exports = { createFinanceManager, detectSubscriptions, normalizeMerchant, parseCsv }
