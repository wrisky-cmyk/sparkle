// 手动更新订阅后，让代理页自动把节点测一遍（省得自己一个组一个组点）。
// 更新订阅是在「订阅」页做的，代理页可能没挂载，所以状态留在模块里。
let pending = false
const listeners = new Set<() => void>()

export function markProfileUpdated(): void {
  pending = true
  listeners.forEach((listener) => listener())
}

export function takeProfileUpdated(): boolean {
  if (!pending) return false
  pending = false
  return true
}

export function subscribeProfileUpdated(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
