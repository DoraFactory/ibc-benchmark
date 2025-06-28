import { BaseTest } from './BaseTest'
import { CosmosClient } from '../clients/CosmosClient'
import { TestResult, TestConfig } from '../types'
import { logger } from '../utils/logger'

export class ConnectionStabilityTest extends BaseTest {
  private clientA: CosmosClient
  private clientB: CosmosClient

  constructor(private config: TestConfig) {
    super('IBC Connection Stability Test')
    this.clientA = new CosmosClient(config.chainA)
    this.clientB = new CosmosClient(config.chainB)
  }

  async run(): Promise<TestResult> {
    logger.title(`Starting ${this.testName}`)

    try {
      // 连接到两个链
      await this.setupClients()

      // 测试连接稳定性
      const connectionTests = await this.testConnectionStability()
      const healthTests = await this.testHealthMonitoring()
      const reconnectionTests = await this.testReconnection()

      const allTestsPassed = connectionTests && healthTests && reconnectionTests

      if (allTestsPassed) {
        this.recordSuccess()
        logger.success(`${this.testName} completed successfully`)
      } else {
        this.recordFailure()
        logger.error(`${this.testName} failed`)
      }

      return this.createResult(allTestsPassed, undefined, {
        connectionTests,
        healthTests,
        reconnectionTests,
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
    logger.info('Setting up clients...')

    await Promise.all([this.clientA.connect(), this.clientB.connect()])

    await Promise.all([
      this.clientA.setupWallet(this.config.test.mnemonic),
      this.clientB.setupWallet(this.config.test.mnemonic),
    ])

    logger.success('Clients setup completed')
  }

  private async testConnectionStability(): Promise<boolean> {
    logger.info('Testing connection stability...')

    const testDuration = 5 * 60 * 1000 // 5 minutes
    const checkInterval = 30 * 1000 // 30 seconds
    const startTime = Date.now()
    let checks = 0
    let failures = 0

    while (Date.now() - startTime < testDuration) {
      try {
        const { latency: latencyA } = await this.measureLatency(() =>
          this.clientA.getHeight()
        )
        const { latency: latencyB } = await this.measureLatency(() =>
          this.clientB.getHeight()
        )

        checks++
        logger.debug(`Connection check ${checks}`, {
          chainALatency: latencyA,
          chainBLatency: latencyB,
        })

        // 检查延迟是否过高
        if (latencyA > 5000 || latencyB > 5000) {
          failures++
          logger.warn(`High latency detected: A=${latencyA}ms, B=${latencyB}ms`)
        }
      } catch (error) {
        failures++
        logger.warn(`Connection check failed`, error)
      }

      await this.sleep(checkInterval)
    }

    const failureRate = failures / checks
    const passed = failureRate < 0.1 // 允许10%的失败率

    logger.info(`Connection stability test completed`, {
      totalChecks: checks,
      failures,
      failureRate: `${(failureRate * 100).toFixed(2)}%`,
      passed,
    })

    return passed
  }

  private async testHealthMonitoring(): Promise<boolean> {
    logger.info('Testing health monitoring...')

    try {
      const healthA = await this.clientA.isHealthy()
      const healthB = await this.clientB.isHealthy()

      if (!healthA || !healthB) {
        logger.error('Health check failed', { healthA, healthB })
        return false
      }

      // 测试IBC连接状态
      const connectionsA = await this.clientA.getIBCConnections()
      const connectionsB = await this.clientB.getIBCConnections()

      logger.info('Health monitoring test completed', {
        chainAHealthy: healthA,
        chainBHealthy: healthB,
        connectionsA: connectionsA.length,
        connectionsB: connectionsB.length,
      })

      return true
    } catch (error) {
      logger.error('Health monitoring test failed', error)
      return false
    }
  }

  private async testReconnection(): Promise<boolean> {
    logger.info('Testing reconnection capability...')

    try {
      // 断开连接
      await this.clientA.disconnect()
      await this.sleep(2000)

      // 重新连接
      await this.clientA.connect()
      await this.clientA.setupWallet(this.config.test.mnemonic)

      // 验证重连后的健康状态
      const isHealthy = await this.clientA.isHealthy()

      logger.info('Reconnection test completed', { success: isHealthy })
      return isHealthy
    } catch (error) {
      logger.error('Reconnection test failed', error)
      return false
    }
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up connection stability test...')
    await Promise.all([
      this.clientA.disconnect().catch(() => {}),
      this.clientB.disconnect().catch(() => {}),
    ])
  }
}
