'use strict'

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function normalizeDuckUrl(raw) {
  let value = decodeHtml(raw || '').trim()
  if (!value) return null
  if (value.startsWith('//')) value = 'https:' + value

  try {
    const url = new URL(value)
    const uddg = url.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return url.toString()
  } catch {
    return null
  }
}

function parseDuckDuckGoHtml(html, limit) {
  const anchors = [...String(html || '').matchAll(
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )]

  const snippets = [...String(html || '').matchAll(
    /<(?:a|div)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi
  )]

  const results = []
  for (let index = 0; index < anchors.length && results.length < limit; index++) {
    const href = normalizeDuckUrl(anchors[index][1])
    const title = stripHtml(anchors[index][2])
    if (!href || !/^https?:\/\//i.test(href) || !title) continue

    results.push({
      title: title.slice(0, 180),
      url: href,
      snippet: stripHtml(snippets[index]?.[1] || '').slice(0, 320)
    })
  }

  return results
}

function flattenRelatedTopics(items, output, limit) {
  for (const item of items || []) {
    if (output.length >= limit) return
    if (Array.isArray(item.Topics)) {
      flattenRelatedTopics(item.Topics, output, limit)
      continue
    }
    if (!item.FirstURL || !item.Text) continue
    output.push({
      title: String(item.Text).split(' - ')[0].slice(0, 180),
      url: item.FirstURL,
      snippet: String(item.Text).slice(0, 320)
    })
  }
}

async function instantAnswerFallback(query, limit) {
  const url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1'
  const response = await fetch(url, {
    headers: { 'user-agent': 'ESN-Operator/2.4' },
    signal: AbortSignal.timeout(12000)
  })
  if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status)

  const body = await response.json()
  const results = []

  if (body.AbstractURL && body.AbstractText) {
    results.push({
      title: body.Heading || query,
      url: body.AbstractURL,
      snippet: body.AbstractText.slice(0, 320)
    })
  }

  flattenRelatedTopics(body.RelatedTopics, results, limit)
  return results.slice(0, limit)
}

async function searchWeb(query, limit = 5) {
  const cleaned = String(query || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) throw new Error('Search query cannot be empty.')

  const count = Math.max(1, Math.min(Number(limit) || 5, 5))
  const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(cleaned)

  try {
    const response = await fetch(htmlUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ESN-Operator/2.4; +https://esnoffical.com)',
        accept: 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (response.ok) {
      const results = parseDuckDuckGoHtml(await response.text(), count)
      if (results.length) return { provider: 'DuckDuckGo', results }
    }
  } catch {}

  const fallback = await instantAnswerFallback(cleaned, count)
  if (!fallback.length) throw new Error('No useful public web results were found for that search.')
  return { provider: 'DuckDuckGo', results: fallback }
}

module.exports = { searchWeb }
