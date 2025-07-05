import * as dotenv from 'dotenv'
import { TestConfig, RelayerTestConfig, ValidatorInfo } from '../types'

dotenv.config()

export function loadConfig(): TestConfig {
  const requiredEnvVars = [
    'CHAIN_A_RPC',
    'CHAIN_A_ID',
    'CHAIN_A_PREFIX',
    'CHAIN_B_RPC',
    'CHAIN_B_ID',
    'CHAIN_B_PREFIX',
    'TEST_MNEMONIC',
    'CONNECTION_ID',
    'CHANNEL_ID',
  ]

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`)
    }
  }

  return {
    chainA: {
      rpc: process.env.CHAIN_A_RPC!,
      chainId: process.env.CHAIN_A_ID!,
      prefix: process.env.CHAIN_A_PREFIX!,
    },
    chainB: {
      rpc: process.env.CHAIN_B_RPC!,
      chainId: process.env.CHAIN_B_ID!,
      prefix: process.env.CHAIN_B_PREFIX!,
    },
    ibc: {
      connectionId: process.env.CONNECTION_ID!,
      channelId: process.env.CHANNEL_ID!,
      portId: process.env.PORT_ID || 'transfer',
      packetTimeoutHeight: parseInt(
        process.env.PACKET_TIMEOUT_HEIGHT || '1000'
      ),
      packetTimeoutTimestamp: parseInt(
        process.env.PACKET_TIMEOUT_TIMESTAMP || '600000000000'
      ),
    },
    test: {
      durationMinutes: parseInt(process.env.TEST_DURATION_MINUTES || '60'),
      maxConcurrentTxs: parseInt(process.env.MAX_CONCURRENT_TXS || '10'),
      mnemonic: process.env.TEST_MNEMONIC!,
    },
    gas: {
      limit: parseInt(process.env.GAS_LIMIT || '150000'),
      price: process.env.GAS_PRICE || '25000000000',
      denom: process.env.FEE_DENOM || 'peaka',
      amount: process.env.FEE_AMOUNT || undefined,
      adjustment: parseFloat(process.env.GAS_ADJUSTMENT || '1.5'),
      auto: process.env.AUTO_GAS === 'true',
    },
  }
}

export function loadRelayerTestConfig(): RelayerTestConfig {
  const baseConfig = loadConfig()

  // 默认验证器配置示例 - 实际使用时请通过环境变量 VALIDATORS_CONFIG 配置真实的验证器信息
  const defaultValidators: ValidatorInfo[] = [
    {
      moniker: 'validator-example-1',
      operatorAddress: 'doravaloper1...', // 请填入真实的validator操作地址
      relayerAddresses: [], // 系统将自动识别实际的relayer地址
      isActive: true,
    },
    {
      moniker: 'validator-example-2',
      operatorAddress: 'doravaloper1...', // 请填入真实的validator操作地址
      relayerAddresses: [], // 系统将自动识别实际的relayer地址
      isActive: true,
    },
  ]

  return {
    ...baseConfig,
    relayer: {
      testAmount: process.env.RELAYER_TEST_AMOUNT || '1000000000',
      testDenom: process.env.RELAYER_TEST_DENOM || 'peaka',
      timeoutSeconds: parseInt(process.env.RELAYER_TIMEOUT_SECONDS || '60'),
      receiverChainReceiveAddress: process.env.RECEIVE_ADDRESS || '',
      batchSize: parseInt(process.env.RELAYER_BATCH_SIZE || '10'),
      testInterval: parseInt(process.env.RELAYER_TEST_INTERVAL || '3600'), // 1小时
    },
    validators: loadValidatorsFromEnv() || defaultValidators,
  }
}

function loadValidatorsFromEnv(): ValidatorInfo[] | null {
  const validatorsJson = process.env.VALIDATORS_CONFIG
  if (!validatorsJson) return null

  try {
    return JSON.parse(validatorsJson)
  } catch (error) {
    console.warn('Failed to parse VALIDATORS_CONFIG, using defaults')
    return null
  }
}

export const config = loadConfig()
export const relayerConfig = loadRelayerTestConfig()
