#!/usr/bin/env node

import { Command } from 'commander'
import { config } from './config'
import { logger } from './utils/logger'
import TestRunner from './TestRunner'

const program = new Command()

program
  .name('ibc-stability-test')
  .description('IBC Service Stability Testing Framework')
  .version('1.0.0')

program
  .command('run-all')
  .description('Run all stability tests')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLogLevel('debug')
    }

    try {
      const runner = new TestRunner(config)
      const results = await runner.runAllTests()

      const failedTests = results.filter((r) => !r.success).length
      process.exit(failedTests > 0 ? 1 : 0)
    } catch (error) {
      logger.error('Failed to run tests', error)
      process.exit(1)
    }
  })

program
  .command('run')
  .description('Run a specific test')
  .argument('<test-name>', 'Test name (connection|packet|performance|relayer)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (testName, options) => {
    if (options.verbose) {
      logger.setLogLevel('debug')
    }

    try {
      const runner = new TestRunner(config)
      const result = await runner.runSingleTest(testName)

      if (!result) {
        process.exit(1)
      }

      process.exit(result.success ? 0 : 1)
    } catch (error) {
      logger.error('Failed to run test', error)
      process.exit(1)
    }
  })

program
  .command('relayer-test')
  .description('Run comprehensive IBC relayer test')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--continuous', 'Run continuous testing')
  .option(
    '--interval <hours>',
    'Test interval in hours for continuous mode',
    '1'
  )
  .action(async (options) => {
    if (options.verbose) {
      logger.setLogLevel('debug')
    }

    try {
      const runner = new TestRunner(config)

      if (options.continuous) {
        const intervalHours = parseInt(options.interval)
        logger.info(
          `Starting continuous relayer test with ${intervalHours}h interval`
        )
        await runner.runContinuousRelayerTest(intervalHours)
      } else {
        const result = await runner.runRelayerTest()
        process.exit(result.success ? 0 : 1)
      }
    } catch (error) {
      logger.error('Failed to run relayer test', error)
      process.exit(1)
    }
  })

program
  .command('single-transfer')
  .description('Run a single IBC transfer test')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLogLevel('debug')
    }

    try {
      const { IBCRelayerTest } = await import('./tests/IBCRelayerTest')
      const { relayerConfig } = await import('./config')

      const relayerTest = new IBCRelayerTest(relayerConfig)
      const log = await relayerTest.runSingleTransferTest()

      logger.info('Single Transfer Test Result:')
      logger.info(`  Success: ${log.success ? '✅' : '❌'}`)
      logger.info(`  TX Hash: ${log.txHash}`)
      logger.info(`  Latency: ${log.latency}ms`)
      logger.info(`  Relayer: ${log.memoIdentifier || 'Unknown'}`)
      logger.info(`  Signer: ${log.relayerSigner || 'Unknown'}`)

      if (!log.success) {
        logger.error(`  Error: ${log.errorMessage}`)
      }

      process.exit(log.success ? 0 : 1)
    } catch (error) {
      logger.error('Failed to run single transfer test')

      // 添加详细的错误信息
      if (error instanceof Error) {
        logger.error(`Error name: ${error.name}`)
        logger.error(`Error message: ${error.message}`)
        if (error.stack) {
          logger.error(`Error stack: ${error.stack}`)
        }
      } else {
        logger.error(`Unknown error type: ${typeof error}`)
        logger.error(`Error value: ${JSON.stringify(error, null, 2)}`)
      }

      // 如果是对象，尝试展示更多信息
      if (typeof error === 'object' && error !== null) {
        logger.error(`Error properties:`)
        for (const [key, value] of Object.entries(error)) {
          logger.error(`  ${key}: ${value}`)
        }
      }

      process.exit(1)
    }
  })

