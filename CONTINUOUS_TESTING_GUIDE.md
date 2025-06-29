# Continuous IBC Transfer Testing Guide

## Overview

The newly added `continuous-transfer` command allows you to automatically send continuous IBC transfer transactions for monitoring relayer performance and network stability.

## Basic Usage

### 1. Default Settings (Every 30 seconds, infinite loop)

```bash
npm run dev continuous-transfer
```

### 2. Custom Interval (Every 60 seconds)

```bash
npm run dev continuous-transfer -i 60
```

### 3. Limit Test Count (Every 30 seconds, maximum 10 times)

```bash
npm run dev continuous-transfer -c 10
```

### 4. Combined Parameters (Every 2 minutes, maximum 50 times, stop on error)

```bash
npm run dev continuous-transfer -i 120 -c 50 --stop-on-error
```

### 5. Enable Verbose Logging

```bash
npm run dev continuous-transfer -v -i 30 -c 20
```

## Parameter Description

| Parameter                  | Description                     | Default | Example           |
| -------------------------- | ------------------------------- | ------- | ----------------- |
| `-i, --interval <seconds>` | Transfer interval (seconds)     | 30      | `-i 60`           |
| `-c, --count <number>`     | Max transfer count (0=infinite) | 0       | `-c 100`          |
| `--stop-on-error`          | Stop on error                   | false   | `--stop-on-error` |
| `-v, --verbose`            | Enable verbose logging          | false   | `-v`              |

## Usage Recommendations

### Short-term Testing (Quick Verification)

```bash
# Every 15 seconds, test 10 times
npm run dev continuous-transfer -i 15 -c 10 -v
```

### Medium-term Monitoring (1 hour)

```bash
# Every 30 seconds, test 120 times (1 hour)
npm run dev continuous-transfer -i 30 -c 120
```

### Long-term Monitoring (24 hours)

```bash
# Every 5 minutes, test 288 times (24 hours)
npm run dev continuous-transfer -i 300 -c 288
```

### Stress Testing (High Frequency)

```bash
# Every 10 seconds, test 100 times, stop on error
npm run dev continuous-transfer -i 10 -c 100 --stop-on-error -v
```

## Output Information

During testing, the following will be displayed:

- Result of each transfer (success/failure)
- Transaction hash
- Latency time
- Relayer information (name and signer address)
- Real-time statistics (success rate, error count)

## Data Recording

All test data is automatically saved to:

- `relayer-test-logs.json` - Detailed test logs
- `relayer-metrics.json` - Aggregated performance metrics

## Graceful Stop

- Press `Ctrl+C` once: Stop after completing current test
- Press `Ctrl+C` twice: Force exit immediately

## Notes

1. **Minimum Interval Limit**: To avoid network overload, minimum interval is 5 seconds
2. **Balance Monitoring**: Ensure wallet has sufficient balance for continuous transfers
3. **Network Conditions**: Recommend increasing interval during network instability
4. **Gas Fees**: Continuous testing will consume certain gas fees
5. **Relayer Status**: Ensure target relayer is running normally

## Common Use Cases

### 1. Relayer Performance Benchmarking

```bash
# Test for 1 hour, once per minute
npm run dev continuous-transfer -i 60 -c 60 -v
```

### 2. Network Stability Monitoring

```bash
# Long-term monitoring, every 5 minutes
npm run dev continuous-transfer -i 300
```

### 3. Error Diagnosis

```bash
# High-frequency testing, stop immediately on error
npm run dev continuous-transfer -i 10 --stop-on-error -v
```

### 4. Data Collection

```bash
# Collect 24-hour data, every 10 minutes
npm run dev continuous-transfer -i 600 -c 144
```

## Analyze Results

After testing is complete, you can analyze results using the following commands:

```bash
# View recent test logs
npm run dev show-logs --count 50

# Generate detailed report
npm run dev generate-report
```

## Example Output

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
