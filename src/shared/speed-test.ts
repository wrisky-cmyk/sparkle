export const SPEED_TEST_SLOT_COUNT = 4
export const SPEED_TEST_BASE_PORT = 39080
export const SPEED_TEST_GROUP_PREFIX = '__sparkle_speed_test_group_'
export const SPEED_TEST_LISTENER_PREFIX = '__sparkle_speed_test_listener_'

export const DEFAULT_DOWNLOAD_SPEED_TEST_URL =
  'https://speed.cloudflare.com/__down?bytes={bytes}'
export const DEFAULT_DOWNLOAD_SPEED_TEST_BYTES = 10 * 1024 * 1024
export const DEFAULT_DOWNLOAD_SPEED_TEST_TIMEOUT = 15000
export const DEFAULT_DOWNLOAD_SPEED_TEST_CONCURRENCY = 4

export function speedTestGroupName(index: number): string {
  return `${SPEED_TEST_GROUP_PREFIX}${index}`
}

export function speedTestListenerName(index: number): string {
  return `${SPEED_TEST_LISTENER_PREFIX}${index}`
}

export function speedTestPort(index: number): number {
  return SPEED_TEST_BASE_PORT + index
}

export function normalizeDownloadSpeedTestBytes(value?: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return DEFAULT_DOWNLOAD_SPEED_TEST_BYTES
  return Math.min(Math.max(Math.floor(numericValue), 1024 * 1024), 100 * 1024 * 1024)
}

export function normalizeDownloadSpeedTestConcurrency(value?: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return DEFAULT_DOWNLOAD_SPEED_TEST_CONCURRENCY
  return Math.min(Math.max(Math.floor(numericValue), 1), SPEED_TEST_SLOT_COUNT)
}

export function normalizeDownloadSpeedTestTimeout(value?: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return DEFAULT_DOWNLOAD_SPEED_TEST_TIMEOUT
  return Math.min(Math.max(Math.floor(numericValue), 1000), 120000)
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

export function formatSpeedShort(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0'
  if (bytesPerSecond >= 1024 * 1024) {
    const value = bytesPerSecond / 1024 / 1024
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`
  }
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)}K`
  return `${Math.round(bytesPerSecond)}B`
}
