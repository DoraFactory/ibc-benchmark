import { StargateClient, SigningStargateClient } from '@cosmjs/stargate'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'
import { ChainConfig } from '../types'
import { logger } from '../utils/logger'

export class CosmosClient {
  private stargateClient?: StargateClient
  private signingClient?: SigningStargateClient
  private tmClient?: Tendermint34Client
  private wallet?: DirectSecp256k1HdWallet
  private address?: string

  constructor(private config: ChainConfig) {}

  async connect(): Promise<void> {
    try {
      logger.info(`Connecting to ${this.config.chainId} at ${this.config.rpc}`)

      // 创建 Tendermint 客户端
      this.tmClient = await Tendermint34Client.connect(this.config.rpc)

      // 创建 Stargate 客户端
      this.stargateClient = await StargateClient.connect(this.config.rpc)

      logger.success(`Successfully connected to ${this.config.chainId}`)
    } catch (error) {
      logger.error(`Failed to connect to ${this.config.chainId}`, error)
      throw error
    }
  }

  async setupWallet(mnemonic: string): Promise<void> {
    try {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: this.config.prefix,
      })

      const accounts = await this.wallet.getAccounts()
      this.address = accounts[0].address

      this.signingClient = await SigningStargateClient.connectWithSigner(
        this.config.rpc,
        this.wallet
      )

      logger.info(`Wallet setup complete for ${this.config.chainId}`, {
        address: this.address,
      })
    } catch (error) {
      logger.error(`Failed to setup wallet for ${this.config.chainId}`, error)
      throw error
    }
  }

  async getBalance(denom: string = 'stake'): Promise<string> {
    if (!this.stargateClient || !this.address) {
      throw new Error('Client not initialized')
    }

    const balance = await this.stargateClient.getBalance(this.address, denom)
    return balance.amount
  }

  async getHeight(): Promise<number> {
    if (!this.stargateClient) {
      throw new Error('Client not initialized')
    }

    return await this.stargateClient.getHeight()
  }

  async getIBCConnections(): Promise<any[]> {
    if (!this.tmClient) {
      throw new Error('Tendermint client not initialized')
    }

    try {
      const response = await this.tmClient.abciQuery({
        path: '/ibc.core.connection.v1.Query/Connections',
        data: new Uint8Array(),
      })

      if (response.code !== 0) {
        throw new Error(`Query failed with code ${response.code}`)
      }

      // 这里需要根据实际的protobuf解码来处理响应
      return []
    } catch (error) {
      logger.error('Failed to get IBC connections', error)
      return []
    }
  }

  async getIBCChannels(): Promise<any[]> {
    if (!this.tmClient) {
      throw new Error('Tendermint client not initialized')
    }

    try {
      const response = await this.tmClient.abciQuery({
        path: '/ibc.core.channel.v1.Query/Channels',
        data: new Uint8Array(),
      })

      if (response.code !== 0) {
        throw new Error(`Query failed with code ${response.code}`)
      }

      // 这里需要根据实际的protobuf解码来处理响应
      return []
    } catch (error) {
      logger.error('Failed to get IBC channels', error)
      return []
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.stargateClient) return false

      const height = await this.getHeight()
      return height > 0
    } catch (error) {
      return false
    }
  }

  async disconnect(): Promise<void> {
    if (this.tmClient) {
      this.tmClient.disconnect()
    }
    if (this.stargateClient) {
      this.stargateClient.disconnect()
    }
    logger.info(`Disconnected from ${this.config.chainId}`)
  }

  getAddress(): string | undefined {
    return this.address
  }

  getSigningClient(): SigningStargateClient | undefined {
    return this.signingClient
  }

  getStargateClient(): StargateClient | undefined {
    return this.stargateClient
  }

  getTendermintClient(): Tendermint34Client | undefined {
    return this.tmClient
  }
}
