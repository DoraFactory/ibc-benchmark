import { StargateClient, SigningStargateClient } from '@cosmjs/stargate'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'
import { ChainConfig, GasConfig } from '../types'
import { logger } from '../utils/logger'

/**
 * 自定义的SigningStargateClient，允许配置gas倍数
 */
class CustomSigningStargateClient extends SigningStargateClient {
  private customGasMultiplier?: number

  constructor(
    cometClient: any,
    signer: any,
    options: any = {},
    gasMultiplier?: number
  ) {
    super(cometClient, signer, options)

    // 存储自定义的gas倍数
    if (gasMultiplier !== undefined && gasMultiplier > 0) {
      this.customGasMultiplier = gasMultiplier
      logger.info(`🔧 Custom gas multiplier set to: ${gasMultiplier}`)
    } else {
      this.customGasMultiplier = undefined
      logger.debug('🔧 Using default gas multiplier from parent class')
    }

    if (this.customGasMultiplier !== undefined) {
      ;(this as any).defaultGasMultiplier = this.customGasMultiplier
    }
  }

  /**
   * 创建带有自定义gas倍数的客户端实例
   */
  static async connectWithSigner(
    endpoint: string,
    signer: any,
    options: any = {},
    gasMultiplier?: number
  ): Promise<CustomSigningStargateClient> {
    const { connectComet } = await import('@cosmjs/tendermint-rpc')
    const cometClient = await connectComet(endpoint)
    return new CustomSigningStargateClient(
      cometClient,
      signer,
      options,
      gasMultiplier
    )
  }
}

export class CosmosClient {
  private stargateClient?: StargateClient
  private signingClient?: CustomSigningStargateClient
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

  async setupWallet(mnemonic: string, gasConfig?: GasConfig): Promise<void> {
    try {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: this.config.prefix,
      })

      const accounts = await this.wallet.getAccounts()
      this.address = accounts[0].address

      // 设置SigningStargateClient的选项
      let clientOptions: any = {}

      if (gasConfig) {
        // 如果提供了gas配置，设置gasPrice用于auto gas
        // gasPrice应该是 "amount" + "denom" 的字符串格式
        clientOptions.gasPrice = `${gasConfig.price}${gasConfig.denom}`

        logger.info(
          `Setting up client with gas price: ${gasConfig.price}${gasConfig.denom}`
        )
      }

      // 提取gas倍数配置
      const gasMultiplier = gasConfig?.adjustment

      this.signingClient = await CustomSigningStargateClient.connectWithSigner(
        this.config.rpc,
        this.wallet,
        clientOptions,
        gasMultiplier
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

  getSigningClient(): CustomSigningStargateClient | undefined {
    return this.signingClient
  }

  getStargateClient(): StargateClient | undefined {
    return this.stargateClient
  }

  getTendermintClient(): Tendermint34Client | undefined {
    return this.tmClient
  }
}
