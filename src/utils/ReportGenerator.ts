import { RelayerTestLog, RelayerPerformanceMetrics } from '../types'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'

export class ReportGenerator {
  private logs: RelayerTestLog[]
  private metrics: RelayerPerformanceMetrics[]

  constructor(logs: RelayerTestLog[], metrics: RelayerPerformanceMetrics[]) {
    this.logs = logs
    this.metrics = metrics
  }

  generateHtmlReport(): string {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IBC Relayer 测试报告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 30px;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #e1e5e9;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2d3748;
            margin: 0;
        }
        .header .subtitle {
            color: #718096;
            margin-top: 10px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card.success {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }
        .summary-card.warning {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .summary-card.info {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            opacity: 0.9;
        }
        .summary-card .value {
            font-size: 28px;
            font-weight: bold;
            margin: 0;
        }
        .section {
            margin-bottom: 40px;
        }
        .section h2 {
            color: #2d3748;
            border-left: 4px solid #4299e1;
            padding-left: 15px;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        th {
            background-color: #f7fafc;
            font-weight: 600;
            color: #2d3748;
        }
        .status-success {
            color: #38a169;
            font-weight: bold;
        }
        .status-failed {
            color: #e53e3e;
            font-weight: bold;
        }
        .latency-excellent { color: #38a169; }
        .latency-good { color: #d69e2e; }
        .latency-poor { color: #e53e3e; }
        .validator-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .validator-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            background: white;
        }
        .validator-card h4 {
            margin: 0 0 15px 0;
            color: #2d3748;
        }
        .metric-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .metric-label {
            color: #718096;
        }
        .metric-value {
            font-weight: 600;
            color: #2d3748;
        }
        .progress-bar {
            width: 100%;
            height: 8px;
            background-color: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 5px;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .progress-success { background-color: #38a169; }
        .progress-warning { background-color: #d69e2e; }
        .progress-danger { background-color: #e53e3e; }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #718096;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 IBC Relayer 测试报告</h1>
            <div class="subtitle">vota-bobtail 激励测试网 - 生成时间: ${new Date().toLocaleString(
              'zh-CN'
            )}</div>
        </div>

        <div class="summary">
            <div class="summary-card info">
                <h3>总测试数</h3>
                <div class="value">${this.logs.length}</div>
            </div>
            <div class="summary-card success">
                <h3>成功率</h3>
                <div class="value">${this.calculateOverallSuccessRate().toFixed(
                  1
                )}%</div>
            </div>
            <div class="summary-card warning">
                <h3>平均延迟</h3>
                <div class="value">${this.calculateAverageLatency().toFixed(
                  0
                )}ms</div>
            </div>
            <div class="summary-card">
                <h3>活跃 Validators</h3>
                <div class="value">${this.metrics.length}</div>
            </div>
        </div>

        <div class="section">
            <h2>📊 Validator 性能排名</h2>
            <div class="validator-metrics">
                ${this.generateValidatorCards()}
            </div>
        </div>

        <div class="section">
            <h2>📝 最近测试日志</h2>
            <table>
                <thead>
                    <tr>
                        <th>测试时间</th>
                        <th>交易Hash</th>
                        <th>Packet序列</th>
                        <th>状态</th>
                        <th>延迟(ms)</th>
                        <th>Relayer标识</th>
                        <th>Signer地址</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.generateLogRows()}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>📈 性能统计</h2>
            <table>
                <thead>
                    <tr>
                        <th>Validator</th>
                        <th>总测试数</th>
                        <th>成功数</th>
                        <th>成功率</th>
                        <th>平均延迟</th>
                        <th>最大延迟</th>
                        <th>连续失败</th>
                        <th>状态</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.generateMetricsRows()}
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>此报告由 IBC Relayer 测试系统自动生成</p>
        </div>
    </div>
</body>
</html>
    `
    return html
  }

  generateMarkdownReport(): string {
    const md = `# 🧪 IBC Relayer 测试报告

**生成时间**: ${new Date().toLocaleString('zh-CN')}  
**测试网络**: vota-bobtail 激励测试网

---

## 📊 总体统计

| 指标 | 数值 |
|------|------|
| 总测试数 | ${this.logs.length} |
| 成功测试数 | ${this.logs.filter((l) => l.success).length} |
| 成功率 | ${this.calculateOverallSuccessRate().toFixed(2)}% |
| 平均延迟 | ${this.calculateAverageLatency().toFixed(0)}ms |
| 活跃 Validators | ${this.metrics.length} |

---

## 🏆 Validator 性能排名

${this.generateMarkdownValidatorRanking()}

---

## 📈 详细性能指标

| Validator | 总测试 | 成功 | 成功率 | 平均延迟 | 最大延迟 | 连续失败 | 状态 |
|-----------|--------|------|--------|----------|----------|----------|------|
${this.metrics
  .map(
    (m) =>
      `| ${m.validatorMoniker} | ${m.totalTests} | ${
        m.successfulRelays
      } | ${m.successRate.toFixed(1)}% | ${m.averageLatency.toFixed(
        0
      )}ms | ${m.maxLatency.toFixed(0)}ms | ${m.continuousFailures} | ${
        m.successRate >= 90
          ? '🟢 优秀'
          : m.successRate >= 70
          ? '🟡 良好'
          : '🔴 需改进'
      } |`
  )
  .join('\n')}

---

## 📝 最近测试记录 (最新10条)

| 时间 | 状态 | 延迟 | Validator | Packet序列 |
|------|------|------|-----------|------------|
${this.logs
  .slice(-10)
  .reverse()
  .map(
    (log) =>
      `| ${log.testTime.toLocaleString('zh-CN')} | ${
        log.success ? '✅ 成功' : '❌ 失败'
      } | ${log.latency}ms | ${
        log.memoIdentifier?.replace('relayed-by:', '') || 'Unknown'
      } | ${log.packetSequence} |`
  )
  .join('\n')}

---

## 💡 建议和总结

${this.generateRecommendations()}

---

*此报告由 IBC Relayer 测试系统自动生成*
`
    return md
  }

  private calculateOverallSuccessRate(): number {
    if (this.logs.length === 0) return 0
    const successCount = this.logs.filter((log) => log.success).length
    return (successCount / this.logs.length) * 100
  }

  private calculateAverageLatency(): number {
    const successfulLogs = this.logs.filter((log) => log.success)
    if (successfulLogs.length === 0) return 0
    const totalLatency = successfulLogs.reduce(
      (sum, log) => sum + log.latency,
      0
    )
    return totalLatency / successfulLogs.length
  }

  private generateValidatorCards(): string {
    return this.metrics
      .sort((a, b) => b.successRate - a.successRate)
      .map((metric) => {
        const progressClass =
          metric.successRate >= 90
            ? 'progress-success'
            : metric.successRate >= 70
            ? 'progress-warning'
            : 'progress-danger'

        return `
        <div class="validator-card">
            <h4>🏷️ ${metric.validatorMoniker}</h4>
            <div class="metric-row">
                <span class="metric-label">成功率</span>
                <span class="metric-value">${metric.successRate.toFixed(
                  1
                )}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill ${progressClass}" style="width: ${
          metric.successRate
        }%"></div>
            </div>
            <div class="metric-row">
                <span class="metric-label">总测试数</span>
                <span class="metric-value">${metric.totalTests}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">平均延迟</span>
                <span class="metric-value">${metric.averageLatency.toFixed(
                  0
                )}ms</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">连续失败次数</span>
                <span class="metric-value">${metric.continuousFailures}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">最后活跃</span>
                <span class="metric-value">${
                  metric.lastActiveTime
                    ? metric.lastActiveTime.toLocaleString('zh-CN')
                    : '未知'
                }</span>
            </div>
        </div>
        `
      })
      .join('')
  }

  private generateLogRows(): string {
    return this.logs
      .slice(-20) // 显示最近20条
      .reverse()
      .map((log) => {
        const statusClass = log.success ? 'status-success' : 'status-failed'
        const statusText = log.success ? '✅ 成功' : '❌ 失败'
        const latencyClass =
          log.latency < 5000
            ? 'latency-excellent'
            : log.latency < 10000
            ? 'latency-good'
            : 'latency-poor'

        return `
        <tr>
            <td>${log.testTime.toLocaleString('zh-CN')}</td>
            <td style="font-family: monospace; font-size: 12px;">${log.txHash.slice(
              0,
              16
            )}...</td>
            <td>${log.packetSequence}</td>
            <td class="${statusClass}">${statusText}</td>
            <td class="${latencyClass}">${log.latency}</td>
            <td>${
              log.memoIdentifier?.replace('relayed-by:', '') || 'Unknown'
            }</td>
            <td style="font-family: monospace; font-size: 12px;">${
              log.relayerSigner?.slice(0, 16) + '...' || 'Unknown'
            }</td>
        </tr>
        `
      })
      .join('')
  }

  private generateMetricsRows(): string {
    return this.metrics
      .sort((a, b) => b.successRate - a.successRate)
      .map((metric) => {
        const statusEmoji =
          metric.successRate >= 90
            ? '🟢'
            : metric.successRate >= 70
            ? '🟡'
            : '🔴'
        const statusText =
          metric.successRate >= 90
            ? '优秀'
            : metric.successRate >= 70
            ? '良好'
            : '需改进'

        return `
        <tr>
            <td><strong>${metric.validatorMoniker}</strong></td>
            <td>${metric.totalTests}</td>
            <td>${metric.successfulRelays}</td>
            <td>${metric.successRate.toFixed(1)}%</td>
            <td>${metric.averageLatency.toFixed(0)}ms</td>
            <td>${metric.maxLatency.toFixed(0)}ms</td>
            <td>${metric.continuousFailures}</td>
            <td>${statusEmoji} ${statusText}</td>
        </tr>
        `
      })
      .join('')
  }

  private generateMarkdownValidatorRanking(): string {
    return this.metrics
      .sort((a, b) => b.successRate - a.successRate)
      .map((metric, index) => {
        const medal =
          index === 0
            ? '🥇'
            : index === 1
            ? '🥈'
            : index === 2
            ? '🥉'
            : `${index + 1}.`
        const status =
          metric.successRate >= 90
            ? '🟢 优秀'
            : metric.successRate >= 70
            ? '🟡 良好'
            : '🔴 需改进'

        return `${medal} **${
          metric.validatorMoniker
        }** - 成功率: ${metric.successRate.toFixed(1)}% (${
          metric.successfulRelays
        }/${metric.totalTests}) ${status}`
      })
      .join('\n')
  }

  private generateRecommendations(): string {
    const overallSuccessRate = this.calculateOverallSuccessRate()
    const avgLatency = this.calculateAverageLatency()
    const poorPerformers = this.metrics.filter((m) => m.successRate < 70)

    let recommendations = []

    if (overallSuccessRate < 80) {
      recommendations.push(
        '⚠️ **整体成功率偏低**: 建议检查网络连接和 relayer 配置'
      )
    }

    if (avgLatency > 10000) {
      recommendations.push('⚠️ **平均延迟较高**: 建议优化 relayer 响应速度')
    }

    if (poorPerformers.length > 0) {
      recommendations.push(
        `⚠️ **性能不佳的 Validators**: ${poorPerformers
          .map((p) => p.validatorMoniker)
          .join(', ')} 需要改进`
      )
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '✅ **整体表现良好**: 所有 validators 的 relayer 服务运行正常'
      )
    }

    return recommendations.join('\n\n')
  }

  saveReports(outputDir: string = process.cwd()): void {
    try {
      const htmlReport = this.generateHtmlReport()
      const mdReport = this.generateMarkdownReport()

      const htmlPath = join(outputDir, 'ibc-relayer-report.html')
      const mdPath = join(outputDir, 'ibc-relayer-report.md')

      writeFileSync(htmlPath, htmlReport, 'utf-8')
      writeFileSync(mdPath, mdReport, 'utf-8')

      logger.info(`Reports saved:`)
      logger.info(`  HTML: ${htmlPath}`)
      logger.info(`  Markdown: ${mdPath}`)
    } catch (error) {
      logger.error('Failed to save reports:', error)
    }
  }

  generateJSONSummary(): any {
    return {
      summary: {
        totalTests: this.logs.length,
        successfulTests: this.logs.filter((l) => l.success).length,
        successRate: this.calculateOverallSuccessRate(),
        averageLatency: this.calculateAverageLatency(),
        activeValidators: this.metrics.length,
        generatedAt: new Date().toISOString(),
      },
      validators: this.metrics.sort((a, b) => b.successRate - a.successRate),
      recentLogs: this.logs.slice(-10).reverse(),
    }
  }
}
