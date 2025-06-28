#!/bin/bash

# IBC连续测试后台运行脚本
# 用法: ./run_continuous_test.sh [选项]

set -e

# 默认配置
DEFAULT_INTERVAL=12     # 默认间隔12秒
DEFAULT_COUNT=0          # 默认无限循环
DEFAULT_LOG_DIR="logs"   # 默认日志目录
SCRIPT_NAME="ibc-continuous-test"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "IBC连续测试后台运行脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -i, --interval SECONDS    测试间隔时间（秒，默认: $DEFAULT_INTERVAL）"
    echo "  -c, --count NUMBER        最大测试次数（0=无限，默认: $DEFAULT_COUNT）"
    echo "  -l, --log-dir DIR         日志目录（默认: $DEFAULT_LOG_DIR）"
    echo "  -v, --verbose             启用详细日志"
    echo "  --stop-on-error           遇到错误时停止"
    echo "  -h, --help                显示此帮助信息"
    echo ""
    echo "管理命令:"
    echo "  --status                  查看运行状态"
    echo "  --stop                    停止后台进程"
    echo "  --logs                    查看实时日志"
    echo "  --tail [LINES]            查看最近的日志（默认50行）"
    echo ""
    echo "示例:"
    echo "  $0 -i 60 -c 100           # 每分钟测试一次，共100次"
    echo "  $0 -i 300 --verbose       # 每5分钟测试一次，详细日志，无限循环"
    echo "  $0 --status               # 查看运行状态"
    echo "  $0 --stop                 # 停止后台测试"
    echo "  $0 --logs                 # 查看实时日志"
}

# 日志函数
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# 检查依赖
check_dependencies() {
    if ! command -v npm &> /dev/null; then
        log_error "npm未找到，请安装Node.js和npm"
        exit 1
    fi
    
    if [ ! -f "package.json" ]; then
        log_error "package.json未找到，请在项目根目录运行此脚本"
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        log_warn ".env文件未找到，请确保环境变量配置正确"
    fi
}

# 创建日志目录
setup_log_directory() {
    local log_dir="$1"
    if [ ! -d "$log_dir" ]; then
        mkdir -p "$log_dir"
        log "创建日志目录: $log_dir"
    fi
}

# 获取PID文件路径
get_pid_file() {
    echo "${LOG_DIR}/${SCRIPT_NAME}.pid"
}

# 获取日志文件路径
get_log_file() {
    echo "${LOG_DIR}/${SCRIPT_NAME}-$(date '+%Y%m%d').log"
}

# 获取错误日志文件路径
get_error_log_file() {
    echo "${LOG_DIR}/${SCRIPT_NAME}-error-$(date '+%Y%m%d').log"
}

# 检查是否已在运行
check_running() {
    local pid_file=$(get_pid_file)
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0  # 正在运行
        else
            rm -f "$pid_file"  # 清理无效的PID文件
            return 1  # 未运行
        fi
    fi
    return 1  # 未运行
}

# 显示运行状态
show_status() {
    local pid_file=$(get_pid_file)
    
    if check_running; then
        local pid=$(cat "$pid_file")
        local log_file=$(get_log_file)
        
        log_info "IBC连续测试正在运行"
        echo "  PID: $pid"
        echo "  日志文件: $log_file"
        echo "  启动时间: $(ps -p "$pid" -o lstart= 2>/dev/null || echo '未知')"
        
        # 显示最近的测试结果
        if [ -f "$log_file" ]; then
            echo ""
            echo "最近的测试结果:"
            tail -n 5 "$log_file" | grep -E "(SUCCESS|ERROR|✅|❌)" || echo "  暂无测试结果"
        fi
    else
        log_info "IBC连续测试未运行"
    fi
}

# 停止后台进程
stop_process() {
    local pid_file=$(get_pid_file)
    
    if check_running; then
        local pid=$(cat "$pid_file")
        log "停止IBC连续测试进程 (PID: $pid)..."
        
        # 尝试优雅停止
        kill "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
            sleep 1
            ((count++))
        done
        
        # 如果还在运行，强制停止
        if ps -p "$pid" > /dev/null 2>&1; then
            log_warn "强制停止进程..."
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
        log "IBC连续测试已停止"
    else
        log_info "IBC连续测试未运行"
    fi
}

