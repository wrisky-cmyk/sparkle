// 代理测速结果，主进程持久化、渲染进程读写都走这份结构
export interface ProxyTestProfileResult {
  // 最近一次测速超时的节点名：生成核心配置时从各代理组里排除
  removed: string[]
  // 最近一次测速拿到结果的节点名：更新订阅后的自动测速只补测没测过的
  tested: string[]
}

export type ProxyTestStore = Record<string, ProxyTestProfileResult>
