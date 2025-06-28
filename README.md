# 🧪 IBC Relayer 测试框架

一个专为 vota-bobtail 激励测试网设计的 IBC Relayer 测试和监控系统。

## 📋 功能特性

- ✅ **基础连通性测试** - 验证 IBC 连接和通道状态
- 📊 **数据包传输测试** - 测试 IBC 数据包的发送和接收
- ⚡ **性能测试** - 评估 relayer 的延迟和吞吐量
- 🎯 **IBC Relayer 测试** - 专门测试 validator 的 relayer 服务
- 📈 **批量压力测试** - 并发测试 relayer 处理能力
- ⏱️ **稳定性测试** - 长期监控 relayer 服务稳定性
- 🔍 **身份验证** - 验证 relayer 身份和 validator 匹配
- 📊 **详细报告** - 生成 HTML 和 Markdown 格式的测试报告
- 🔄 **连续监控** - 支持定时自动测试

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量示例文件：

```bash
cp env.example .env
```

编辑 `.env` 文件，填入正确的配置：

```bash
# Chain A (vota-bobtail)
CHAIN_A_RPC=https://vota-bobtail-rpc.dorafactory.org:443
CHAIN_A_ID=vota-bobtail
CHAIN_A_PREFIX=dora

# Chain B (osmosis-testnet)
CHAIN_B_RPC=https://rpc.testnet.osmosis.zone:443
CHAIN_B_ID=osmo-test-5
CHAIN_B_PREFIX=osmo

# IBC Configuration - 必须填入真实的connection和channel ID
CONNECTION_ID=connection-xxx  # 查询真实的connection ID
CHANNEL_ID=channel-xxx       # 查询真实的channel ID

# Test Configuration
TEST_MNEMONIC=your wallet mnemonic here
OSMOSIS_RECEIVE_ADDRESS=osmo1...your_osmosis_address...
```

### 🔍 如何获取真实的 Connection ID 和 Channel ID

**方法 1: 使用命令行查询**

```bash
# 查询vota-bobtail上的所有connections
dorad query ibc connection connections --node https://vota-bobtail-rpc.dorafactory.org:443

# 查询vota-bobtail上的所有channels
dorad query ibc channel channels --node https://vota-bobtail-rpc.dorafactory.org:443

# 查找连接到osmosis的channel
dorad query ibc channel channels --node https://vota-bobtail-rpc.dorafactory.org:443 | grep -A 10 -B 10 "osmo"
```

**方法 2: 联系项目团队**

- 联系 vota-bobtail 项目团队获取正确的 IBC 配置
- 查看项目文档或 Discord/Telegram 群组

**方法 3: 使用区块浏览器**

- 在 vota-bobtail 区块浏览器中搜索 IBC 相关交易
- 查看成功的 IBC 转账交易来获取正确的 channel ID

### 3. 构建项目

```bash
npm run build
```

## 🎯 IBC Relayer 测试

### 完整 Relayer 测试

运行包含基础测试、批量测试和稳定性测试的完整测试套件：

```bash
npm run dev relayer-test
# 或者
npm start relayer-test
```

### 单次转账测试

快速验证 relayer 是否正常工作：

```bash
npm run dev single-transfer
```

### 连续监控模式

启动连续监控，每小时自动测试一次：

```bash
npm run dev relayer-test --continuous
```

自定义测试间隔（每 2 小时测试一次）：

```bash
npm run dev relayer-test --continuous --interval 2
```

## 📊 查看结果

### 显示最近的测试日志

```bash
npm run dev show-logs
```

显示最近 20 条日志：

```bash
npm run dev show-logs --count 20
```

### 生成测试报告

```bash
npm run dev generate-report
```

这将生成：

- `ibc-relayer-report.html` - 可视化 HTML 报告
- `ibc-relayer-report.md` - Markdown 格式报告

## 🔧 其他命令

### 健康检查

检查链的连接状态：

```bash
npm run dev health
```

### 查看配置

显示当前配置：

```bash
npm run dev config
```

### 运行特定测试

```bash
# 连接稳定性测试
npm run dev run connection

# 数据包传输测试
npm run dev run packet

# 性能测试
npm run dev run performance

# IBC Relayer 测试
npm run dev run relayer
```

## 📋 测试流程说明

根据 [测试规则文档](test_rules.md)，IBC Relayer 测试包含以下步骤：

### 1. 基础测试流程

1. **检查 Channel 状态** - 验证 IBC channel 是否为 OPEN 状态
2. **发起 IBC Transfer** - 向 osmosis-testnet 发送测试交易
3. **等待 Acknowledgement** - 监控 packet acknowledgement
4. **验证目标链交易** - 在 osmosis 上确认交易接收
5. **记录测试日志** - 保存详细的测试结果

### 2. 测试数据记录

每次测试会记录以下信息：

| 字段            | 说明                       |
| --------------- | -------------------------- |
| 测试时间        | 发起交易的时间戳           |
| 交易 Hash       | vota-bobtail 上的交易 hash |
| Packet 序列     | IBC packet 序列号          |
| 是否成功        | true/false                 |
| 延迟(秒)        | 从发送到收到 ack 的时间    |
| 目标链交易 Hash | osmosis 上的接收交易 hash  |
| Relayer Signer  | 实际 relay 的地址          |
| Memo 标识       | memo 中的 moniker          |
| 错误信息        | 失败时的具体错误           |

### 3. 性能指标

系统会为每个 validator 计算以下指标：

- **成功率** - 成功 relay 的交易比例
- **平均延迟** - relay 交易的平均时间
- **稳定性** - 连续失败次数和正常运行时间
- **活跃度** - 最后活跃时间

## 🎨 报告示例

测试报告包含：

- 📊 **总体统计** - 成功率、平均延迟等关键指标
- 🏆 **Validator 排名** - 按性能排名的 validator 列表
- 📝 **测试日志** - 最近的测试记录
- 💡 **改进建议** - 基于测试结果的优化建议

## ⚙️ 高级配置

### Validator 配置

在环境变量中配置参与测试的 validators：

```bash
VALIDATORS_CONFIG='[
  {
    "moniker": "your-validator-moniker",
    "operatorAddress": "doravaloper1...your_real_validator_address...",
    "relayerAddresses": [],
    "isActive": true
  }
]'
```

> 💡 **提示**: `relayerAddresses` 可以留空，系统会自动从实际的 IBC 交易中识别真实的 relayer 地址。

### 测试参数调整

```bash
# 测试金额
RELAYER_TEST_AMOUNT=1

# 测试代币
RELAYER_TEST_DENOM=stake

# 超时时间（秒）
RELAYER_TIMEOUT_SECONDS=60

# 批量测试大小
RELAYER_BATCH_SIZE=10
```

## 🤝 贡献

欢迎提交 issue 和 pull request！

## �� 许可证

MIT License
