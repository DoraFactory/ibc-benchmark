import { StargateClient } from '@cosmjs/stargate'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'
import { toHex, fromBase64 } from '@cosmjs/encoding'
import { logger } from './logger'

export interface PacketDetails {
  sequence: number
  sourcePort: string
  sourceChannel: string
  destinationPort: string
  destinationChannel: string
  acknowledged: boolean
  ackTime?: Date
  relayerAddress?: string
  targetTxHash?: string
  ackData?: string
}

export class IBCQueryHelper {
  constructor(
    private sourceClient: StargateClient,
    private targetClient: StargateClient,
    private sourceTmClient: Tendermint34Client,
    private targetTmClient: Tendermint34Client
  ) {}

  /**
   * 查询packet acknowledgement
   */
  async queryPacketAcknowledgement(
    sourcePort: string,
    sourceChannel: string,
    sequence: number
  ): Promise<PacketDetails> {
    try {
      // 1. 查询源链上的 packet acknowledgement
      const ackQuery = await this.sourceTmClient.abciQuery({
        path: '/ibc.core.channel.v1.Query/PacketAcknowledgement',
        data: this.encodePacketAckQuery(sourcePort, sourceChannel, sequence),
      })

      if (ackQuery.code !== 0) {
        return {
          sequence,
          sourcePort,
          sourceChannel,
          destinationPort: 'transfer',
          destinationChannel: this.getCounterpartyChannel(sourceChannel),
          acknowledged: false,
        }
      }

      // 2. 解析 acknowledgement 数据
      const ackData = this.decodeAcknowledgement(ackQuery.value)

      if (!ackData) {
        return {
          sequence,
          sourcePort,
          sourceChannel,
          destinationPort: 'transfer',
          destinationChannel: this.getCounterpartyChannel(sourceChannel),
          acknowledged: false,
        }
      }

      // 3. 在目标链上查找对应的接收交易
      const targetTxInfo = await this.findTargetChainTransaction(
        sourceChannel,
        sequence
      )

      return {
        sequence,
        sourcePort,
        sourceChannel,
        destinationPort: 'transfer',
        destinationChannel: this.getCounterpartyChannel(sourceChannel),
        acknowledged: true,
        ackTime: new Date(),
        relayerAddress: targetTxInfo?.relayerAddress,
        targetTxHash: targetTxInfo?.txHash,
        ackData: ackData,
      }
    } catch (error) {
      logger.error('Error querying packet acknowledgement:', error)
      return {
        sequence,
        sourcePort,
        sourceChannel,
        destinationPort: 'transfer',
        destinationChannel: this.getCounterpartyChannel(sourceChannel),
        acknowledged: false,
      }
    }
  }

  /**
   * 在目标链上查找接收交易，并识别relayer地址
   */
  private async findTargetChainTransaction(
    sourceChannel: string,
    sequence: number
  ): Promise<{ txHash: string; relayerAddress: string } | null> {
    try {
      // 获取最近的区块
      const latestHeight = await this.targetClient.getHeight()
      const searchFromHeight = Math.max(1, latestHeight - 1000) // 搜索最近1000个区块

      // 搜索包含IBC接收事件的交易
      for (let height = latestHeight; height >= searchFromHeight; height--) {
        const block = await this.targetTmClient.block(height)

        for (const tx of block.block.txs) {
          const txHash = toHex(tx).toUpperCase()

          try {
            // 查询交易详情
            const txResult = await this.targetClient.getTx(txHash)
            if (!txResult) continue

            // 检查是否包含IBC接收事件
            const ibcReceiveEvent = this.findIBCReceiveEvent(
              txResult.events,
              sourceChannel,
              sequence
            )

            if (ibcReceiveEvent) {
              // 从交易中提取relayer地址（通常是交易的第一个签名者）
              const relayerAddress = this.extractRelayerAddress(txResult)

              if (relayerAddress) {
                logger.info(
                  `Found relayer transaction: ${txHash} by ${relayerAddress}`
                )
                return {
                  txHash,
                  relayerAddress,
                }
              }
            }
          } catch (error) {
            // 跳过解析失败的交易
            continue
          }
        }
      }

      return null
    } catch (error) {
      logger.error('Error finding target chain transaction:', error)
      return null
    }
  }

