# 连续 IBC 转账测试指南

## 概述

新添加的 `continuous-transfer` 命令允许你自动化地连续发送 IBC 转账交易，用于监控 relayer 性能和网络稳定性。

## 基本用法

### 1. 默认设置（每 30 秒一次，无限循环）

```bash
npm run dev continuous-transfer
```

### 2. 自定义间隔时间（每 60 秒一次）

```bash
npm run dev continuous-transfer -i 60
```

### 3. 限制测试次数（每 30 秒一次，最多 10 次）

```bash
npm run dev continuous-transfer -c 10
```

### 4. 组合参数（每 2 分钟一次，最多 50 次，遇到错误停止）

```bash
npm run dev continuous-transfer -i 120 -c 50 --stop-on-error
```

### 5. 启用详细日志

```bash
npm run dev continuous-transfer -v -i 30 -c 20
```

## 参数说明

| 参数                       | 说明                   | 默认值 | 示例              |
| -------------------------- | ---------------------- | ------ | ----------------- |
| `-i, --interval <seconds>` | 转账间隔时间（秒）     | 30     | `-i 60`           |
| `-c, --count <number>`     | 最大转账次数（0=无限） | 0      | `-c 100`          |
| `--stop-on-error`          | 遇到错误时停止         | false  | `--stop-on-error` |
| `-v, --verbose`            | 启用详细日志           | false  | `-v`              |

## 使用建议

### 短期测试（快速验证）

```bash
# 每15秒一次，测试10次
npm run dev continuous-transfer -i 15 -c 10 -v
```

### 中期监控（1 小时）

```bash
# 每30秒一次，测试120次（1小时）
npm run dev continuous-transfer -i 30 -c 120
```

### 长期监控（24 小时）

```bash
# 每5分钟一次，测试288次（24小时）
npm run dev continuous-transfer -i 300 -c 288
```

### 压力测试（高频率）

```bash
# 每10秒一次，测试100次，遇到错误停止
npm run dev continuous-transfer -i 10 -c 100 --stop-on-error -v
```

## 输出信息

测试过程中会显示：

- 每次转账的结果（成功/失败）
- 交易哈希
- 延迟时间
- Relayer 信息（名称和签名者地址）
- 实时统计信息（成功率、错误次数）

## 数据记录

所有测试数据会自动保存到：

- `relayer-test-logs.json` - 详细的测试日志
- `relayer-metrics.json` - 聚合的性能指标

## 优雅停止

- 按 `Ctrl+C` 一次：完成当前测试后停止
- 按 `Ctrl+C` 两次：立即强制退出

## 注意事项

1. **最小间隔限制**：为避免网络过载，最小间隔为 5 秒
2. **余额监控**：确保钱包有足够余额支持连续转账
3. **网络状况**：在网络不稳定时建议增加间隔时间
4. **Gas 费用**：连续测试会消耗一定的 gas 费用
5. **Relayer 状态**：确保目标 relayer 正常运行

## 常见使用场景

### 1. Relayer 性能基准测试

```bash
# 测试1小时，每分钟一次
npm run dev continuous-transfer -i 60 -c 60 -v
```

### 2. 网络稳定性监控

```bash
# 长期监控，每5分钟一次
npm run dev continuous-transfer -i 300
```

### 3. 错误诊断

```bash
# 高频测试，遇到错误立即停止
npm run dev continuous-transfer -i 10 --stop-on-error -v
```

### 4. 数据收集

```bash
# 收集24小时数据，每10分钟一次
npm run dev continuous-transfer -i 600 -c 144
```

## 分析结果

测试完成后，可以使用以下命令分析结果：

```bash
# 查看最近的测试日志
npm run dev show-logs --count 50

# 生成详细报告
npm run dev generate-report
```

## 示例输出

```
🔄 Starting continuous IBC transfer tests...
   Interval: 30 seconds
   Max count: unlimited
   Stop on error: no
   Press Ctrl+C to stop
═══════════════════════════════════════════════════════════════════════════════

📡 Test #1 starting...
✅ Test #1 completed successfully
   TX Hash: A1B2C3D4E5F6...
   Latency: 8456ms
   Relayer: breskulpeak | hermes 1.13.1+5e403dd5
   Signer: osmo1a8r6myutnep4apnhuhwjgf0s4r3egs8rtq7srf
📊 Stats: 1/1 success (100.0%), 0 errors
⏳ Waiting 22s until next test...

📡 Test #2 starting...
✅ Test #2 completed successfully
   TX Hash: F7G8H9I0J1K2...
   Latency: 7234ms
   Relayer: breskulpeak | hermes 1.13.1+5e403dd5
   Signer: osmo1a8r6myutnep4apnhuhwjgf0s4r3egs8rtq7srf
📊 Stats: 2/2 success (100.0%), 0 errors
⏳ Waiting 25s until next test...
```
