import { BaseTest } from './BaseTest'
import { CosmosClient } from '../clients/CosmosClient'
import { TestResult, TestConfig } from '../types'
import { logger } from '../utils/logger'

export class PerformanceTest extends BaseTest {
  private clientA: CosmosClient
  private clientB: CosmosClient

  constructor(private config: TestConfig) {
    super('IBC Performance Test')
    this.clientA = new CosmosClient(config.chainA)
    this.clientB = new CosmosClient(config.chainB)
  }

  async run(): Promise<TestResult> {
    logger.title(`Starting ${this.testName}`)

    try {
      await this.setupClients()

      const throughputTest = await this.testThroughput()
      const concurrencyTest = await this.testConcurrency()
      const latencyTest = await this.testLatency()

      const allTestsPassed = throughputTest && concurrencyTest && latencyTest

      if (allTestsPassed) {
        this.recordSuccess()
        logger.success(`${this.testName} completed successfully`)
      } else {
        this.recordFailure()
        logger.error(`${this.testName} failed`)
      }

      return this.createResult(allTestsPassed, undefined, {
        throughputTest,
        concurrencyTest,
        latencyTest,
      })
    } catch (error) {
      this.recordFailure()
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error(`${this.testName} failed with error`, error)
      return this.createResult(false, errorMessage)
    } finally {
      await this.cleanup()
    }
  }

  private async setupClients(): Promise<void> {
    logger.info('Setting up clients for performance test...')

    await Promise.all([this.clientA.connect(), this.clientB.connect()])

    await Promise.all([
      this.clientA.setupWallet(this.config.test.mnemonic),
      this.clientB.setupWallet(this.config.test.mnemonic),
    ])

    logger.success('Clients setup completed')
  }

  private async testThroughput(): Promise<boolean> {
    logger.info('Testing throughput...')

    const testDuration = 5 * 60 * 1000 // 5 minutes
    const startTime = Date.now()
    let totalQueries = 0

    while (Date.now() - startTime < testDuration) {
      try {
        await Promise.all([
          this.clientA.getHeight(),
          this.clientB.getHeight(),
          this.clientA.getIBCConnections(),
          this.clientB.getIBCConnections(),
        ])

        totalQueries += 4

        if (totalQueries % 100 === 0) {
          this.logProgress(Date.now() - startTime, testDuration)
        }
      } catch (error) {
        logger.warn('Query failed during throughput test', error)
      }

      await this.sleep(100)
    }

    const actualDuration = Date.now() - startTime
    const throughput = totalQueries / (actualDuration / 1000)

    logger.info('Throughput test completed', {
      totalQueries,
      duration: actualDuration,
      throughput: `${throughput.toFixed(2)} queries/sec`,
    })

    return throughput > 1 // 至少1 query/sec
  }

  private async testConcurrency(): Promise<boolean> {
    logger.info('Testing concurrency...')

    const concurrentRequests = this.config.test.maxConcurrentTxs
    const promises: Promise<any>[] = []

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(this.measureLatency(() => this.clientA.getHeight()))
    }

    try {
      const results = await Promise.all(promises)
      const averageLatency =
        results.reduce((sum, r) => sum + r.latency, 0) / results.length

      logger.info('Concurrency test completed', {
        concurrentRequests,
        averageLatency,
        maxLatency: Math.max(...results.map((r) => r.latency)),
        minLatency: Math.min(...results.map((r) => r.latency)),
      })

      return averageLatency < 5000 // 平均延迟小于5秒
    } catch (error) {
      logger.error('Concurrency test failed', error)
      return false
    }
  }

  private async testLatency(): Promise<boolean> {
    logger.info('Testing latency...')

    const samples = 100
    const latencies: number[] = []

    for (let i = 0; i < samples; i++) {
      try {
        const { latency } = await this.measureLatency(() =>
          this.clientA.getHeight()
        )
        latencies.push(latency)

        if (i % 10 === 0) {
          this.logProgress(i, samples)
        }
      } catch (error) {
        logger.warn(`Latency test sample ${i} failed`, error)
      }
    }

    if (latencies.length === 0) {
      logger.error('No successful latency samples')
      return false
    }

    const avgLatency =
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length
    const maxLatency = Math.max(...latencies)
    const minLatency = Math.min(...latencies)
    const p95Latency = latencies.sort((a, b) => a - b)[
      Math.floor(latencies.length * 0.95)
    ]

    logger.info('Latency test completed', {
      samples: latencies.length,
      averageLatency: avgLatency,
      maxLatency,
      minLatency,
      p95Latency,
    })

    return avgLatency < 2000 && p95Latency < 5000 // 平均延迟<2s, P95<5s
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up performance test...')
    await Promise.all([
      this.clientA.disconnect().catch(() => {}),
      this.clientB.disconnect().catch(() => {}),
    ])
  }
}
