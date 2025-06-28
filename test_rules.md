# 🧪 IBC Relayer 测试任务文档（适用于 vota-bobtail 激励测试网）

---

## 🎯 测试目标

1. 验证 validator 是否真实部署了 IBC relayer。
2. 检查 relayer 是否监听并使用指定的 channel。
3. 评估 relay 成功率、延迟、稳定性等性能指标。
4. 为激励发放提供客观、可量化的测试数据支持。

---

## 🛠 所需条件

- vota-bobtail 链正常运行，且 RPC 与 LCD 接口可访问。
- 至少一个 IBC channel（如 `channel-0`）与 osmosis-testnet 已建立。
- validators 已提交意愿并声称可以提供 IBC relay 服务。
- 有一个测试钱包地址用于发起 IBC transfer。
- validators 被要求 relay 的交易中使用 `memo=relayed-by:<moniker>` 进行身份标识。

---

## 📋 测试流程（每日或每小时执行）

### Step 1：发起 IBC transfer 测试交易

使用 vota-bobtail 向 osmosis-testnet 发起 IBC 转账交易：

```bash
dorad tx ibc-transfer transfer transfer channel-0 <osmosis接收地址> 1stake \
  --from <测试钱包> \
  --chain-id vota-bobtail \
  --node https://vota-bobtail-rpc.dorafactory.org:443 \
  --gas auto \
  --gas-adjustment 1.3 \
  --memo "relay-test-$(date +%s)" \
  --yes
```

### Step 2：检查 ack 是否收到

使用如下命令查询 channel 上的 acknowledgement：

```shell
dorad query ibc channel packet-acknowledgements transfer channel-0 \
  --chain-id vota-bobtail \
  --node https://vota-bobtail-rpc.dorafactory.org:443 \
  --output json
```

如果成功收到 ack：

- 记录 ack 收到时间；
- 计算从发送到 ack 的延迟时间（秒）；
- 去目标链（如 osmosis）查对应的接收交易；
- 获取 signer 地址及 memo 内容，确认是哪位 relayer。

### Step 2.5：处理异常情况

- **超时处理**：如果 40 秒内未收到 ack，标记为超时失败
- **交易失败**：记录具体失败原因（gas 不足、余额不足等）
- **Channel 状态检查**：测试前确认 channel 状态为 OPEN
- **重试机制**：失败交易是否需要重试，重试几次

### Step 3：记录每日 relay 测试日志

建议将测试日志以表格形式存储：

| 字段            | 说明                       |
| --------------- | -------------------------- |
| 测试时间        | 发起交易的时间戳           |
| 交易 Hash       | vota-bobtail 上的交易 hash |
| Packet Sequence | IBC packet 序列号          |
| 是否成功        | true/false                 |
| 延迟(秒)        | 从发送到收到 ack 的时间    |
| 目标链交易 Hash | osmosis 上的接收交易 hash  |
| Relayer Signer  | 实际 relay 的地址          |
| Memo 标识       | memo 中的 moniker          |
| 错误信息        | 失败时的具体错误           |
| 接收金额        | 验证金额是否正确           |

### 压力测试

- **批量测试**：连续发送 5-10 笔交易，测试并发处理能力
- **不同金额测试**：测试小额(1stake)和大额(1000stake)的处理差异
- **峰值时间测试**：在网络繁忙时段进行测试

### 稳定性测试

- **24 小时连续测试**：每小时发起一次，测试长期稳定性
- **网络波动测试**：在网络条件较差时的表现

### 身份验证

- **Moniker 映射验证**：确认 memo 中的 moniker 确实对应该 validator
- **Signer 地址验证**：验证 relayer 地址是否在 validator 的授权列表中
- **随机测试时间**：避免 validator 只在特定时间开启 relayer
