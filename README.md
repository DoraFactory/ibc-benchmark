# 🧪 IBC Relayer Testing Framework

An IBC Relayer testing and monitoring system specifically designed for the vota-bobtail incentivized testnet.

## 📋 Features

- ✅ **Basic Connectivity Testing** - Verify IBC connection and channel status
- 📊 **Packet Transmission Testing** - Test IBC packet sending and receiving
- ⚡ **Performance Testing** - Evaluate relayer latency and throughput
- 🎯 **IBC Relayer Testing** - Specifically test validator relayer services
- 📈 **Batch Stress Testing** - Concurrent testing of relayer processing capacity
- ⏱️ **Stability Testing** - Long-term monitoring of relayer service stability
- 🔍 **Identity Verification** - Verify relayer identity and validator matching
- 📊 **Detailed Reports** - Generate HTML and Markdown format test reports
- 🔄 **Continuous Monitoring** - Support scheduled automatic testing

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the environment variable example file:

```bash
cp env.example .env
```

Edit the `.env` file and fill in the correct configuration:

```bash
# Chain A (vota-bobtail)
CHAIN_A_RPC=https://vota-bobtail-rpc.dorafactory.org:443
CHAIN_A_ID=vota-bobtail
CHAIN_A_PREFIX=dora

# Chain B (osmosis-testnet)
CHAIN_B_RPC=https://rpc.testnet.osmosis.zone:443
CHAIN_B_ID=osmo-test-5
CHAIN_B_PREFIX=osmo

# IBC Configuration - Must fill in real connection and channel IDs
CONNECTION_ID=connection-xxx  # Query real connection ID
CHANNEL_ID=channel-xxx       # Query real channel ID

# Test Configuration
TEST_MNEMONIC=your wallet mnemonic here
OSMOSIS_RECEIVE_ADDRESS=osmo1...your_osmosis_address...
```

### 🔍 How to Get Real Connection ID and Channel ID

**Method 1: Use Command Line Query**

```bash
# Query all connections on vota-bobtail
dorad query ibc connection connections --node https://vota-bobtail-rpc.dorafactory.org:443

# Query all channels on vota-bobtail
dorad query ibc channel channels --node https://vota-bobtail-rpc.dorafactory.org:443

# Find channels connected to osmosis
dorad query ibc channel channels --node https://vota-bobtail-rpc.dorafactory.org:443 | grep -A 10 -B 10 "osmo"
```

**Method 2: Contact Project Team**

- Contact the vota-bobtail project team for correct IBC configuration
- Check project documentation or Discord/Telegram groups

**Method 3: Use Block Explorer**

- Search for IBC-related transactions in the vota-bobtail block explorer
- View successful IBC transfer transactions to get the correct channel ID

### 3. Build Project

```bash
npm run build
```

## 🎯 IBC Relayer Testing

### Complete Relayer Testing

Run a complete test suite including basic tests, batch tests, and stability tests:

```bash
npm run dev relayer-test
# or
npm start relayer-test
```

### Single Transfer Test

Quick verification that the relayer is working properly:

```bash
npm run dev single-transfer
```

### Continuous Monitoring Mode

Start continuous monitoring with automatic testing every hour:

```bash
npm run dev relayer-test --continuous
```

Custom test interval (test every 2 hours):

```bash
npm run dev relayer-test --continuous --interval 2
```

## 📊 View Results

### Show Recent Test Logs

```bash
npm run dev show-logs
```

Show the last 20 logs:

```bash
npm run dev show-logs --count 20
```

### Generate Test Report

```bash
npm run dev generate-report
```

This will generate:

- `ibc-relayer-report.html` - Visual HTML report
- `ibc-relayer-report.md` - Markdown format report

## 🔧 Other Commands

### Health Check

Check chain connection status:

```bash
npm run dev health
```

### View Configuration

Display current configuration:

```bash
npm run dev config
```

### Run Specific Tests

```bash
# Connection stability test
npm run dev run connection

# Packet transmission test
npm run dev run packet

# Performance test
npm run dev run performance

# IBC Relayer test
npm run dev run relayer
```

## 📋 Test Process Description

According to the [Test Rules Document](test_rules.md), IBC Relayer testing includes the following steps:

### 1. Basic Test Process

1. **Check Channel Status** - Verify that the IBC channel is in OPEN state
2. **Initiate IBC Transfer** - Send test transaction to osmosis-testnet
3. **Wait for Acknowledgement** - Monitor packet acknowledgement
4. **Verify Target Chain Transaction** - Confirm transaction receipt on osmosis
5. **Record Test Logs** - Save detailed test results

### 2. Test Data Recording

Each test records the following information:

| Field                | Description                                  |
| -------------------- | -------------------------------------------- |
| Test Time            | Timestamp when the transaction was initiated |
| Transaction Hash     | Transaction hash on vota-bobtail             |
| Packet Sequence      | IBC packet sequence number                   |
| Success Status       | true/false                                   |
| Latency (seconds)    | Time from send to acknowledgement receipt    |
| Target Chain Tx Hash | Receive transaction hash on osmosis          |
| Relayer Signer       | Actual relay address                         |
| Memo Identifier      | Moniker in memo                              |
| Error Message        | Specific error when failed                   |

### 3. Performance Metrics

The system calculates the following metrics for each validator:

- **Success Rate** - Proportion of successfully relayed transactions
- **Average Latency** - Average time for relaying transactions
- **Stability** - Consecutive failure count and uptime
- **Activity** - Last active time

## 🎨 Report Example

Test reports include:

- 📊 **Overall Statistics** - Key metrics like success rate, average latency
- 🏆 **Validator Rankings** - Performance-ranked validator list
- 📝 **Test Logs** - Recent test records
- 💡 **Improvement Suggestions** - Optimization recommendations based on test results

## ⚙️ Advanced Configuration

### Validator Configuration

Configure validators participating in tests in environment variables:

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

> 💡 **Tip**: `relayerAddresses` can be left empty, the system will automatically identify real relayer addresses from actual IBC transactions.

### Test Parameter Adjustment

```bash
# Test amount
RELAYER_TEST_AMOUNT=1

# Test token
RELAYER_TEST_DENOM=stake

# Timeout (seconds)
RELAYER_TIMEOUT_SECONDS=60

# Batch test size
RELAYER_BATCH_SIZE=10
```

## 🤝 Contributing

Issues and pull requests are welcome!

## 📄 License

MIT License
