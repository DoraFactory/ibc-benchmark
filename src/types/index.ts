export interface TestConfig {
  chainA: ChainConfig
  chainB: ChainConfig
  ibc: IBCConfig
  test: TestParams
  gas: GasConfig
}

export interface ChainConfig {
  rpc: string
  chainId: string
  prefix: string
}

export interface IBCConfig {
  connectionId: string
  channelId: string
  portId: string
  packetTimeoutHeight: number
  packetTimeoutTimestamp: number
}

export interface TestParams {
  durationMinutes: number
  maxConcurrentTxs: number
  mnemonic: string
}

export interface TestResult {
  testName: string
  success: boolean
  duration: number
  error?: string
  details?: any
}

export interface IBCPacket {
  sequence: number
  sourcePort: string
  sourceChannel: string
  destinationPort: string
  destinationChannel: string
  data: string
  timeoutHeight: {
    revisionNumber: number
    revisionHeight: number
  }
  timeoutTimestamp: number
}

export interface ConnectionState {
  connectionId: string
  state: string
  clientId: string
  counterpartyConnectionId: string
  counterpartyClientId: string
}

export interface ChannelState {
  channelId: string
  portId: string
  state: string
  counterpartyChannelId: string
  counterpartyPortId: string
  connectionHops: string[]
}

export interface TestStats {
  totalTests: number
  successfulTests: number
  failedTests: number
  averageLatency: number
  maxLatency: number
  minLatency: number
  startTime: Date
  endTime?: Date
}

// New types for IBC Relayer testing
export interface RelayerTestLog {
  testTime: Date
  txHash: string
  packetSequence: number
  success: boolean
  latency: number
  targetChainTxHash?: string
  relayerSigner?: string
  memoIdentifier?: string
  errorMessage?: string
  receivedAmount?: string
}

export interface ValidatorInfo {
  moniker: string
  operatorAddress: string
  relayerAddresses: string[]
  isActive: boolean
}

export interface RelayerTestConfig extends TestConfig {
  relayer: {
    testAmount: string
    testDenom: string
    timeoutSeconds: number
    receiverChainReceiveAddress: string
    batchSize: number
    testInterval: number
    stabilityTestCount?: number
    stabilityTestInterval?: number
  }
  validators: ValidatorInfo[]
}

export interface IBCTransferResult {
  txHash: string
  success: boolean
  sequence?: number
  error?: string
  timestamp: Date
}

export interface PacketAcknowledgement {
  sequence: number
  acknowledged: boolean
  ackTime?: Date
  relayerAddress?: string
  memo?: string
  targetTxHash?: string
}

export interface RelayerPerformanceMetrics {
  validatorMoniker: string
  totalTests: number
  successfulRelays: number
  failedRelays: number
  averageLatency: number
  maxLatency: number
  minLatency: number
  successRate: number
  uptimeHours: number
  continuousFailures: number
  lastActiveTime?: Date
}

export interface GasConfig {
  limit: number
  price: string
  denom: string
  amount?: string
  adjustment: number
  auto: boolean
}