program
  .command('continuous-transfer')
  .description('Run continuous IBC transfer tests')
  .option('-v, --verbose', 'Enable verbose logging')
  .option(
    '-i, --interval <seconds>',
    'Interval between transfers in seconds',
    '30'
  )
  .option(
    '-c, --count <number>',
    'Maximum number of transfers (0 = unlimited)',
    '0'
  )
  .option('--stop-on-error', 'Stop testing when an error occurs')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLogLevel('debug')
    }

    const interval = parseInt(options.interval)
    const maxCount = parseInt(options.count)
    const stopOnError = options.stopOnError

    if (interval < 5) {
      logger.error(
        'Minimum interval is 5 seconds to avoid overwhelming the network'
      )
      process.exit(1)
    }

    try {
      const { IBCRelayerTest } = await import('./tests/IBCRelayerTest')
      const { relayerConfig } = await import('./config')

      const relayerTest = new IBCRelayerTest(relayerConfig)

      logger.info('🔄 Starting continuous IBC transfer tests...')
      logger.info(`   Interval: ${interval} seconds`)
      logger.info(`   Max count: ${maxCount === 0 ? 'unlimited' : maxCount}`)
      logger.info(`   Stop on error: ${stopOnError ? 'yes' : 'no'}`)
      logger.info('   Press Ctrl+C to stop')
      logger.separator()

      let count = 0
      let successCount = 0
      let errorCount = 0

      // 处理Ctrl+C优雅退出
      let isShuttingDown = false
      process.on('SIGINT', () => {
        if (isShuttingDown) {
          logger.info('\n💥 Force exit...')
          process.exit(1)
        }

        isShuttingDown = true
        logger.info('\n🛑 Received stop signal, finishing current test...')
        logger.info('   Press Ctrl+C again to force exit')
      })

      while (!isShuttingDown && (maxCount === 0 || count < maxCount)) {
        count++
        const testStartTime = Date.now()

        logger.info(`\n📡 Test #${count} starting...`)

        try {
          const log = await relayerTest.runSingleTransferTest()

          if (log.success) {
            successCount++
            logger.info(`✅ Test #${count} completed successfully`)
            logger.info(`   TX Hash: ${log.txHash}`)
            logger.info(`   Latency: ${log.latency}ms`)
            logger.info(`   Relayer: ${log.memoIdentifier || 'Unknown'}`)
            logger.info(`   Signer: ${log.relayerSigner || 'Unknown'}`)
          } else {
            errorCount++
            logger.error(`❌ Test #${count} failed: ${log.errorMessage}`)

            if (stopOnError) {
              logger.error('Stopping due to --stop-on-error flag')
              break
            }
          }
        } catch (error) {
          errorCount++
          logger.error(`❌ Test #${count} crashed:`, error)

          if (stopOnError) {
            logger.error('Stopping due to --stop-on-error flag')
            break
          }
        }

        // 显示统计信息
        const successRate = ((successCount / count) * 100).toFixed(1)
        logger.info(
          `📊 Stats: ${successCount}/${count} success (${successRate}%), ${errorCount} errors`
        )

        // 如果还有更多测试要运行，等待间隔时间
        if (!isShuttingDown && (maxCount === 0 || count < maxCount)) {
          const testDuration = Date.now() - testStartTime
          const waitTime = Math.max(0, interval * 1000 - testDuration)

          if (waitTime > 0) {
            logger.info(
              `⏳ Waiting ${Math.ceil(waitTime / 1000)}s until next test...`
            )
            await new Promise((resolve) => {
              const timeout = setTimeout(resolve, waitTime)
              // 允许Ctrl+C中断等待
              const checkShutdown = setInterval(() => {
                if (isShuttingDown) {
                  clearTimeout(timeout)
                  clearInterval(checkShutdown)
                  resolve(undefined)
                }
              }, 100)
            })
          }
        }
      }

      logger.separator()
      logger.info('🏁 Continuous testing completed')
      logger.info(`   Total tests: ${count}`)
      logger.info(`   Successful: ${successCount}`)
      logger.info(`   Failed: ${errorCount}`)
      logger.info(
        `   Success rate: ${((successCount / count) * 100).toFixed(1)}%`
      )

      process.exit(errorCount === 0 ? 0 : 1)
    } catch (error) {
      logger.error('Failed to run continuous transfer tests:', error)
      process.exit(1)
    }
  })

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    logger.info('Current Configuration:')
    logger.info('Chain A:', {
      rpc: config.chainA.rpc,
      chainId: config.chainA.chainId,
      prefix: config.chainA.prefix,
    })
    logger.info('Chain B:', {
      rpc: config.chainB.rpc,
      chainId: config.chainB.chainId,
      prefix: config.chainB.prefix,
    })
    logger.info('IBC Config:', {
      connectionId: config.ibc.connectionId,
      channelId: config.ibc.channelId,
      portId: config.ibc.portId,
    })
    logger.info('Test Config:', {
      durationMinutes: config.test.durationMinutes,
      maxConcurrentTxs: config.test.maxConcurrentTxs,
    })
  })