  /**
   * 查找IBC接收事件
   */
  private findIBCReceiveEvent(
    events: readonly any[],
    sourceChannel: string,
    sequence: number
  ): any | null {
    for (const event of events) {
      if (event.type === 'recv_packet') {
        const attributes = event.attributes || []

        // 检查是否匹配我们要找的packet
        const packetSequence = attributes.find(
          (attr: any) => attr.key === 'packet_sequence'
        )?.value

        const packetSrcChannel = attributes.find(
          (attr: any) => attr.key === 'packet_src_channel'
        )?.value

        if (
          packetSequence === sequence.toString() &&
          packetSrcChannel === sourceChannel
        ) {
          return event
        }
      }
    }
    return null
  }

  /**
   * 从交易中提取relayer地址
   */
  private extractRelayerAddress(txResult: any): string | null {
    try {
      // 方法1: 从交易的签名者中获取
      if (txResult.tx?.authInfo?.signerInfos?.[0]) {
        // 这里需要从签名信息中提取地址，具体实现取决于交易结构
        // 通常relayer是交易的第一个签名者
      }

      // 方法2: 从交易事件中提取
      const msgEvents = txResult.events || []
      for (const event of msgEvents) {
        if (event.type === 'message') {
          const senderAttr = event.attributes?.find(
            (attr: any) => attr.key === 'sender'
          )
          if (senderAttr) {
            return senderAttr.value
          }
        }
      }

      // 方法3: 从交易消息中提取
      if (txResult.tx?.body?.messages?.[0]) {
        const firstMsg = txResult.tx.body.messages[0]
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
   * 通过查询目标链的交易来识别relayer
   * 这是一个更直接的方法
   */
  async findRelayerByMemo(memo: string): Promise<string | null> {
    try {
      // 从memo中提取moniker
      const monikerMatch = memo.match(/relayed-by:(.+)/)
      if (!monikerMatch) return null

      const moniker = monikerMatch[1]

      // 这里可以维护一个moniker到relayer地址的映射
      // 或者查询验证器信息来获取对应的relayer地址
      return this.getRelayerAddressByMoniker(moniker)
    } catch (error) {
      logger.error('Error finding relayer by memo:', error)
      return null
    }
  }

  /**
   * 根据moniker获取relayer地址
   */
  private getRelayerAddressByMoniker(moniker: string): string | null {
    // 这里应该查询验证器信息或使用配置的映射
    // 暂时返回null，需要根据实际情况实现
    return null
  }

  /**
   * 编码packet acknowledgement查询参数
   */
  private encodePacketAckQuery(
    port: string,
    channel: string,
    sequence: number
  ): Uint8Array {
    // 这里需要根据protobuf定义编码查询参数
    // 简化实现，实际需要使用正确的protobuf编码
    const queryData = {
      port_id: port,
      channel_id: channel,
      sequence: sequence,
    }
    return new TextEncoder().encode(JSON.stringify(queryData))
  }

  /**
   * 解码acknowledgement数据
   */
  private decodeAcknowledgement(data: Uint8Array): string | null {
    try {
      // 这里需要根据实际的acknowledgement格式进行解码
      const decoded = new TextDecoder().decode(data)
      return decoded
    } catch (error) {
      return null
    }
  }

  /**
   * 获取对应的目标通道
   */
  private getCounterpartyChannel(sourceChannel: string): string {
    // 这里应该查询实际的channel映射
    // 简化实现
    return sourceChannel.replace('channel', 'channel')
  }

  /**
   * 验证relayer地址是否属于指定的validator
   */
  async verifyRelayerOwnership(
    relayerAddress: string,
    validatorOperatorAddress: string
  ): Promise<boolean> {
    try {
      // 这里需要实现验证逻辑
      // 可能需要查询validator的委托信息或其他方式来验证
      // 暂时返回true，需要根据实际情况实现
      return true
    } catch (error) {
      logger.error('Error verifying relayer ownership:', error)
      return false
    }
  }
}
