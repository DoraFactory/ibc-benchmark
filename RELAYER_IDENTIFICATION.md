# IBC Relayer 识别和测试系统

## 📋 实现状态

**当前状态**: 系统现在使用**真实数据**来识别处理 IBC 交易的 relayer 地址。

### 🔧 真实数据获取流程

1. **发送 IBC 转账** - 在 vota-bobtail 上发送真实的 IBC transfer
2. **提取 Packet Sequence** - 从交易日志中提取 packet sequence
3. **查询目标链接收** - 在 osmosis-testnet 上查询对应的 `MsgRecvPacket` 交易
4. **识别 Relayer 地址** - 从交易签名者中提取真实 relayer 地址
5. **验证 Memo 标识** - 检查 memo 中是否包含 `relayed-by:<moniker>` 标识

### 🧪 实际查询示例

```typescript
// 真实的 acknowledgement 查询
const ackInfo = await ibcHelper.queryPacketAcknowledgement(
  'transfer',
  'channel-0',
  sequence
)

console.log('Relayer 地址:', ackInfo.relayerAddress)
console.log('目标链交易:', ackInfo.targetTxHash)
```

## 🛠 真正的 Relayer 识别方案

### 方案 1: 查询目标链交易事件

IBC relayer 在目标链上会产生 `MsgRecvPacket` 交易，我们可以通过以下方式识别：

```typescript
// 在 osmosis-testnet 上查询 recv_packet 事件
const events = await targetClient.searchTx({
  tags: [
    { key: 'recv_packet.packet_src_channel', value: 'channel-0' },
    { key: 'recv_packet.packet_sequence', value: sequence.toString() },
  ],
})

const relayerAddress = events[0].tx.body.messages[0].signer
```

### 方案 2: 通过交易签名识别

```typescript
// 获取交易详情，提取签名者信息
const tx = await client.getTx(txHash)
const relayerAddress = tx.tx.authInfo.signerInfos[0].address
```

### 方案 3: 通过消息事件识别

```typescript
// 查看交易事件中的 message.sender
const messageEvent = tx.events.find((e) => e.type === 'message')
const relayerAddress = messageEvent.attributes.find(
  (a) => a.key === 'sender'
)?.value
```

## 🏁 完整流程示例

```typescript
// 从交易日志中提取
const packetSequence = extractFromLog(result.rawLog, 'packet_sequence')
const sourceChannel = 'channel-0'

// 验证 memo 中的 validator moniker
const memo = 'relayed-by:validator1'
const moniker = memo.replace('relayed-by:', '')

// 查询真实的 acknowledgement 信息
const ackInfo = await ibcHelper.queryPacketAcknowledgement(
  'transfer',
  'channel-0',
  sequence
)

console.log('Relayer 地址:', ackInfo.relayerAddress)
console.log('目标链交易:', ackInfo.targetTxHash)
```

## 🎯 系统能力总结

### ✅ 已实现功能

1. **真实 IBC 转账测试** - 发送真实的 IBC 转账
2. **Packet Acknowledgement 查询** - 查询真实的确认状态
3. **目标链交易查询** - 在 osmosis 上查找 recv_packet 交易
4. **Relayer 地址识别** - 从交易签名者中提取真实地址
5. **Performance 指标计算** - 基于真实测试数据计算性能指标
6. **持久化存储** - 保存真实测试日志和指标
7. **报告生成** - 生成基于真实数据的 HTML/Markdown 报告

### 🔄 数据流程

1. **测试执行** → 发送真实 IBC 转账
2. **数据收集** → 查询真实 acknowledgement 和目标链交易
3. **地址识别** → 从交易中提取真实 relayer 地址
4. **性能分析** → 计算真实的延迟、成功率等指标
5. **报告生成** → 生成基于真实数据的测试报告

**当前状态**: 系统完全使用真实区块链数据，能够准确识别和评估 validator 的 IBC relayer 性能。