program
  .command('show-logs')
  .description('Show recent relayer test logs')
  .option('--count <number>', 'Number of recent logs to show', '10')
  .action(async (options) => {
    try {
      const { IBCRelayerTest } = await import('./tests/IBCRelayerTest')
      const { relayerConfig } = await import('./config')

      const relayerTest = new IBCRelayerTest(relayerConfig)
      const logs = relayerTest.getRelayerLogs()
      const count = parseInt(options.count)

      if (logs.length === 0) {
        logger.info('No test logs found')
        return
      }

      logger.info(`📊 Recent ${Math.min(count, logs.length)} test logs:`)
      logger.separator()

      const recentLogs = logs.slice(-count).reverse()
      recentLogs.forEach((log, index) => {
        const status = log.success ? '✅ SUCCESS' : '❌ FAILED'
        const relayer =
          log.memoIdentifier?.replace('relayed-by:', '') || 'Unknown'

        logger.info(
          `${index + 1}. ${log.testTime.toLocaleString()} - ${status}`
        )
        logger.info(`   Latency: ${log.latency}ms | Relayer: ${relayer}`)
        logger.info(
          `   TX: ${log.txHash.slice(0, 16)}... | Seq: ${log.packetSequence}`
        )

        if (!log.success && log.errorMessage) {
          logger.error(`   Error: ${log.errorMessage}`)
        }

        if (index < recentLogs.length - 1) {
          logger.info('')
        }
      })
    } catch (error) {
      logger.error('Failed to show logs', error)
      process.exit(1)
    }
  })

program
  .command('generate-report')
  .description('Generate HTML and Markdown reports from existing test data')
  .action(async () => {
    try {
      const { IBCRelayerTest } = await import('./tests/IBCRelayerTest')
      const { ReportGenerator } = await import('./utils/ReportGenerator')
      const { relayerConfig } = await import('./config')

      const relayerTest = new IBCRelayerTest(relayerConfig)
      const logs = relayerTest.getRelayerLogs()
      const metrics = relayerTest.getPerformanceMetrics()

      if (logs.length === 0) {
        logger.warn('No test data found to generate report')
        return
      }

      const reportGenerator = new ReportGenerator(logs, metrics)
      reportGenerator.saveReports()

      logger.success('Reports generated successfully! 📊')
    } catch (error) {
      logger.error('Failed to generate report', error)
      process.exit(1)
    }
  })

program
  .command('regenerate-metrics')
  .description('Regenerate metrics file from existing test logs')
  .action(async () => {
    try {
      const { IBCRelayerTest } = await import('./tests/IBCRelayerTest')
      const { relayerConfig } = await import('./config')
      const { writeFileSync } = await import('fs')

      const relayerTest = new IBCRelayerTest(relayerConfig)
      const logs = relayerTest.getRelayerLogs()

      if (logs.length === 0) {
        logger.warn('No test logs found to regenerate metrics')
        logger.info(
          'Make sure relayer-test-logs.json exists and contains test data'
        )
        return
      }

      // 重新计算metrics
      const metrics = relayerTest.getPerformanceMetrics()

      // 保存到文件
      const metricsFile = 'relayer-metrics.json'
      writeFileSync(metricsFile, JSON.stringify(metrics, null, 2))

      logger.success(`✅ Metrics regenerated successfully!`)
      logger.info(
        `📊 Generated metrics for ${metrics.length} relayers from ${logs.length} test logs`
      )
      logger.info(`💾 Saved to: ${metricsFile}`)

      // 显示简要统计
      metrics.forEach((metric, index) => {
        logger.info(`${index + 1}. ${metric.validatorMoniker}`)
        logger.info(
          `   Tests: ${
            metric.totalTests
          }, Success Rate: ${metric.successRate.toFixed(1)}%`
        )
      })
    } catch (error) {
      logger.error('Failed to regenerate metrics', error)
      process.exit(1)
    }
  })

