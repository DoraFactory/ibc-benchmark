# IBC Relayer Identification and Testing System

## 📋 Implementation Status

**Current Status**: The system now uses **real data** to identify relayer addresses that process IBC transactions.

### 🔧 Real Data Acquisition Process

1. **Send IBC Transfer** - Send real IBC transfer on vota-bobtail
2. **Extract Packet Sequence** - Extract packet sequence from transaction logs
3. **Query Target Chain Reception** - Query corresponding `MsgRecvPacket` transaction on osmosis-testnet
4. **Identify Relayer Address** - Extract real relayer address from transaction signers
5. **Verify Memo Identifier** - Check if memo contains `relayed-by:<moniker>` identifier

### 🧪 Actual Query Example

```typescript
// Real acknowledgement query
const ackInfo = await ibcHelper.queryPacketAcknowledgement(
  'transfer',
  'channel-0',
  sequence
)

console.log('Relayer Address:', ackInfo.relayerAddress)
console.log('Target Chain Transaction:', ackInfo.targetTxHash)
```

## 🛠 Real Relayer Identification Solution

### Solution 1: Query Target Chain Transaction Events

IBC relayers produce `MsgRecvPacket` transactions on the target chain, which we can identify through:

```typescript
// Query recv_packet events on osmosis-testnet
const events = await targetClient.searchTx({
  tags: [
    { key: 'recv_packet.packet_src_channel', value: 'channel-0' },
    { key: 'recv_packet.packet_sequence', value: sequence.toString() },
  ],
})

const relayerAddress = events[0].tx.body.messages[0].signer
```

### Solution 2: Identify Through Transaction Signatures

```typescript
// Get transaction details, extract signer information
const tx = await client.getTx(txHash)
const relayerAddress = tx.tx.authInfo.signerInfos[0].address
```

### Solution 3: Identify Through Message Events

```typescript
// Check message.sender in transaction events
const messageEvent = tx.events.find((e) => e.type === 'message')
const relayerAddress = messageEvent.attributes.find(
  (a) => a.key === 'sender'
)?.value
```

## 🏁 Complete Process Example

```typescript
// Extract from transaction logs
const packetSequence = extractFromLog(result.rawLog, 'packet_sequence')
const sourceChannel = 'channel-0'

// Verify validator moniker in memo
const memo = 'relayed-by:validator1'
const moniker = memo.replace('relayed-by:', '')

// Query real acknowledgement information
const ackInfo = await ibcHelper.queryPacketAcknowledgement(
  'transfer',
  'channel-0',
  sequence
)

console.log('Relayer Address:', ackInfo.relayerAddress)
console.log('Target Chain Transaction:', ackInfo.targetTxHash)
```

## 🎯 System Capabilities Summary

### ✅ Implemented Features

1. **Real IBC Transfer Testing** - Send real IBC transfers
2. **Packet Acknowledgement Query** - Query real acknowledgement status
3. **Target Chain Transaction Query** - Find recv_packet transactions on osmosis
4. **Relayer Address Identification** - Extract real addresses from transaction signers
5. **Performance Metrics Calculation** - Calculate performance metrics based on real test data
6. **Persistent Storage** - Save real test logs and metrics
7. **Report Generation** - Generate HTML/Markdown reports based on real data

### 🔄 Data Flow

1. **Test Execution** → Send real IBC transfers
2. **Data Collection** → Query real acknowledgements and target chain transactions
3. **Address Identification** → Extract real relayer addresses from transactions
4. **Performance Analysis** → Calculate real latency, success rates, and other metrics
5. **Report Generation** → Generate test reports based on real data

**Current Status**: The system fully uses real blockchain data and can accurately identify and evaluate validator IBC relayer performance.
