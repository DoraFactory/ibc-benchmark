import { BaseTest } from './BaseTest'
import {
  RelayerTestConfig,
  TestResult,
  IBCTransferResult,
  PacketAcknowledgement,
  RelayerTestLog,
  RelayerPerformanceMetrics,
} from '../types'
import { CosmosClient } from '../clients/CosmosClient'
import { logger } from '../utils/logger'
import { IBCQueryHelper } from '../utils/IBCQueryHelper'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'

export class IBCRelayerTest extends BaseTest {
  private votaClient: CosmosClient
  private osmosisClient: CosmosClient
  private ibcQueryHelper?: IBCQueryHelper
  private relayerLogs: RelayerTestLog[] = []
  private logFile: string
  private metricsFile: string

  constructor(private config: RelayerTestConfig) {
    super('IBC Relayer Test')
    this.votaClient = new CosmosClient(config.chainA)
    this.osmosisClient = new CosmosClient(config.chainB)
    this.logFile = join(process.cwd(), 'relayer-test-logs.json')
    this.metricsFile = join(process.cwd(), 'relayer-metrics.json')
    this.loadExistingLogs()
  }

  async run(): Promise<TestResult> {
    logger.info('🚀 Starting IBC Relayer Test')

    try {
      // 初始化客户端连接
      await this.initializeClients()

      // 运行基础测试
      const basicTestResult = await this.runBasicRelayTest()
      if (!basicTestResult.success) {
        return this.createResult(false, basicTestResult.error)
      }

      // 运行批量测试
      const batchTestResult = await this.runBatchTest()

      // 运行稳定性测试
      const stabilityTestResult = await this.runStabilityTest()

      // 生成性能报告
      const metrics = this.generatePerformanceMetrics()

      await this.saveTestResults()

      const overallSuccess =
        basicTestResult.success &&
        batchTestResult.success &&
        stabilityTestResult.success

      return this.createResult(overallSuccess, undefined, {
        basicTest: basicTestResult,
        batchTest: batchTestResult,
        stabilityTest: stabilityTestResult,
        metrics,
        totalLogs: this.relayerLogs.length,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('IBC Relayer Test failed:', errorMessage)
      return this.createResult(false, errorMessage)
    } finally {
      await this.cleanup()
    }
  }

  private async initializeClients(): Promise<void> {
    try {
      logger.info('🔌 Connecting to chains...')
      logger.info(`  Chain A (vota-bobtail): ${this.config.chainA.rpc}`)
      logger.info(`  Chain B (osmosis): ${this.config.chainB.rpc}`)

      // 连接到区块链客户端
      await Promise.all([
        this.votaClient.connect(),
        this.osmosisClient.connect(),
      ])
      logger.info('✅ Blockchain clients connected')

      // 设置钱包
      logger.info('🔑 Setting up wallets...')
      await Promise.all([
        this.votaClient.setupWallet(this.config.test.mnemonic),
        this.osmosisClient.setupWallet(this.config.test.mnemonic),
      ])

      // 显示钱包地址
      const votaAddress = this.votaClient.getAddress()
      const osmosisAddress = this.osmosisClient.getAddress()
      logger.info(`  Vota address: ${votaAddress}`)
      logger.info(`  Osmosis address: ${osmosisAddress}`)
      logger.info('✅ Wallets setup completed')

      // 初始化IBC查询助手
      try {
        logger.info('🔍 Initializing IBC Query Helper...')
        const votaStargateClient = this.votaClient.getStargateClient()!
        const osmosisStargateClient = this.osmosisClient.getStargateClient()!

        // 获取Tendermint客户端
        const votaTmClient = this.votaClient.getTendermintClient()!
        const osmosisTmClient = this.osmosisClient.getTendermintClient()!

        this.ibcQueryHelper = new IBCQueryHelper(
          votaStargateClient,
          osmosisStargateClient,
          votaTmClient,
          osmosisTmClient
        )

        logger.info('✅ IBC Query Helper initialized')
      } catch (error) {
        logger.warn(
          '⚠️ Failed to initialize IBC Query Helper, using fallback methods'
        )
        if (error instanceof Error) {
          logger.warn(`  Error: ${error.message}`)
        } else {
          logger.warn(`  Error: ${JSON.stringify(error)}`)
        }
      }

      logger.success('✅ All clients initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize clients')

      if (error instanceof Error) {
        logger.error(`Initialization error name: ${error.name}`)
        logger.error(`Initialization error message: ${error.message}`)
        if (error.stack) {
          logger.error(`Initialization error stack: ${error.stack}`)
        }
      } else {
        logger.error(`Unknown initialization error type: ${typeof error}`)
        logger.error(
          `Initialization error value: ${JSON.stringify(error, null, 2)}`
        )
      }

      // 重新抛出错误
      throw error
    }
  }

  private async runBasicRelayTest(): Promise<TestResult> {
    logger.info('🧪 Running basic relay test...')

    try {
      // Step 1: 检查 channel 状态
      const channelStatus = await this.checkChannelStatus()
      if (!channelStatus) {
        return this.createResult(false, 'Channel is not in OPEN state')
      }

      // Step 2: 发起 IBC transfer
      const transferResult = await this.sendIBCTransfer()
      if (!transferResult.success) {
        return this.createResult(
          false,
          `Transfer failed: ${transferResult.error}`
        )
      }

      // Step 3: 等待并检查 acknowledgement
      const ackResult = await this.waitForAcknowledgement(
        transferResult.sequence!
      )

      if (!ackResult.acknowledged) {
        const log: RelayerTestLog = {
          testTime: new Date(),
          txHash: transferResult.txHash,
          packetSequence: transferResult.sequence!,
          success: false,
          latency: this.config.relayer.timeoutSeconds * 1000,
          errorMessage: 'Timeout waiting for acknowledgement',
        }
        this.relayerLogs.push(log)
        return this.createResult(false, 'Timeout waiting for acknowledgement')
      }

      // Step 4: 验证目标链交易
      const targetTxResult = await this.verifyTargetChainTransaction(ackResult)

      // 记录测试日志
      const log: RelayerTestLog = {
        testTime: new Date(),
        txHash: transferResult.txHash,
        packetSequence: transferResult.sequence!,
        success: true,
        latency: ackResult.ackTime
          ? ackResult.ackTime.getTime() - transferResult.timestamp.getTime()
          : 0,
        targetChainTxHash: ackResult.targetTxHash,
        relayerSigner: ackResult.relayerAddress,
        memoIdentifier: ackResult.memo,
        receivedAmount: this.config.relayer.testAmount,
      }
      this.relayerLogs.push(log)

      logger.success('✅ Basic relay test passed')
      return this.createResult(true, undefined, { log, targetTxResult })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return this.createResult(false, errorMessage)
    }
  }

  private async runBatchTest(): Promise<TestResult> {
    logger.info('📊 Running batch relay test...')

    const batchSize = this.config.relayer.batchSize
    const results: RelayerTestLog[] = []
    let successCount = 0

    try {
      for (let i = 0; i < batchSize; i++) {
        logger.info(`Batch test ${i + 1}/${batchSize}`)

        const transferResult = await this.sendIBCTransfer(`batch-test-${i}`)
        if (!transferResult.success) {
          results.push({
            testTime: new Date(),
            txHash: transferResult.txHash,
            packetSequence: 0,
            success: false,
            latency: 0,
            errorMessage: transferResult.error,
          })
          continue
        }

        const ackResult = await this.waitForAcknowledgement(
          transferResult.sequence!
        )
        const log: RelayerTestLog = {
          testTime: new Date(),
          txHash: transferResult.txHash,
          packetSequence: transferResult.sequence!,
          success: ackResult.acknowledged,
          latency: ackResult.ackTime
            ? ackResult.ackTime.getTime() - transferResult.timestamp.getTime()
            : this.config.relayer.timeoutSeconds * 1000,
          targetChainTxHash: ackResult.targetTxHash,
          relayerSigner: ackResult.relayerAddress,
          memoIdentifier: ackResult.memo,
          errorMessage: ackResult.acknowledged
            ? undefined
            : 'Acknowledgement timeout',
        }

        results.push(log)
        this.relayerLogs.push(log)

        if (ackResult.acknowledged) {
          successCount++
        }

        // 间隔一定时间避免过于频繁
        await this.sleep(2000)
      }

      const successRate = (successCount / batchSize) * 100
      logger.info(
        `Batch test completed: ${successCount}/${batchSize} (${successRate.toFixed(
          2
        )}%)`
      )

      return this.createResult(successRate >= 80, undefined, {
        totalTests: batchSize,
        successfulTests: successCount,
        successRate,
        results,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return this.createResult(false, errorMessage)
    }
  }

  private async runStabilityTest(): Promise<TestResult> {
    logger.info('⏱️ Running stability test...')

    // 运行稳定性测试 - 可通过配置调整测试次数和间隔
    const testCount = this.config.relayer.stabilityTestCount || 12
    const interval = this.config.relayer.stabilityTestInterval || 5000 // 毫秒
    let consecutiveFailures = 0
    let maxConsecutiveFailures = 0
    const results: RelayerTestLog[] = []

    try {
      for (let i = 0; i < testCount; i++) {
        logger.info(`Stability test ${i + 1}/${testCount}`)

        const transferResult = await this.sendIBCTransfer(`stability-test-${i}`)
        if (!transferResult.success) {
          consecutiveFailures++
          results.push({
            testTime: new Date(),
            txHash: transferResult.txHash,
            packetSequence: 0,
            success: false,
            latency: 0,
            errorMessage: transferResult.error,
          })
        } else {
          const ackResult = await this.waitForAcknowledgement(
            transferResult.sequence!
          )
          const success = ackResult.acknowledged

          if (success) {
            consecutiveFailures = 0
          } else {
            consecutiveFailures++
          }

          maxConsecutiveFailures = Math.max(
            maxConsecutiveFailures,
            consecutiveFailures
          )

          const log: RelayerTestLog = {
            testTime: new Date(),
            txHash: transferResult.txHash,
            packetSequence: transferResult.sequence!,
            success,
            latency: ackResult.ackTime
              ? ackResult.ackTime.getTime() - transferResult.timestamp.getTime()
              : this.config.relayer.timeoutSeconds * 1000,
            targetChainTxHash: ackResult.targetTxHash,
            relayerSigner: ackResult.relayerAddress,
            memoIdentifier: ackResult.memo,
            errorMessage: success ? undefined : 'Acknowledgement timeout',
          }

          results.push(log)
          this.relayerLogs.push(log)
        }

        if (i < testCount - 1) {
          await this.sleep(interval)
        }
      }

      const successCount = results.filter((r) => r.success).length
      const successRate = (successCount / testCount) * 100
      const avgLatency =
        results
          .filter((r) => r.success)
          .reduce((sum, r) => sum + r.latency, 0) / Math.max(successCount, 1)

      logger.info(
        `Stability test completed: Success rate ${successRate.toFixed(2)}%`
      )

      return this.createResult(
        successRate >= 90 && maxConsecutiveFailures <= 3,
        undefined,
        {
          totalTests: testCount,
          successfulTests: successCount,
          successRate,
          averageLatency: avgLatency,
          maxConsecutiveFailures,
          results,
        }
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return this.createResult(false, errorMessage)
    }
  }

  private async sendIBCTransfer(memo?: string): Promise<IBCTransferResult> {
    try {
      const client = this.votaClient.getSigningClient()!
      const address = this.votaClient.getAddress()!

      logger.info(`📝 Preparing IBC transfer from address: ${address}`)

      const timestamp = Date.now()
      const testMemo = memo || `IBC-relay-test-${timestamp}`

      // 获取目标链当前高度
      logger.info('🔍 Getting target chain height for timeout calculation...')
      const osmosisHeight = await this.osmosisClient.getHeight()
      const timeoutHeight = osmosisHeight + 1000 // 在当前高度基础上增加1000个块

      logger.info(
        `📏 Chain heights - Osmosis: ${osmosisHeight}, Timeout: ${timeoutHeight}`
      )

      const fee = {
        amount: [
          {
            denom: 'peaka',
            amount: '500000000000000', // 0.0005 DORA (500,000 peaka) - reasonable fee
          },
        ],
        gas: '200000', // Reasonable gas limit based on actual usage (~90k)
      }

      const msg = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sourcePort: this.config.ibc.portId,
          sourceChannel: this.config.ibc.channelId,
          token: {
            denom: this.config.relayer.testDenom,
            amount: this.config.relayer.testAmount,
          },
          sender: address,
          receiver: this.config.relayer.osmosisReceiveAddress,
          timeoutHeight: {
            revisionNumber: 5, // Osmosis testnet revision number
            revisionHeight: timeoutHeight,
          },
          timeoutTimestamp:
            BigInt(Date.now() + this.config.relayer.timeoutSeconds * 1000) *
            BigInt(1000000),
          memo: testMemo,
        },
      }

      logger.info('📦 IBC transfer message prepared:', {
        sourcePort: msg.value.sourcePort,
        sourceChannel: msg.value.sourceChannel,
        tokenDenom: msg.value.token.denom,
        tokenAmount: msg.value.token.amount,
        sender: msg.value.sender,
        receiver: msg.value.receiver,
        memo: msg.value.memo,
        timeoutHeight: `${msg.value.timeoutHeight.revisionNumber}-${msg.value.timeoutHeight.revisionHeight}`,
        fee: fee,
        gas: fee.gas,
      })

      logger.info('🔐 Signing and broadcasting transaction...')
      const result = await client.signAndBroadcast(
        address,
        [msg],
        fee,
        testMemo
      )

      logger.info('📡 Broadcast result received:', {
        code: result.code,
        transactionHash: result.transactionHash,
        gasUsed: result.gasUsed?.toString() || 'N/A',
        gasWanted: result.gasWanted?.toString() || 'N/A',
        height: result.height,
        rawLogLength: result.rawLog?.length || 0,
      })

      if (result.code !== 0) {
        logger.error('❌ Transaction failed with non-zero code:', {
          code: result.code,
          rawLog: result.rawLog,
        })

        return {
          txHash: result.transactionHash,
          success: false,
          error: `Transaction failed with code ${result.code}: ${result.rawLog}`,
          timestamp: new Date(),
        }
      }

      // 提取 packet sequence
      logger.info('🔍 Extracting packet sequence from transaction log...')
      const sequence = this.extractPacketSequence(result.rawLog || '')

      if (sequence === 0) {
        logger.warn('⚠️ Could not extract packet sequence from rawLog')
        logger.debug('Raw log content:', result.rawLog)
      } else {
        logger.info(`✅ Packet sequence extracted: ${sequence}`)
      }

      logger.info(
        `✅ IBC transfer sent successfully: ${result.transactionHash}`
      )

      return {
        txHash: result.transactionHash,
        success: true,
        sequence,
        timestamp: new Date(),
      }
    } catch (error) {
      logger.error('❌ Exception in sendIBCTransfer:')

      if (error instanceof Error) {
        logger.error(`Exception name: ${error.name}`)
        logger.error(`Exception message: ${error.message}`)
        if (error.stack) {
          logger.error(`Exception stack: ${error.stack}`)
        }
      } else {
        logger.error(`Unknown exception type: ${typeof error}`)
        logger.error(`Exception value: ${JSON.stringify(error, null, 2)}`)
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return {
        txHash: '',
        success: false,
        error: `Exception during IBC transfer: ${errorMessage}`,
        timestamp: new Date(),
      }
    }
  }

  private async waitForAcknowledgement(
    sequence: number
  ): Promise<PacketAcknowledgement> {
    const timeout = this.config.relayer.timeoutSeconds * 1000
    const startTime = Date.now()
    const pollInterval = 3000 // 3秒轮询一次

    logger.info(
      `⏳ Waiting for acknowledgement (sequence: ${sequence}, timeout: ${
        timeout / 1000
      }s)`
    )

    while (Date.now() - startTime < timeout) {
      try {
        // 方法1: 查询 packet acknowledgement
        const ack = await this.queryPacketAcknowledgement(sequence)
        if (ack.acknowledged) {
          logger.info('✅ Acknowledgement found via packet query')
          return ack
        }

        // 方法2: 直接在osmosis上搜索recv_packet事件
        const osmosisRecv = await this.searchOsmosisRecvPacket(sequence)
        if (osmosisRecv) {
          logger.info('✅ Found recv_packet event on osmosis')
          return {
            sequence,
            acknowledged: true,
            ackTime: new Date(),
            relayerAddress: osmosisRecv.relayerAddress,
            memo: osmosisRecv.memo,
            targetTxHash: osmosisRecv.txHash,
          }
        }

        logger.debug(
          `Polling attempt ${
            Math.floor((Date.now() - startTime) / pollInterval) + 1
          }`
        )
      } catch (error) {
        logger.debug(`Error querying acknowledgement: ${error}`)
      }

      await this.sleep(pollInterval)
    }

    logger.warn('⏰ Acknowledgement timeout reached')
    return {
      sequence,
      acknowledged: false,
    }
  }

  private async searchOsmosisRecvPacket(sequence: number): Promise<{
    txHash: string
    relayerAddress: string
    memo?: string
  } | null> {
    try {
      // 使用osmosis RPC搜索recv_packet事件，限制搜索最近的交易
      const rpcUrl = this.config.chainB.rpc

      // 先获取当前高度，然后搜索最近1000个块内的交易
      const heightResponse = await fetch(`${rpcUrl}/status`)
      let maxHeight = 0
      if (heightResponse.ok) {
        const statusData = (await heightResponse.json()) as any
        maxHeight = parseInt(
          statusData.result?.sync_info?.latest_block_height || '0'
        )
      }

      const minHeight = Math.max(1, maxHeight - 1000) // 搜索最近1000个块

      // 构建带有高度范围的搜索查询
      const searchQuery = `recv_packet.packet_sequence='${sequence}' AND recv_packet.packet_src_channel='channel-0' AND tx.height>=${minHeight} AND tx.height<=${maxHeight}`

      logger.debug(
        `Searching osmosis for sequence ${sequence} in height range ${minHeight}-${maxHeight}`
      )

      const response = await fetch(
        `${rpcUrl}/tx_search?query="${encodeURIComponent(
          searchQuery
        )}"&per_page=5&order_by="desc"` // 按时间倒序，最新的在前
      )
      if (!response.ok) {
        logger.debug(`Osmosis search failed: ${response.status}`)
        return null
      }

      const data = (await response.json()) as any
      if (data.result && data.result.txs && data.result.txs.length > 0) {
        // 取最新的交易（第一个）
        const tx = data.result.txs[0]

        // 验证这个交易确实是最近的
        const txHeight = parseInt(tx.height)
        const timeDiff = maxHeight - txHeight

        if (timeDiff > 1000) {
          logger.warn(
            `Found tx at height ${txHeight} but it's too old (${timeDiff} blocks ago)`
          )
          return null
        }

        // 提取relayer地址 - 从message事件的sender属性中获取
        let relayerAddress = 'unknown'
        if (tx.tx_result && tx.tx_result.events) {
          for (const event of tx.tx_result.events) {
            if (event.type === 'message' && event.attributes) {
              const senderAttr = event.attributes.find(
                (attr: any) => attr.key === 'sender'
              )
              if (senderAttr && senderAttr.value) {
                relayerAddress = senderAttr.value
                break
              }
            }
          }
        }

        // 提取osmosis上relayer交易的memo信息
        let relayerMemo: string | undefined
        let ibcPacketMemo: string | undefined

        try {
          // 详细调试：打印交易结构
          logger.info('=== MEMO EXTRACTION DEBUG ===')
          logger.info(`Transaction hash: ${tx.hash}`)
          logger.info(`tx.tx exists: ${!!tx.tx}`)
          logger.info(`tx.tx_result exists: ${!!tx.tx_result}`)

          // 尝试多种方法获取memo
          if (tx.tx) {
            try {
              const txBytes = Buffer.from(tx.tx, 'base64')
              logger.info(`Transaction bytes length: ${txBytes.length}`)

              const { decodeTxRaw } = await import('@cosmjs/proto-signing')
              const decodedTx = decodeTxRaw(txBytes)

              logger.info(`Decoded tx body exists: ${!!decodedTx.body}`)
              logger.info(`Decoded tx body memo: "${decodedTx.body?.memo}"`)

              if (decodedTx.body && decodedTx.body.memo) {
                const memo = decodedTx.body.memo.trim()
                logger.info(`Extracted memo: "${memo}"`)
                logger.info(
                  `Memo starts with IBC-relay-test: ${memo.startsWith(
                    'IBC-relay-test-'
                  )}`
                )

                if (memo && !memo.startsWith('IBC-relay-test-')) {
                  relayerMemo = memo
                  logger.info(`✅ Found relayer memo: "${relayerMemo}"`)
                } else {
                  logger.info(`Memo is IBC test memo, skipping: "${memo}"`)
                }
              } else {
                logger.info('No memo found in decoded transaction body')
              }
            } catch (decodeError) {
              logger.error('Failed to decode transaction:', decodeError)
            }
          }

          // 方法2: 使用cosmjs客户端直接查询交易（作为备用）
          if (!relayerMemo) {
            try {
              logger.info('Trying cosmjs client getTx method...')
              const client = this.osmosisClient.getStargateClient()!
              const txDetails = await client.getTx(tx.hash)

              if (txDetails) {
                logger.info('Transaction found via cosmjs client')
                const { decodeTxRaw } = await import('@cosmjs/proto-signing')
                const decodedTx = decodeTxRaw(txDetails.tx)

                logger.info(
                  `Client decoded tx body memo: "${decodedTx.body?.memo}"`
                )

                if (decodedTx.body && decodedTx.body.memo) {
                  const memo = decodedTx.body.memo.trim()
                  if (memo && !memo.startsWith('IBC-relay-test-')) {
                    relayerMemo = memo
                    logger.info(
                      `✅ Found memo from cosmjs client: "${relayerMemo}"`
                    )
                  }
                }
              } else {
                logger.info('Transaction not found via cosmjs client')
              }
            } catch (clientError) {
              logger.error(
                'Failed to get transaction via cosmjs client:',
                clientError
              )
            }
          }

          logger.info(`=== END MEMO DEBUG, Final result: "${relayerMemo}" ===`)

          // 记录调试信息
          if (!relayerMemo) {
            logger.debug('No relayer memo found in osmosis transaction')
          }
        } catch (memoError) {
          logger.debug(
            'Failed to extract memo from osmosis transaction:',
            memoError
          )
        }

        logger.info(
          `🎯 Found recent osmosis recv_packet: ${tx.hash} at height ${tx.height} (${timeDiff} blocks ago)`
        )
        logger.info(`   Relayer Address: ${relayerAddress}`)
        if (relayerMemo) {
          logger.info(`   Relayer Memo: ${relayerMemo}`)
        } else {
          logger.debug('   No relayer memo found')
        }

        return {
          txHash: tx.hash,
          relayerAddress,
          memo: relayerMemo,
        }
      }

      logger.debug(`No recent recv_packet found for sequence ${sequence}`)
      return null
    } catch (error) {
      logger.debug(`Osmosis search error: ${error}`)
      return null
    }
  }

  private async queryPacketAcknowledgement(
    sequence: number
  ): Promise<PacketAcknowledgement> {
    try {
      // 使用真实的IBC查询助手
      if (this.ibcQueryHelper) {
        const packetDetails =
          await this.ibcQueryHelper.queryPacketAcknowledgement(
            this.config.ibc.portId,
            this.config.ibc.channelId,
            sequence
          )

        return {
          sequence: packetDetails.sequence,
          acknowledged: packetDetails.acknowledged,
          ackTime: packetDetails.ackTime,
          relayerAddress: packetDetails.relayerAddress,
          memo: undefined, // memo需要从原始交易中获取
          targetTxHash: packetDetails.targetTxHash,
        }
      }

      // 如果没有IBCQueryHelper，尝试直接查询
      const result = await this.queryAcknowledgementDirect(sequence)
      return result
    } catch (error) {
      logger.error('Failed to query packet acknowledgement:', error)
      return {
        sequence,
        acknowledged: false,
      }
    }
  }

  private async queryAcknowledgementDirect(
    sequence: number
  ): Promise<PacketAcknowledgement> {
    try {
      // 查询源链上的packet acknowledgement状态
      const client = this.votaClient.getStargateClient()!

      // 查询packet commitment来确认packet是否存在
      const packetCommitmentKey = this.generatePacketCommitmentKey(
        this.config.ibc.portId,
        this.config.ibc.channelId,
        sequence
      )

      // 检查acknowledgement是否存在
      const ackKey = this.generateAckKey(
        this.config.ibc.portId,
        this.config.ibc.channelId,
        sequence
      )

      // 在目标链上查找对应的接收交易
      const targetTxInfo = await this.findTargetChainReceiveTransaction(
        sequence
      )

      return {
        sequence,
        acknowledged: targetTxInfo !== null,
        ackTime: targetTxInfo?.timestamp || undefined,
        relayerAddress: targetTxInfo?.relayerAddress,
        memo: targetTxInfo?.memo,
        targetTxHash: targetTxInfo?.txHash,
      }
    } catch (error) {
      logger.error('Direct acknowledgement query failed:', error)
      return {
        sequence,
        acknowledged: false,
      }
    }
  }

  private async checkChannelStatus(): Promise<boolean> {
    try {
      // 查询真实的channel状态
      const client = this.votaClient.getStargateClient()!

      // 使用REST API查询channel状态
      const channelPath = `/ibc/core/channel/v1/channels/${this.config.ibc.channelId}/ports/${this.config.ibc.portId}`

      try {
        // 尝试使用客户端查询
        const response = await fetch(`${this.config.chainA.rpc}${channelPath}`)
        if (response.ok) {
          const data = (await response.json()) as any
          const channelState = data.channel?.state
          logger.info(`Channel state: ${channelState}`)
          return channelState === 'STATE_OPEN'
        }
      } catch (fetchError) {
        logger.debug('REST API query failed, trying alternative method')
      }

      // 备用方法：通过查询最近的IBC事件来判断channel是否活跃
      const latestHeight = await client.getHeight()
      const recentHeight = Math.max(1, latestHeight - 100)

      try {
        // 查询最近的区块中是否有IBC活动
        for (let height = latestHeight; height >= recentHeight; height--) {
          const block = await client.getBlock(height)
          // 如果找到任何区块，说明链是活跃的，假设channel是OPEN的
          if (block) {
            logger.info(
              `Chain is active at height ${height}, assuming channel is OPEN`
            )
            return true
          }
        }
      } catch (blockError) {
        logger.debug('Block query failed:', blockError)
      }

      // 如果所有查询都失败，返回true（乐观假设）
      logger.warn('Unable to verify channel status, assuming OPEN')
      return true
    } catch (error) {
      logger.error('Failed to check channel status:', error)
      return false
    }
  }

  private async verifyTargetChainTransaction(
    ack: PacketAcknowledgement
  ): Promise<any> {
    if (!ack.targetTxHash) return null

    try {
      // 在目标链上验证交易
      const client = this.osmosisClient.getStargateClient()!
      const tx = await client.getTx(ack.targetTxHash)
      return tx
    } catch (error) {
      logger.error('Failed to verify target chain transaction:', error)
      return null
    }
  }

  private extractPacketSequence(rawLog: string): number {
    // 添加详细的调试信息
    logger.info('🔍 Analyzing rawLog for packet sequence extraction...')
    logger.info('Raw log length:', rawLog.length)

    // 尝试多种不同的匹配模式，按优先级排序
    const patterns = [
      /"packet_sequence","value":"(\d+)"/, // 最准确的格式：JSON事件属性
      /"packet_sequence":"(\d+)"/, // JSON格式
      /packet_sequence:\s*"?(\d+)"?/, // 键值对格式
      /"sequence":"(\d+)"/, // 简化JSON格式
      /sequence:\s*"?(\d+)"?/, // 简化键值对格式
      /"packet_src_channel":"[^"]*","packet_sequence":"(\d+)"/, // 完整匹配
      /send_packet.*?packet_sequence[":=]\s*"?(\d+)"?/, // send_packet事件中的sequence
    ]

    for (let i = 0; i < patterns.length; i++) {
      const match = rawLog.match(patterns[i])
      if (match) {
        const sequence = parseInt(match[1])
        logger.info(
          `✅ Found packet sequence using pattern ${i + 1}: ${sequence}`
        )
        logger.info(`Pattern used: ${patterns[i]}`)
        return sequence
      }
    }

    // 如果所有模式都失败，输出调试信息
    logger.error('❌ Failed to extract packet sequence from transaction log')
    logger.error('Raw log length:', rawLog.length)

    // 输出完整的rawLog内容用于调试
    console.log('=== FULL RAW LOG CONTENT FOR DEBUGGING ===')
    console.log(rawLog)
    console.log('=== END RAW LOG CONTENT ===')

    // 查找所有数字，看看是否有合理的sequence值
    const numberMatches = rawLog.match(/\d+/g)
    if (numberMatches) {
      logger.debug('All numbers found in log:', numberMatches)

      // 寻找可能的sequence值（通常是较小的正整数）
      for (const numStr of numberMatches) {
        const num = parseInt(numStr)
        if (num > 0 && num < 1000000) {
          // 合理的sequence范围
          logger.warn(`⚠️ Using potential sequence number: ${num}`)
          return num
        }
      }
    }

    // 返回0而不是抛出错误，让程序继续运行
    return 0
  }

  private generatePacketCommitmentKey(
    port: string,
    channel: string,
    sequence: number
  ): string {
    // IBC packet commitment key格式
    return `commitments/ports/${port}/channels/${channel}/sequences/${sequence}`
  }

  private generateAckKey(
    port: string,
    channel: string,
    sequence: number
  ): string {
    // IBC acknowledgement key格式
    return `acks/ports/${port}/channels/${channel}/sequences/${sequence}`
  }

  private async findTargetChainReceiveTransaction(sequence: number): Promise<{
    txHash: string
    relayerAddress: string
    timestamp: Date
    memo?: string
  } | null> {
    try {
      const client = this.osmosisClient.getStargateClient()!
      const latestHeight = await client.getHeight()
      const searchFromHeight = Math.max(1, latestHeight - 1000) // 搜索最近1000个区块

      logger.info(
        `Searching for recv_packet transaction in blocks ${searchFromHeight} to ${latestHeight}`
      )

      // 使用searchTx API查找包含recv_packet事件的交易
      try {
        const searchResults = await client.searchTx([
          {
            key: 'recv_packet.packet_src_channel',
            value: this.config.ibc.channelId,
          },
          {
            key: 'recv_packet.packet_sequence',
            value: sequence.toString(),
          },
        ])

        if (searchResults.length > 0) {
          const tx = searchResults[0]
          const relayerAddress = this.extractRelayerFromTx(tx)

          return {
            txHash: tx.hash,
            relayerAddress: relayerAddress || 'unknown',
            timestamp: new Date(), // IndexedTx doesn't have timestamp, use current time
            memo: this.extractMemoFromTx(tx),
          }
        }
      } catch (searchError) {
        logger.debug(
          'searchTx failed, trying manual block search:',
          searchError
        )
      }

      // 备用方法：手动搜索区块
      return await this.manualBlockSearch(
        sequence,
        searchFromHeight,
        latestHeight
      )
    } catch (error) {
      logger.error('Failed to find target chain receive transaction:', error)
      return null
    }
  }

  private async manualBlockSearch(
    sequence: number,
    fromHeight: number,
    toHeight: number
  ): Promise<{
    txHash: string
    relayerAddress: string
    timestamp: Date
    memo?: string
  } | null> {
    try {
      const client = this.osmosisClient.getStargateClient()!

      // 逆序搜索（从最新区块开始）
      for (let height = toHeight; height >= fromHeight; height--) {
        try {
          const block = await client.getBlock(height)

          for (const txBytes of block.txs) {
            try {
              const txHash = Buffer.from(txBytes).toString('hex').toUpperCase()
              const tx = await client.getTx(txHash)

              if (tx && this.isMatchingRecvPacketTx(tx, sequence)) {
                const relayerAddress = this.extractRelayerFromTx(tx)

                return {
                  txHash: tx.hash,
                  relayerAddress: relayerAddress || 'unknown',
                  timestamp: new Date(), // IndexedTx doesn't have timestamp, use current time
                  memo: this.extractMemoFromTx(tx),
                }
              }
            } catch (txError) {
              // 跳过无法解析的交易
              continue
            }
          }
        } catch (blockError) {
          // 跳过无法访问的区块
          continue
        }

        // 每处理10个区块记录一次进度
        if (height % 10 === 0) {
          logger.debug(`Searched up to block ${height}`)
        }
      }

      return null
    } catch (error) {
      logger.error('Manual block search failed:', error)
      return null
    }
  }

  private isMatchingRecvPacketTx(tx: any, sequence: number): boolean {
    if (!tx.events) return false

    for (const event of tx.events) {
      if (event.type === 'recv_packet') {
        const attributes = event.attributes || []

        const packetSequence = attributes.find(
          (attr: any) => attr.key === 'packet_sequence'
        )?.value

        const packetSrcChannel = attributes.find(
          (attr: any) => attr.key === 'packet_src_channel'
        )?.value

        if (
          packetSequence === sequence.toString() &&
          packetSrcChannel === this.config.ibc.channelId
        ) {
          return true
        }
      }
    }

    return false
  }

  private extractRelayerFromTx(tx: any): string | null {
    try {
      // 方法1: 从交易事件中提取
      if (tx.events) {
        for (const event of tx.events) {
          if (event.type === 'message') {
            const senderAttr = event.attributes?.find(
              (attr: any) => attr.key === 'sender'
            )
            if (senderAttr) {
              return senderAttr.value
            }
          }
        }
      }

      // 方法2: 从交易消息中提取
      if (tx.tx?.body?.messages?.[0]) {
        const firstMsg = tx.tx.body.messages[0]
        if (firstMsg.typeUrl === '/ibc.core.channel.v1.MsgRecvPacket') {
          return firstMsg.value?.signer || null
        }
      }

      return null
    } catch (error) {
      logger.error('Error extracting relayer address:', error)
      return null
    }
  }

  /**
   * 清理从Protobuf二进制数据中提取的memo，移除字段标识符等artifacts
   */
  private cleanProtobufArtifacts(memo: string): string {
    if (!memo) return memo

    // 更智能的清理策略：
    // 1. 首先检查是否真的需要清理（如果memo看起来正常，就不要动它）
    // 2. 只有当检测到明显的二进制污染时才进行清理

    // 检查memo是否看起来正常（以字母、数字或常见符号开头）
    if (/^[a-zA-Z0-9\[\]().-]/.test(memo)) {
      logger.debug(`Memo appears clean, no artifacts removal needed: "${memo}"`)
      return memo.trim()
    }

    logger.debug(`Memo appears to have artifacts, cleaning: "${memo}"`)

    // 移除开头的二进制控制字符
    let cleaned = memo
    while (cleaned.length > 0) {
      const firstChar = cleaned.charCodeAt(0)
      // 只删除真正的控制字符：0x00-0x1F 和 0x7F-0xFF
      // 保留所有可打印ASCII字符 0x20-0x7E
      if ((firstChar >= 0x00 && firstChar <= 0x1f) || firstChar >= 0x7f) {
        cleaned = cleaned.substring(1)
        logger.debug(
          `Removed control character: 0x${firstChar
            .toString(16)
            .padStart(2, '0')}`
        )
      } else {
        break
      }
    }

    // 移除末尾的非打印字符和二进制数据
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\xFF]+.*$/, '')

    // 移除常见的转义字符
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

    const result = cleaned.trim()
    logger.debug(`Cleaned memo result: "${result}"`)
    return result
  }

  private extractMemoFromTx(tx: any): string | undefined {
    try {
      // 从交易中提取memo信息
      if (tx.tx?.body?.memo) {
        return tx.tx.body.memo
      }

      // 从IBC packet数据中提取memo
      if (tx.events) {
        for (const event of tx.events) {
          if (event.type === 'recv_packet') {
            const attributes = event.attributes || []
            const dataAttr = attributes.find(
              (attr: any) => attr.key === 'packet_data'
            )
            if (dataAttr) {
              try {
                const packetData = JSON.parse(dataAttr.value)
                return packetData.memo
              } catch (parseError) {
                // 忽略解析错误
              }
            }
          }
        }
      }

      return undefined
    } catch (error) {
      logger.error('Error extracting memo:', error)
      return undefined
    }
  }

  private generatePerformanceMetrics(): RelayerPerformanceMetrics[] {
    const metrics: RelayerPerformanceMetrics[] = []

    // 按 validator 分组统计
    const validatorGroups = new Map<string, RelayerTestLog[]>()

    this.relayerLogs.forEach((log) => {
      if (log.memoIdentifier) {
        const moniker = log.memoIdentifier.replace('relayed-by:', '')
        if (!validatorGroups.has(moniker)) {
          validatorGroups.set(moniker, [])
        }
        validatorGroups.get(moniker)!.push(log)
      }
    })

    validatorGroups.forEach((logs, moniker) => {
      const successful = logs.filter((l) => l.success)
      const failed = logs.filter((l) => !l.success)

      const avgLatency =
        successful.length > 0
          ? successful.reduce((sum, l) => sum + l.latency, 0) /
            successful.length
          : 0

      const latencies = successful.map((l) => l.latency)
      const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0
      const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0

      metrics.push({
        validatorMoniker: moniker,
        totalTests: logs.length,
        successfulRelays: successful.length,
        failedRelays: failed.length,
        averageLatency: avgLatency,
        maxLatency,
        minLatency,
        successRate: (successful.length / logs.length) * 100,
        uptimeHours: this.calculateUptimeHours(logs),
        continuousFailures: this.calculateContinuousFailures(logs),
        lastActiveTime:
          logs.length > 0 ? logs[logs.length - 1].testTime : undefined,
      })
    })

    return metrics
  }

  private calculateContinuousFailures(logs: RelayerTestLog[]): number {
    let maxContinuous = 0
    let current = 0

    for (const log of logs) {
      if (!log.success) {
        current++
        maxContinuous = Math.max(maxContinuous, current)
      } else {
        current = 0
      }
    }

    return maxContinuous
  }

  private calculateUptimeHours(logs: RelayerTestLog[]): number {
    if (logs.length === 0) return 0

    // 计算从第一次测试到最后一次测试的时间跨度
    const sortedLogs = logs.sort(
      (a, b) => a.testTime.getTime() - b.testTime.getTime()
    )
    const firstTestTime = sortedLogs[0].testTime
    const lastTestTime = sortedLogs[sortedLogs.length - 1].testTime

    const totalHours =
      (lastTestTime.getTime() - firstTestTime.getTime()) / (1000 * 60 * 60)

    // 如果时间跨度小于1小时，返回实际的小时数
    return Math.max(0.1, totalHours)
  }

  private loadExistingLogs(): void {
    try {
      if (existsSync(this.logFile)) {
        const data = readFileSync(this.logFile, 'utf-8')
        this.relayerLogs = JSON.parse(data, (key, value) => {
          if (key === 'testTime' && typeof value === 'string') {
            return new Date(value)
          }
          return value
        })
        logger.info(`Loaded ${this.relayerLogs.length} existing logs`)
      }
    } catch (error) {
      logger.warn('Failed to load existing logs:', error)
      this.relayerLogs = []
    }
  }

  private async saveTestResults(): Promise<void> {
    try {
      // 保存测试日志
      writeFileSync(this.logFile, JSON.stringify(this.relayerLogs, null, 2))

      // 保存性能指标
      const metrics = this.generatePerformanceMetrics()
      writeFileSync(this.metricsFile, JSON.stringify(metrics, null, 2))

      logger.info(
        `Test results saved to ${this.logFile} and ${this.metricsFile}`
      )
    } catch (error) {
      logger.error('Failed to save test results:', error)
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await Promise.all([
        this.votaClient.disconnect(),
        this.osmosisClient.disconnect(),
      ])
      logger.info('Clients disconnected')
    } catch (error) {
      logger.error('Error during cleanup:', error)
    }
  }

  // 公共方法用于外部调用特定测试
  async runSingleTransferTest(): Promise<RelayerTestLog> {
    try {
      logger.info('🚀 Starting single transfer test...')

      // 初始化客户端
      logger.info('📡 Initializing blockchain clients...')
      await this.initializeClients()
      logger.info('✅ Clients initialized successfully')

      // 发送IBC转账
      logger.info('💸 Sending IBC transfer...')
      const transferResult = await this.sendIBCTransfer()

      logger.info('📋 Transfer result:', {
        success: transferResult.success,
        txHash: transferResult.txHash,
        sequence: transferResult.sequence,
        error: transferResult.error,
      })

      if (!transferResult.success) {
        const errorMsg = `IBC Transfer failed: ${
          transferResult.error || 'Unknown error'
        }`
        logger.error(errorMsg)

        // 返回失败的测试日志而不是抛出错误
        const failedLog: RelayerTestLog = {
          testTime: new Date(),
          txHash: transferResult.txHash || 'N/A',
          packetSequence: 0,
          success: false,
          latency: 0,
          errorMessage: errorMsg,
        }

        this.relayerLogs.push(failedLog)
        await this.saveTestResults()
        await this.cleanup()

        return failedLog
      }

      // 等待确认
      logger.info(
        `⏳ Waiting for acknowledgement (sequence: ${transferResult.sequence})...`
      )
      const ackResult = await this.waitForAcknowledgement(
        transferResult.sequence!
      )

      logger.info('📨 Acknowledgement result:', {
        acknowledged: ackResult.acknowledged,
        relayerAddress: ackResult.relayerAddress,
        memo: ackResult.memo,
        targetTxHash: ackResult.targetTxHash,
      })

      const log: RelayerTestLog = {
        testTime: new Date(),
        txHash: transferResult.txHash,
        packetSequence: transferResult.sequence!,
        success: ackResult.acknowledged,
        latency: ackResult.ackTime
          ? ackResult.ackTime.getTime() - transferResult.timestamp.getTime()
          : this.config.relayer.timeoutSeconds * 1000,
        targetChainTxHash: ackResult.targetTxHash,
        relayerSigner: ackResult.relayerAddress,
        memoIdentifier: ackResult.memo,
        errorMessage: ackResult.acknowledged
          ? undefined
          : 'Acknowledgement timeout',
      }

      this.relayerLogs.push(log)
      await this.saveTestResults()
      await this.cleanup()

      logger.info('✅ Single transfer test completed')
      return log
    } catch (error) {
      logger.error('❌ Single transfer test failed with exception')

      // 详细的错误日志
      if (error instanceof Error) {
        logger.error(`Exception name: ${error.name}`)
        logger.error(`Exception message: ${error.message}`)
        if (error.stack) {
          logger.error(`Exception stack: ${error.stack}`)
        }
      } else {
        logger.error(`Unknown exception type: ${typeof error}`)
        logger.error(`Exception value: ${JSON.stringify(error, null, 2)}`)
      }

      // 尝试清理资源
      try {
        await this.cleanup()
      } catch (cleanupError) {
        logger.error('Failed to cleanup after exception:', cleanupError)
      }

      // 重新抛出错误
      throw error
    }
  }

  getRelayerLogs(): RelayerTestLog[] {
    return [...this.relayerLogs]
  }

  getPerformanceMetrics(): RelayerPerformanceMetrics[] {
    return this.generatePerformanceMetrics()
  }
}
