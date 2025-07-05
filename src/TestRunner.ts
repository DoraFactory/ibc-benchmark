import { TestConfig, TestResult, RelayerTestConfig } from './types'
import {
  ConnectionStabilityTest,
  PacketTransmissionTest,
  PerformanceTest,
  IBCRelayerTest,
} from './tests'
import { logger } from './utils/logger'
import { config, relayerConfig } from './config'
import { ReportGenerator } from './utils/ReportGenerator'

export class TestRunner {
  private results: TestResult[] = []

  constructor(private testConfig: TestConfig) {}

  async runAllTests(): Promise<TestResult[]> {
    logger.title('Starting IBC Stability Test Suite')

    const tests = [
      new ConnectionStabilityTest(this.testConfig),
      new PacketTransmissionTest(this.testConfig),
      new PerformanceTest(this.testConfig),
    ]

    for (const test of tests) {
      try {
        logger.separator()
        const result = await test.run()
        this.results.push(result)

        if (result.success) {
          logger.success(`✓ ${result.testName} passed`)
        } else {
          logger.error(`✗ ${result.testName} failed: ${result.error}`)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logger.error(`Test runner error: ${errorMessage}`)

        this.results.push({
          testName: test.constructor.name,
          success: false,
          duration: 0,
          error: errorMessage,
        })
      }
    }

    this.printSummary()
    return this.results
  }

  async runSingleTest(testName: string): Promise<TestResult | null> {
    let test

    switch (testName.toLowerCase()) {
      case 'connection':
      case 'stability':
        test = new ConnectionStabilityTest(this.testConfig)
        break
      case 'packet':
      case 'transmission':
        test = new PacketTransmissionTest(this.testConfig)
        break
      case 'performance':
      case 'perf':
        test = new PerformanceTest(this.testConfig)
        break
      case 'relayer':
      case 'ibc-relayer':
        test = new IBCRelayerTest(relayerConfig)
        break
      default:
        logger.error(`Unknown test: ${testName}`)
        return null
    }

    try {
      const result = await test.run()
      this.results.push(result)

      if (result.success) {
        logger.success(`✓ ${result.testName} passed`)
      } else {
        logger.error(`✗ ${result.testName} failed: ${result.error}`)
      }

      return result
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error(`Test execution error: ${errorMessage}`)
      return null
    }
  }

  async runRelayerTest(): Promise<TestResult> {
    logger.title('Starting IBC Relayer Test')

    const relayerTest = new IBCRelayerTest(relayerConfig)

    try {
      const result = await relayerTest.run()
      this.results.push(result)

      // 生成测试报告
      if (result.details && result.details.metrics) {
        const reportGenerator = new ReportGenerator(
          relayerTest.getRelayerLogs(),
          result.details.metrics
        )
        reportGenerator.saveReports()

        logger.info('📊 Test reports generated successfully')
      }

      if (result.success) {
        logger.success(`✓ ${result.testName} passed`)
      } else {
        logger.error(`✗ ${result.testName} failed: ${result.error}`)
      }

      return result
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error(`Relayer test execution error: ${errorMessage}`)

      const failureResult: TestResult = {
        testName: 'IBC Relayer Test',
        success: false,
        duration: 0,
        error: errorMessage,
      }

      this.results.push(failureResult)
      return failureResult
    }
  }

  async runContinuousRelayerTest(intervalHours: number = 1): Promise<void> {
    logger.title(
      `Starting Continuous IBC Relayer Test (every ${intervalHours} hour(s))`
    )

    const intervalMs = intervalHours * 60 * 60 * 1000

    while (true) {
      try {
        logger.info(
          `🔄 Starting scheduled relayer test at ${new Date().toLocaleString()}`
        )

        const relayerTest = new IBCRelayerTest(relayerConfig)
        const singleTestLog = await relayerTest.runSingleTransferTest()

        logger.info(
          `Test completed: ${singleTestLog.success ? 'SUCCESS' : 'FAILED'}`
        )
        logger.info(`Latency: ${singleTestLog.latency}ms`)
        logger.info(`Relayer: ${singleTestLog.memoIdentifier || 'Unknown'}`)
        logger.info(`Signer: ${singleTestLog.relayerSigner || 'Unknown'}`)

        // 生成简化报告
        const reportGenerator = new ReportGenerator(
          relayerTest.getRelayerLogs(),
          relayerTest.getPerformanceMetrics()
        )

        const summary = reportGenerator.generateJSONSummary()
        logger.info(
          `Current success rate: ${summary.summary.successRate.toFixed(1)}%`
        )
      } catch (error) {
        logger.error('Continuous test iteration failed:', error)
      }

      logger.info(`⏰ Next test scheduled in ${intervalHours} hour(s)`)
      await this.sleep(intervalMs)
    }
  }

  private printSummary(): void {
    logger.separator()
    logger.title('Test Summary')

    const totalTests = this.results.length
    const passedTests = this.results.filter((r) => r.success).length
    const failedTests = totalTests - passedTests
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0)

    logger.info(`Total Tests: ${totalTests}`)
    logger.info(`Passed: ${passedTests}`)
    logger.info(`Failed: ${failedTests}`)
    logger.info(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`)
    logger.info(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`
    )

    if (failedTests > 0) {
      logger.separator()
      logger.error('Failed Tests:')
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          logger.error(`  - ${r.testName}: ${r.error}`)
        })
    }

    logger.separator()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getResults(): TestResult[] {
    return [...this.results]
  }
}

export default TestRunner
