import { net, session, type Session } from 'electron'
import {
  DEFAULT_DOWNLOAD_SPEED_TEST_TIMEOUT,
  DEFAULT_DOWNLOAD_SPEED_TEST_URL,
  SPEED_TEST_SLOT_COUNT,
  normalizeDownloadSpeedTestBytes,
  normalizeDownloadSpeedTestTimeout,
  speedTestGroupName,
  speedTestPort
} from '../../shared/speed-test'
import { getAppConfig } from '../config'
import { mihomoChangeProxy } from './mihomoApi'

interface SpeedTestSlot {
  index: number
  busy: boolean
  session: Session
  initialized: boolean
  groupName: string
  port: number
}

let slots: SpeedTestSlot[] | undefined
const waiters: ((slot: SpeedTestSlot) => void)[] = []

function getSlots(): SpeedTestSlot[] {
  if (slots) return slots
  slots = Array.from({ length: SPEED_TEST_SLOT_COUNT }, (_, index) => ({
    index,
    busy: false,
    session: session.fromPartition(`sparkle-speed-test-${index}`, { cache: false }),
    initialized: false,
    groupName: speedTestGroupName(index),
    port: speedTestPort(index)
  }))
  return slots
}

async function initializeSlot(slot: SpeedTestSlot): Promise<void> {
  if (slot.initialized) return
  await slot.session.setProxy({
    proxyRules: `http=127.0.0.1:${slot.port};https=127.0.0.1:${slot.port}`,
    proxyBypassRules: '<-loopback>'
  })
  slot.initialized = true
}

function acquireSlot(): Promise<SpeedTestSlot> {
  const free = getSlots().find((slot) => !slot.busy)
  if (free) {
    free.busy = true
    return Promise.resolve(free)
  }
  return new Promise((resolve) => {
    waiters.push((slot) => {
      slot.busy = true
      resolve(slot)
    })
  })
}

function releaseSlot(slot: SpeedTestSlot): void {
  slot.busy = false
  const next = waiters.shift()
  if (next) next(slot)
}

function buildDownloadUrl(url: string, bytes: number): string {
  const target = url.includes('{bytes}') ? url.replaceAll('{bytes}', String(bytes)) : url
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}_sparkle=${Date.now()}`
}

function download(
  slot: SpeedTestSlot,
  url: string,
  maxBytes: number,
  timeoutMs: number
): Promise<ControllerProxySpeedResult> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      session: slot.session,
      useSessionCookies: false
    })
    request.setHeader('Cache-Control', 'no-cache')

    let firstByteAt = 0
    let received = 0
    let settled = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
        return
      }
      const elapsedMs = firstByteAt > 0 ? Date.now() - firstByteAt : 0
      if (received <= 0 || elapsedMs <= 0) {
        reject(new Error('下载测速没有收到有效数据'))
        return
      }
      resolve({
        bytes: received,
        duration: elapsedMs / 1000,
        bytesPerSecond: (received * 1000) / elapsedMs
      })
    }

    const timer = setTimeout(() => {
      request.abort()
      finish(new Error('下载测速超时'))
    }, timeoutMs)

    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        request.abort()
        finish(new Error(`下载测速返回 HTTP ${response.statusCode}`))
        return
      }
      response.on('data', (chunk: Buffer) => {
        if (firstByteAt === 0) firstByteAt = Date.now()
        received += chunk.length
        if (received >= maxBytes) {
          request.abort()
          finish()
        }
      })
      response.on('end', () => finish())
      response.on('error', (error) => finish(error))
    })
    request.on('error', (error) => finish(error))
    request.end()
  })
}

export async function testProxyDownloadSpeed(
  proxyName: string,
  url?: string,
  bytes?: number,
  timeout?: number
): Promise<ControllerProxySpeedResult> {
  const appConfig = await getAppConfig()
  const targetUrl = url || appConfig.downloadSpeedTestUrl || DEFAULT_DOWNLOAD_SPEED_TEST_URL
  const maxBytes = normalizeDownloadSpeedTestBytes(bytes ?? appConfig.downloadSpeedTestBytes)
  const timeoutMs = normalizeDownloadSpeedTestTimeout(
    timeout ?? appConfig.downloadSpeedTestTimeout ?? DEFAULT_DOWNLOAD_SPEED_TEST_TIMEOUT
  )
  const slot = await acquireSlot()
  try {
    await initializeSlot(slot)
    await mihomoChangeProxy(slot.groupName, proxyName)
    slot.session.closeAllConnections()
    return await download(slot, buildDownloadUrl(targetUrl, maxBytes), maxBytes, timeoutMs)
  } finally {
    releaseSlot(slot)
  }
}