program
  .command('health')
  .description('Check health of both chains')
  .action(async () => {
    const { CosmosClient } = await import('./clients/CosmosClient')

    const clientA = new CosmosClient(config.chainA)
    const clientB = new CosmosClient(config.chainB)

    try {
      await Promise.all([clientA.connect(), clientB.connect()])

      const [healthA, healthB] = await Promise.all([
        clientA.isHealthy(),
        clientB.isHealthy(),
      ])

      const [heightA, heightB] = await Promise.all([
        clientA.getHeight(),
        clientB.getHeight(),
      ])

      logger.info('Health Check Results:')
      logger.info(`Chain A (${config.chainA.chainId}):`, {
        healthy: healthA,
        height: heightA,
        rpc: config.chainA.rpc,
      })
      logger.info(`Chain B (${config.chainB.chainId}):`, {
        healthy: healthB,
        height: heightB,
        rpc: config.chainB.rpc,
      })

      const overallHealth = healthA && healthB
      if (overallHealth) {
        logger.success('Both chains are healthy!')
      } else {
        logger.error('One or more chains are unhealthy!')
      }

      await Promise.all([clientA.disconnect(), clientB.disconnect()])

      process.exit(overallHealth ? 0 : 1)
    } catch (error) {
      logger.error('Health check failed', error)
      process.exit(1)
    }
  })

program
  .command('query-ibc')
  .description('Query IBC connections and channels')
  .action(async () => {
    try {
      logger.info('🔍 Querying IBC connections and channels...')

      // 尝试使用REST API查询连接
      try {
        logger.info('🌐 Querying connections via REST API...')

        const rpcUrl = config.chainA.rpc
          .replace('/rpc', '')
          .replace('https://', 'https://')
        const connectionsUrl = `${rpcUrl}/ibc/core/connection/v1/connections`

        logger.info(`Fetching from: ${connectionsUrl}`)

        const response = await fetch(connectionsUrl)
        if (response.ok) {
          const data = (await response.json()) as any
          logger.info('Chain A connections via REST:')
          if (data.connections && Array.isArray(data.connections)) {
            data.connections.forEach((conn: any, index: number) => {
              logger.info(`  ${index + 1}. Connection ID: ${conn.id}`)
              logger.info(`     Client ID: ${conn.client_id}`)
              logger.info(`     State: ${conn.state}`)
              if (conn.counterparty) {
                logger.info(
                  `     Counterparty: ${conn.counterparty.connection_id} (client: ${conn.counterparty.client_id})`
                )
              }
              logger.info('')
            })
          } else {
            logger.info('No connections found')
          }
        } else {
          logger.warn(`REST API returned status: ${response.status}`)
        }
      } catch (error) {
        logger.error('Connections query failed:', error)
      }

      // 查询channels
      try {
        logger.info('🌐 Querying channels via REST API...')

        const rpcUrl = config.chainA.rpc
          .replace('/rpc', '')
          .replace('https://', 'https://')
        const channelsUrl = `${rpcUrl}/ibc/core/channel/v1/channels`

        logger.info(`Fetching from: ${channelsUrl}`)

        const response = await fetch(channelsUrl)
        if (response.ok) {
          const data = (await response.json()) as any
          logger.info('Chain A channels via REST:')
          if (data.channels && Array.isArray(data.channels)) {
            data.channels.forEach((channel: any, index: number) => {
              logger.info(`  ${index + 1}. Channel ID: ${channel.channel_id}`)
              logger.info(`     Port ID: ${channel.port_id}`)
              logger.info(`     State: ${channel.state}`)
              if (
                channel.connection_hops &&
                channel.connection_hops.length > 0
              ) {
                logger.info(`     Connection ID: ${channel.connection_hops[0]}`)
              }
              if (channel.counterparty) {
                logger.info(
                  `     Counterparty: ${channel.counterparty.channel_id} (port: ${channel.counterparty.port_id})`
                )
              }
              logger.info('')
            })
          } else {
            logger.info('No channels found')
          }
        } else {
          logger.warn(`REST API returned status: ${response.status}`)
        }
      } catch (error) {
        logger.error('Channels query failed:', error)
      }
    } catch (error) {
      logger.error('Failed to query IBC info:', error)
      process.exit(1)
    }
  })

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { promise, reason })
  process.exit(1)
})

// Parse command line arguments
program.parse()

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
