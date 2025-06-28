import chalk from 'chalk'

export class Logger {
  private static instance: Logger
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    this.logLevel = level
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.logLevel)
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    let formattedMessage = `${prefix} ${message}`

    if (data) {
      formattedMessage += '\n' + JSON.stringify(data, null, 2)
    }

    return formattedMessage
  }

  debug(message: string, data?: any) {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(this.formatMessage('debug', message, data)))
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(this.formatMessage('info', message, data)))
    }
  }

  success(message: string, data?: any) {
    if (this.shouldLog('info')) {
      console.log(chalk.green(this.formatMessage('success', message, data)))
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog('warn')) {
      console.log(chalk.yellow(this.formatMessage('warn', message, data)))
    }
  }

  error(message: string, data?: any) {
    if (this.shouldLog('error')) {
      console.log(chalk.red(this.formatMessage('error', message, data)))
    }
  }

  title(message: string) {
    console.log(chalk.cyan.bold(`\n=== ${message} ===\n`))
  }

  separator() {
    console.log(chalk.gray('-'.repeat(50)))
  }
}

export const logger = Logger.getInstance()
