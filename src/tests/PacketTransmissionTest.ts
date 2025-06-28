import { BaseTest } from './BaseTest'
import { CosmosClient } from '../clients/CosmosClient'
import { TestResult, TestConfig } from '../types'
import { logger } from '../utils/logger'
import { coins } from '@cosmjs/stargate'

export class PacketTransmissionTest extends BaseTest {
  private clientA: CosmosClient
  private clientB: CosmosClient

  constructor(private config: TestConfig) {
    super('IBC Packet Transmission Test')
    this.clientA = new CosmosClient(config.chainA)
    this.clientB = new CosmosClient(config.chainB)
  }

  async run(): Promise<TestResult> {
    logger.title(`Starting ${this.testName}`)

    try {
      await this.setupClients()

      const singleTransferTest = await this.testSingleTransfer()
      const batchTransferTest = await this.testBatchTransfer()
      const timeoutTest = await this.testTimeoutHandling()

      const allTestsPassed =
        singleTransferTest && batchTransferTest && timeoutTest

      if (allTestsPassed) {
        this.recordSuccess()
        logger.success(`${this.testName} completed successfully`)
      } else {
        this.recordFailure()
        logger.error(`${this.testName} failed`)
      }

      return this.createResult(allTestsPassed, undefined, {
        singleTransferTest,
        batchTransferTest,
        timeoutTest,
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
    logger.info('Setting up clients for packet transmission test...')

    await Promise.all([this.clientA.connect(), this.clientB.connect()])

    await Promise.all([
      this.clientA.setupWallet(this.config.test.mnemonic),
      this.clientB.setupWallet(this.config.test.mnemonic),
    ])

    logger.success('Clients setup completed')
  }

  private async testSingleTransfer(): Promise<boolean> {
    logger.info('Testing single IBC transfer...')

    try {
      const signingClient = this.clientA.getSigningClient()
      const senderAddress = this.clientA.getAddress()

      if (!signingClient || !senderAddress) {
        throw new Error('Client not properly initialized')
      }

      const recipientAddress = this.clientB.getAddress()
      if (!recipientAddress) {
        throw new Error('Recipient address not available')
      }

      // 检查初始余额
      const initialBalance = await this.clientA.getBalance()
      logger.debug('Initial balance', { balance: initialBalance })

      // 构造 IBC 转账消息
      const transferMsg = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sourcePort: this.config.ibc.portId,
          sourceChannel: this.config.ibc.channelId,
          token: coins(1000, 'stake')[0],
          sender: senderAddress,
          receiver: recipientAddress,
          timeoutHeight: {
            revisionNumber: 0,
            revisionHeight: this.config.ibc.packetTimeoutHeight,
          },
          timeoutTimestamp: this.config.ibc.packetTimeoutTimestamp,
        },
      }

      // 执行转账并测量延迟
      const { result: txResult, latency } = await this.measureLatency(
        async () => {
          return await signingClient.signAndBroadcast(
            senderAddress,
            [transferMsg],
            'auto',
            'IBC transfer test'
          )
        }
      )

      if (txResult.code !== 0) {
        logger.error('Transfer transaction failed', {
          code: txResult.code,
          rawLog: txResult.rawLog,
        })
        return false
      }

      logger.success('Single IBC transfer completed', {
        txHash: txResult.transactionHash,
        latency,
        gasUsed: txResult.gasUsed,
        gasWanted: txResult.gasWanted,
      })

      return true
    } catch (error) {
      logger.error('Single transfer test failed', error)
      return false
    }
  }

  private async testBatchTransfer(): Promise<boolean> {
    logger.info('Testing batch IBC transfers...')

    const batchSize = Math.min(this.config.test.maxConcurrentTxs, 5)
    const promises: Promise<boolean>[] = []

    for (let i = 0; i < batchSize; i++) {
      promises.push(this.executeSingleTransfer(i))
      await this.sleep(100) // 小延迟避免nonce冲突
    }

    try {
      const results = await Promise.all(promises)
      const successCount = results.filter((r) => r).length
      const successRate = successCount / batchSize

      logger.info('Batch transfer test completed', {
        total: batchSize,
        successful: successCount,
        successRate: `${(successRate * 100).toFixed(2)}%`,
      })

      return successRate >= 0.8 // 80%成功率
    } catch (error) {
      logger.error('Batch transfer test failed', error)
      return false
    }
  }

  private async executeSingleTransfer(index: number): Promise<boolean> {
    try {
      const signingClient = this.clientA.getSigningClient()
      const senderAddress = this.clientA.getAddress()
      const recipientAddress = this.clientB.getAddress()

      if (!signingClient || !senderAddress || !recipientAddress) {
        return false
      }

      const transferMsg = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sourcePort: this.config.ibc.portId,
          sourceChannel: this.config.ibc.channelId,
          token: coins(100, 'stake')[0],
          sender: senderAddress,
          receiver: recipientAddress,
          timeoutHeight: {
            revisionNumber: 0,
            revisionHeight: this.config.ibc.packetTimeoutHeight,
          },
          timeoutTimestamp: this.config.ibc.packetTimeoutTimestamp,
        },
      }

      const txResult = await signingClient.signAndBroadcast(
        senderAddress,
        [transferMsg],
        'auto',
        `Batch transfer ${index}`
      )

      const success = txResult.code === 0

      if (success) {
        logger.debug(`Batch transfer ${index} succeeded`, {
          txHash: txResult.transactionHash,
        })
      } else {
        logger.warn(`Batch transfer ${index} failed`, {
          code: txResult.code,
          rawLog: txResult.rawLog,
        })
      }

      return success
    } catch (error) {
      logger.warn(`Batch transfer ${index} failed with error`, error)
      return false
    }
  }

  private async testTimeoutHandling(): Promise<boolean> {
    logger.info('Testing timeout handling...')

    try {
      const signingClient = this.clientA.getSigningClient()
      const senderAddress = this.clientA.getAddress()
      const recipientAddress = this.clientB.getAddress()

      if (!signingClient || !senderAddress || !recipientAddress) {
        throw new Error('Client not properly initialized')
      }

      // 使用很短的超时时间来故意触发超时
      const transferMsg = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sourcePort: this.config.ibc.portId,
          sourceChannel: this.config.ibc.channelId,
          token: coins(100, 'stake')[0],
          sender: senderAddress,
          receiver: recipientAddress,
          timeoutHeight: {
            revisionNumber: 0,
            revisionHeight: 1, // 非常低的高度，应该会立即超时
          },
          timeoutTimestamp: Date.now() * 1000000 + 1000000000, // 1秒后超时
        },
      }

      const txResult = await signingClient.signAndBroadcast(
        senderAddress,
        [transferMsg],
        'auto',
        'Timeout test transfer'
      )

      // 对于超时测试，我们检查交易是否被正确处理
      // 即使包会超时，初始提交应该成功
      const success = txResult.code === 0

      logger.info('Timeout handling test completed', {
        txHash: txResult.transactionHash,
        success,
        note: 'Packet will timeout, but initial submission should succeed',
      })

      return success
    } catch (error) {
      logger.error('Timeout handling test failed', error)
      return false
    }
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up packet transmission test...')
    await Promise.all([
      this.clientA.disconnect().catch(() => {}),
      this.clientB.disconnect().catch(() => {}),
    ])
  }
}
