'use strict'

// Development-only single-host persistent task queue. No student content is logged.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const express = require('express')

const DAY = 86400000
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function createAnalysisJobs({ dbPath, provider, now = Date.now, maxQueued = 100, rateLimit = 30 }) {
  if (!dbPath || typeof provider !== 'function') throw Error('task database and provider are required')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;')
    db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, snapshot_hash TEXT,
      question TEXT, answer TEXT, status TEXT NOT NULL, result TEXT,
      created INTEGER NOT NULL, updated INTEGER NOT NULL, tombstone_until INTEGER
    )`)
  } catch (error) { db.close(); throw error }
  const get = db.prepare('SELECT * FROM jobs WHERE id=?')
  const router = express.Router()
  const attempts = new Map()
  let closed = false, working = false, scheduled = false

  function cleanup() {
    const time = now()
    // An active dispatch is never retried because its provider outcome may be unknown.
    db.prepare("UPDATE jobs SET question=NULL, answer=NULL, result=NULL, snapshot_hash=NULL, status='expired', updated=?, tombstone_until=? WHERE status='queued' AND created<=?").run(time, time + 30 * DAY, time - DAY)
    db.prepare("UPDATE jobs SET question=NULL, answer=NULL, result=NULL, snapshot_hash=NULL, status='expired', updated=?, tombstone_until=? WHERE status IN ('complete','failed','uncertain') AND updated<=?").run(time, time + 30 * DAY, time - 7 * DAY)
    db.prepare("DELETE FROM jobs WHERE status='expired' AND tombstone_until<=?").run(time)
  }
  // Database exclusive locking rejects another server process instead of stealing its running task.
  try {
    db.prepare("UPDATE jobs SET status='uncertain', updated=? WHERE status='running'").run(now())
    cleanup()
  } catch (error) { db.close(); throw error }

  function publicData(row) {
    const out = { taskId: row.id, status: row.status }
    if (row.status === 'complete' && row.result) out.result = JSON.parse(row.result)
    return out
  }
  function authorized(row, token) {
    return !!row && validToken(token) && crypto.timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(digest(token), 'hex'))
  }
  function fail(res, status, message) { return res.status(status).json({ code: status, msg: message }) }
  function schedule() {
    if (closed || working || scheduled) return
    scheduled = true
    setImmediate(() => { scheduled = false; run().catch(() => {}) })
  }
  async function run() {
    if (closed || working) return
    working = true
    try {
      cleanup()
      const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created,id LIMIT 1").get()
      if (!row) return
      // Persist the possible dispatch BEFORE calling the provider.
      const changed = db.prepare("UPDATE jobs SET status='running', updated=? WHERE id=? AND status='queued'").run(now(), row.id).changes
      if (!changed) return
      try {
        const result = await provider({ taskId: row.id, question: row.question, wrongAnswer: row.answer })
        const encoded = JSON.stringify(result)
        if (!encoded || encoded.length > 1024 * 1024) throw Error('invalid result')
        if (!closed) db.prepare("UPDATE jobs SET status='complete', result=?, updated=? WHERE id=? AND status='running'").run(encoded, now(), row.id)
      } catch (_) {
        if (!closed) db.prepare("UPDATE jobs SET status='uncertain', updated=? WHERE id=? AND status='running'").run(now(), row.id)
      }
    } finally { working = false; if (!closed && db.prepare("SELECT id FROM jobs WHERE status='queued' LIMIT 1").get()) schedule() }
  }
  function guarded(fn) { return (req, res) => { try { cleanup(); fn(req, res) } catch (_) { fail(res, 503, '任务服务暂不可用') } } }
  router.post('/', guarded((req, res) => {
    const { taskId, question, wrongAnswer } = req.body || {}
    const token = req.get('X-Job-Token')
    if (!validId(taskId) || !validToken(token) || typeof question !== 'string' || typeof wrongAnswer !== 'string' || !question.trim() || question.length > 2000 || wrongAnswer.length > 1000) return fail(res, 400, '提交内容无效')
    const q = question.trim(), a = wrongAnswer.trim()
    const fingerprint = digest(JSON.stringify([q, a]))
    const existing = get.get(taskId)
    if (existing) {
      if (!authorized(existing, token)) return fail(res, 404, '任务不存在或无权访问')
      if (existing.status !== 'expired' && existing.snapshot_hash !== fingerprint) return fail(res, 409, '任务内容冲突')
      return res.json({ code: 0, data: publicData(existing) })
    }
    const time = now(), ip = req.ip || 'unknown'
    const recent = (attempts.get(ip) || []).filter(t => t > time - 60000)
    if (recent.length >= rateLimit) return fail(res, 429, '请求过于频繁')
    if (db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('queued','running')").get().count >= maxQueued) return fail(res, 429, '任务较多，请稍后再试')
    recent.push(time); attempts.set(ip, recent)
    db.prepare("INSERT INTO jobs (id,token_hash,snapshot_hash,question,answer,status,created,updated) VALUES (?,?,?,?,?,'queued',?,?)").run(taskId, digest(token), fingerprint, q, a, time, time)
    schedule()
    return res.status(202).json({ code: 0, data: publicData(get.get(taskId)) })
  }))
  router.get('/:id', guarded((req, res) => {
    const row = validId(req.params.id) && get.get(req.params.id)
    if (!authorized(row, req.get('X-Job-Token'))) return fail(res, 404, '任务不存在或无权访问')
    return res.json({ code: 0, data: publicData(row) })
  }))
  router.delete('/:id', guarded((req, res) => {
    const row = validId(req.params.id) && get.get(req.params.id)
    if (!authorized(row, req.get('X-Job-Token'))) return fail(res, 404, '任务不存在或无权访问')
    const time = now()
    db.prepare("UPDATE jobs SET question=NULL, answer=NULL, result=NULL, snapshot_hash=NULL, status='expired', updated=?, tombstone_until=? WHERE id=? AND status!='expired'").run(time, time + 30 * DAY, row.id)
    return res.json({ code: 0, data: publicData(get.get(row.id)) })
  }))
  const interval = setInterval(() => { if (!closed) { try { cleanup(); schedule() } catch (_) {} } }, 60000)
  interval.unref()
  schedule()
  return { router, close() { if (!closed) { closed = true; clearInterval(interval); db.close() } } }
}

module.exports = { createAnalysisJobs }