# 查看实时日志
show_logs() {
    local log_file=$(get_log_file)
    
    if [ ! -f "$log_file" ]; then
        log_error "日志文件不存在: $log_file"
        exit 1
    fi
    
    log_info "显示实时日志 (Ctrl+C退出):"
    tail -f "$log_file"
}

# 查看最近日志
show_tail() {
    local lines=${1:-50}
    local log_file=$(get_log_file)
    
    if [ ! -f "$log_file" ]; then
        log_error "日志文件不存在: $log_file"
        exit 1
    fi
    
    log_info "显示最近 $lines 行日志:"
    tail -n "$lines" "$log_file"
}

# 启动连续测试
start_continuous_test() {
    local interval=$1
    local count=$2
    local verbose=$3
    local stop_on_error=$4
    local log_file=$(get_log_file)
    local error_log_file=$(get_error_log_file)
    local pid_file=$(get_pid_file)
    
    # 检查是否已在运行
    if check_running; then
        log_error "IBC连续测试已在运行，请先停止现有进程"
        show_status
        exit 1
    fi
    
    # 构建命令
    local cmd="npm run dev continuous-transfer -- -i $interval"
    
    if [ "$count" -gt 0 ]; then
        cmd="$cmd -c $count"
    fi
    
    if [ "$verbose" = "true" ]; then
        cmd="$cmd -v"
    fi
    
    if [ "$stop_on_error" = "true" ]; then
        cmd="$cmd --stop-on-error"
    fi
    
    log "启动IBC连续测试..."
    log_info "间隔: ${interval}秒"
    log_info "次数: $([ "$count" -eq 0 ] && echo "无限" || echo "$count")"
    log_info "详细日志: $verbose"
    log_info "遇错停止: $stop_on_error"
    log_info "日志文件: $log_file"
    
    # 启动后台进程
    nohup bash -c "
        echo \"[$(date '+%Y-%m-%d %H:%M:%S')] 开始IBC连续测试\" >> '$log_file'
        echo \"[$(date '+%Y-%m-%d %H:%M:%S')] 命令: $cmd\" >> '$log_file'
        $cmd >> '$log_file' 2>> '$error_log_file'
        echo \"[$(date '+%Y-%m-%d %H:%M:%S')] IBC连续测试结束\" >> '$log_file'
    " > /dev/null 2>&1 &
    
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log "IBC连续测试已启动 (PID: $pid)"
    log_info "使用 '$0 --status' 查看状态"
    log_info "使用 '$0 --logs' 查看实时日志"
    log_info "使用 '$0 --stop' 停止测试"
}

# 解析命令行参数
INTERVAL=$DEFAULT_INTERVAL
COUNT=$DEFAULT_COUNT
LOG_DIR=$DEFAULT_LOG_DIR
VERBOSE=false
STOP_ON_ERROR=false
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--interval)
            INTERVAL="$2"
            shift 2
            ;;
        -c|--count)
            COUNT="$2"
            shift 2
            ;;
        -l|--log-dir)
            LOG_DIR="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --stop-on-error)
            STOP_ON_ERROR=true
            shift
            ;;
        --status)
            COMMAND="status"
            shift
            ;;
        --stop)
            COMMAND="stop"
            shift
            ;;
        --logs)
            COMMAND="logs"
            shift
            ;;
        --tail)
            COMMAND="tail"
            TAIL_LINES="${2:-50}"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
done

# 主逻辑
main() {
    # 检查依赖
    check_dependencies
    
    # 设置日志目录
    setup_log_directory "$LOG_DIR"
    
    case "$COMMAND" in
        "status")
            show_status
            ;;
        "stop")
            stop_process
            ;;
        "logs")
            show_logs
            ;;
        "tail")
            show_tail "$TAIL_LINES"
            ;;
        "")
            # 启动连续测试
            start_continuous_test "$INTERVAL" "$COUNT" "$VERBOSE" "$STOP_ON_ERROR"
            ;;
        *)
            log_error "未知命令: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# 信号处理
trap 'log_warn "收到中断信号，正在清理..."; exit 130' INT TERM

# 运行主函数
main "$@" 