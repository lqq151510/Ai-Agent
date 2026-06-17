# AI Agent 监控体系

本目录包含 AI Agent 项目的生产化监控配置，基于 Prometheus + Grafana 构建。

## 架构图

```
┌─────────────┐    /actuator/prometheus    ┌──────────────┐    query    ┌─────────┐
│   Backend   │ ──────────────────────────▶ │  Prometheus  │ ──────────▶ │ Grafana │
│ (Spring Boot│                              │  (采集+存储) │             │ (可视化) │
│  Actuator)  │                              └──────┬───────┘             └─────────┘
└─────────────┘                                     │
       ▲                                             │ scrape
       │                                             ▼
┌──────┴───────┐                            ┌──────────────┐
│ Node Exporter│ ◀────── scrape ─────────── │              │
│ (主机指标)    │                             └──────────────┘
└──────────────┘
```

数据流：Backend 通过 Spring Boot Actuator 暴露 `/actuator/prometheus` 端点，Prometheus 定时抓取指标并存储，Grafana 从 Prometheus 查询数据并渲染仪表盘。Node Exporter 提供主机级 CPU/内存/磁盘/网络指标。

## 目录结构

```
monitoring/
├── README.md                              # 本文档
├── prometheus.yml                         # Prometheus 主配置（Docker Compose 用）
├── alert.rules.yml                        # 告警规则（Docker Compose 用）
└── grafana/
    ├── dashboard.json                     # Grafana 仪表盘 JSON
    └── provisioning/
        ├── datasources/
        │   └── prometheus.yml             # 数据源自动配置
        └── dashboards/
            └── dashboard.yml              # 仪表盘自动加载配置
```

## 快速启动（Docker Compose）

### 1. 启动监控栈

```bash
# 在项目根目录执行
docker-compose up -d prometheus grafana node-exporter
```

### 2. 访问地址

| 服务            | 地址                      | 说明                          |
| --------------- | ------------------------- | ----------------------------- |
| Prometheus      | http://localhost:9090     | 指标查询、告警状态、目标健康  |
| Grafana         | http://localhost:3000     | 仪表盘可视化                  |
| Node Exporter   | http://localhost:9100     | 主机指标（通常不直接访问）    |

### 3. Grafana 默认登录

- 用户名：`admin`
- 密码：`admin`（通过环境变量 `GRAFANA_ADMIN_PASSWORD` 覆盖）

> **生产环境警告**：默认密码 `admin/admin` 仅用于开发测试。生产环境必须通过环境变量修改：
> ```bash
> export GRAFANA_ADMIN_USER=your_admin
> export GRAFANA_ADMIN_PASSWORD=your_strong_password
> ```

### 4. 验证指标采集

启动后访问 Prometheus UI：
- 目标状态：http://localhost:9090/targets （确认 `ai-agent-backend` 和 `node-exporter` 状态为 UP）
- 指标查询：http://localhost:9090/graph （查询 `agent_chat_requests_total`）

## K8s 部署

```bash
# 创建监控命名空间
kubectl apply -f k8s/monitoring-namespace.yaml

# 部署 Prometheus（含 ConfigMap + RBAC + Deployment + Service）
kubectl apply -f k8s/prometheus-config.yaml
kubectl apply -f k8s/prometheus-deployment.yaml

# 部署 Grafana（含 ConfigMap + Deployment + Service）
kubectl apply -f k8s/grafana-deployment.yaml

# 若使用 Prometheus Operator，部署 ServiceMonitor
kubectl apply -f k8s/servicemonitor.yaml

# Backend Deployment 已添加 prometheus.io/scrape 注解，无需额外操作
```

> **注意**：Grafana Deployment 引用了 `grafana-admin` Secret，部署前需创建：
> ```bash
> kubectl create secret generic grafana-admin \
>   --from-literal=username=admin \
>   --from-literal=password=YOUR_STRONG_PASSWORD \
>   -n monitoring
> ```

## 告警规则说明

告警规则定义在 `alert.rules.yml`（Docker Compose）和 `k8s/prometheus-config.yaml`（K8s）中：

| 告警名称              | 触发条件                                          | 持续时间 | 严重级别 |
| --------------------- | ------------------------------------------------- | -------- | -------- |
| `ServiceDown`         | `up == 0`（抓取失败）                             | 1m       | critical |
| `AgentHighErrorRate`  | 错误率 > 10%（5 分钟窗口）                        | 2m       | warning  |
| `AgentHighLatencyP95` | P95 响应时间 > 5s（5 分钟窗口）                   | 5m       | warning  |
| `JvmHeapMemoryHigh`   | 堆内存使用 > 90% 最大值                           | 5m       | warning  |

> 当前未集成 Alertmanager，告警仅在 Prometheus UI 的 Alerts 页面显示为 firing 状态。生产环境建议部署 Alertmanager 并配置通知渠道（邮件/Slack/钉钉等）。

## 自定义指标列表

Backend 通过 Micrometer 注册的自定义业务指标：

| 指标名称                          | 类型    | Tags              | 说明                          |
| --------------------------------- | ------- | ----------------- | ----------------------------- |
| `agent.chat.requests`             | Counter | provider, model   | Agent 对话请求总数            |
| `agent.chat.errors`               | Counter | provider, model   | Agent 对话错误总数            |
| `agent.chat.duration`             | Timer   | provider          | Agent 对话耗时分布            |
| `agent.sessions.active`           | Gauge   | -                 | 活跃会话数（24h 内有更新）    |
| `coach.scaffolds.generated`       | Counter | -                 | Coach 脚手架生成总数          |
| `coach.requirements.broken.down`  | Counter | -                 | Coach 需求拆解总数            |

埋点位置：
- `AgentService.chat()` / `AgentService.streamChat()` - 对话请求、错误、耗时
- `CoachService.breakdown()` - 需求拆解计数
- `CoachService.generateScaffold()` - 脚手架生成计数
- `SessionService.countActiveSessions()` - 活跃会话数（Gauge 自动采集）

## 仪表盘面板

Grafana 仪表盘（`dashboard.json`）包含 8 个面板：

1. **Agent 对话 QPS** - 按 provider/model 分组的请求速率
2. **Agent 对话错误率** - 错误数 / 请求数百分比
3. **Agent 对话 P95/P99 响应时间** - 耗时分布
4. **活跃会话数** - 实时活跃会话数
5. **JVM 堆内存使用** - 堆内存使用量与最大值
6. **JVM 线程数** - 按线程状态分组
7. **Coach 脚手架与需求拆解** - 近 1 小时生成数
8. **HTTP 请求 P95 响应时间分布** - 按 URI 分组

## 配置说明

### Backend application.yml 监控配置

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
  endpoint:
    health:
      probes:
        enabled: true
      show-details: when-authorized
    prometheus:
      enabled: true
  metrics:
    tags:
      application: ai-agent-backend
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

### 环境变量

| 变量名                   | 默认值 | 说明                        |
| ------------------------ | ------ | --------------------------- |
| `PROMETHEUS_PORT`        | 9090   | Prometheus 暴露端口         |
| `GRAFANA_PORT`           | 3000   | Grafana 暴露端口            |
| `GRAFANA_ADMIN_USER`     | admin  | Grafana 管理员用户名        |
| `GRAFANA_ADMIN_PASSWORD` | admin  | Grafana 管理员密码          |
| `NODE_EXPORTER_PORT`     | 9100   | Node Exporter 暴露端口      |
