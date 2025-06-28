import { TestResult, TestStats } from '../types'
import { logger } from '../utils/logger'

export abstract class BaseTest {
  protected stats: TestStats
  protected startTime: Date

  constructor(protected testName: string) {
    this.stats = {
      totalTests: 0,
      successfulTests: 0,
      failedTests: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      startTime: new Date(),
    }
    this.startTime = new Date()
  }

  abstract run(): Promise<TestResult>

  protected async measureLatency<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; latency: number }> {
    const start = Date.now()
    const result = await operation()
    const latency = Date.now() - start

    this.updateLatencyStats(latency)
    return { result, latency }
  }

  private updateLatencyStats(latency: number): void {
    this.stats.totalTests++
    this.stats.maxLatency = Math.max(this.stats.maxLatency, latency)
    this.stats.minLatency = Math.min(this.stats.minLatency, latency)

    // 计算移动平均延迟
    const totalLatency =
      this.stats.averageLatency * (this.stats.totalTests - 1) + latency
    this.stats.averageLatency = totalLatency / this.stats.totalTests
  }

  protected recordSuccess(): void {
    this.stats.successfulTests++
  }

  protected recordFailure(): void {
    this.stats.failedTests++
  }

  protected createResult(
    success: boolean,
    error?: string,
    details?: any
  ): TestResult {
    const duration = Date.now() - this.startTime.getTime()

    return {
      testName: this.testName,
      success,
      duration,
      error,
      details: {
        ...details,
        stats: this.stats,
      },
    }
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  protected logProgress(current: number, total: number): void {
    const percentage = Math.round((current / total) * 100)
    logger.info(
      `${this.testName} Progress: ${current}/${total} (${percentage}%)`
    )
  }

  getStats(): TestStats {
    return { ...this.stats, endTime: new Date() }
  }
}
