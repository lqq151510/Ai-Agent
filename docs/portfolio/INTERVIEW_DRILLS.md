# AI Agent Knowledge Desk — 顶级大厂 16 道连环深挖面试作战底稿

> **使用原则**：面试时不要死记硬背整段文字，回答框架固定为 **【1. 场景/痛点】->【2. 核心原理与根因】->【3. 方案对比与决策取舍】->【4. 代码落地点与实测数据】**。

---

## 模块一：向量数据库与高维索引（Milvus & PgVector）

### Q1：为什么生产环境选用 Milvus？它和 PgVector、Elasticsearch 向量插件怎么选型？
- **回答要点**：
  1. **数据规模与吞吐考量**：当向量规模在十万以内时，PgVector 依托关系型数据库运维成本最低，直接享受 ACID 事务支持；但当向量规模迈入百万至千万级，PgVector 在并发查询下的内存开销和 QPS 衰减严重。
  2. **专业向量引擎优势**：Milvus 采用计算与存储分离架构，写入走 WAL 和消息中间件（Pulsar/Kafka），底层基于 MinIO 做分段持久化，向量检索基于 C++ 内核（Knowhere），在千万级向量下的 QPS 和延迟（P99 < 15ms）远超 PG 扩展。
  3. **项目取舍与落地**：我们在项目中设计了 **三级弹性 Provider**：集群生产态优先走 Milvus；无独立向量库时走 PgVector；个人桌面版自适应降级为带 JSON 快照恢复的本地持久化索引，一套代码适配单机与云端。

### Q2：Milvus 中的 HNSW 索引核心参数是什么？你是怎么做选型与调优的？
- **回答要点**：
  1. **核心原理**：HNSW（Hierarchical Navigable Small World）是基于图跳表思想的多层邻近图，上层跨度大快速定位，下层密集精确遍历。
  2. **关键参数与架构考量**：
     - `M`：每个节点在图中允许的最大外向连接边数（默认 16）。`M` 越大，检索精度越高、召回率越好，但图构建时间和内存占用线性增加。推荐设为 **16 ~ 32**。
     - `efConstruction`：构建索引时探索邻居的候选集大小。`efConstruction` 越大，构图质量越高，但建索引耗时变长。针对离线导入场景设为 **200**。
     - `efSearch`（查询时）：查询时维护的动态候选集大小。业务检索通常设为 **64**，在毫秒级延迟与高召回率间取得平衡。
  3. **项目落地边界**：在应用层通过 LangChain4j 适配 Milvus 向量接口，服务启动期探测 Milvus 连通性；若未部署 Milvus，自适应降级至 PgVector 或带快照自愈的本地向量索引。

---

## 模块二：消息队列与异步削峰（Kafka 实战）

### Q3：批量上传文档时，为什么要引入 Kafka？如何保证消息不丢失与不重复消费？
- **回答要点**：
  1. **痛点与削峰**：批量导入或上传大文件时，文本解析、分块切片（Chunking）与调用 Embedding 模型是 CPU 和 I/O 密集型操作。若走 HTTP 同步阻塞，会瞬间耗尽工作线程池导致雪崩。我们在 `KnowledgeItemService.finalizeImportedItem` 中引入 `triggerAsyncIngestion` 异步事件流解耦核心业务。
  2. **端到端可靠性设计**：
     - **Producer 端**：`KnowledgeIngestionProducer` 投递消息后执行 `future.get(2, TimeUnit.SECONDS)` 同步等待 Broker ACK 确认；若未配置 Kafka 或投递超时/异常，自动退避将向量摄取提交到本地独立的 `taskExecutor` 线程池异步执行，避免继续在请求线程中执行向量计算；该回退属于进程内尽力执行，不提供持久化任务恢复保证。
     - **Consumer 端**：`KnowledgeIngestionConsumer` 消费消息前先调用 `ragMemoryService.isAlreadyIngested(...)` 进行基于 `itemId` 与内容哈希的幂等校验，若已处理直接跳过；消费失败时**显式重新抛出 `RuntimeException`**，交由 Spring Kafka 容器的 `DefaultErrorHandler` 执行重试与死信投递。
  3. **防重复（幂等消费）与单实例并发边界**：在 `RAGMemoryService` 中维护 Caffeine 幂等去重缓存（24h TTL），基于 SHA-256 内容摘要与基于 `itemId` 的 128 固定槽位条带锁（Striped Lock）实现进程内互斥（Double-checked locking），有效抑制本地异步降级与 Consumer 重试时的单实例并发写入。**明确说明边界**：条带锁仅保证**单服务实例进程内**的多线程互斥；若在多节点分布式集群部署，需进一步依赖 Redis 分布式锁（如 Redisson）或数据库唯一约束（`itemId` + `content_sha256`），这是独立的分布式架构扩展项。

### Q4：Kafka 消费失败如何处理？死信队列（DLT）怎么设计的？
- **回答要点**：
  - 沿用 Producer 与 Consumer 的统一启用表达式（`@ConditionalOnExpression("${app.kafka.enabled:${spring.kafka.consumer.auto-startup:false}}")`）配置 `KafkaErrorHandlingConfig`，注册 Spring Kafka `DefaultErrorHandler`，搭配 `DeadLetterPublishingRecoverer`。
  - 配置 `ExponentialBackOff`（初始 1s，乘数 2.0，最大 2 次重试），对临时网络抖动或向量库短暂超时执行重试。
  - 将 `IllegalArgumentException` 等不可重试异常标记为非重试直接进入死信队列；
  - 超过重试次数后，消息被路由至 `retrieval-task-topic.DLT` 死信队列，保障主消费链路不被毒丸消息（Poison Pill）阻塞，并支持后续报警排查与重放。
  - **实事求是说明边界与独立验收项**：当前已完成 Spring Kafka DLT 路由规则配置与单元测试验证（精准断言目标 Topic.DLT、Partition、Key 与 Value 匹配）；**真实物理 Broker 重试与 DLT 投递演练（包括真实集群故障注入、网络抖动、毒丸消息真实落盘与补偿重放）属于独立的后续集成验收项**，单元测试不代表物理环境演练已闭环。

---

## 模块三：多级缓存与高并发架构（Caffeine + Redis）

### Q5：Caffeine + Redis 多级缓存如何保证双写一致性？
- **回答要点**：
  1. **基础模式：Cache-Aside**。更新数据时，**先更新数据库，再淘汰缓存（Delete Cache）**。
  2. **为什么不是先删缓存再改库**？若先删缓存，在高并发下，线程 A 删了缓存还没改完库，线程 B 进来读不到缓存查旧库并回填脏数据，导致缓存永久变脏。
  3. **两级缓存的同步机制**：
     - 更新 DB 成功后，删除 Redis L2 缓存；
     - 本地 Caffeine 设置较短的兜底 TTL（如 60s），结合 Cache-Aside 模式降低多节点脏读窗口；
     - 后续若需严格近实时同步，可结合 Redis Pub/Sub 或 Canal 监听 Binlog 广播失效消息，各个节点的 JVM 监听到事件后使本地 Caffeine L1 缓存失效。

### Q6：你在项目中是如何全面防御缓存穿透、击穿、雪崩的？有做性能推演吗？
- **回答要点**：
  1. **防穿透（查不存在的 Key）**：对查询不存在的 ID 缓存带有短暂 TTL 的空对象标记，结合入参校验拦截非法 ID。
  2. **防击穿（热点 Key 突然失效）**：采用互斥锁。在回源 DB 逻辑前加互斥锁（本地 JVM 锁或 Redis 分布式锁），仅允许一个线程加载数据并回填缓存，其余线程等待复用。
  3. **防雪崩（大量 Key 同时失效）**：基础过期时间加上随机扰动（`TTL = baseTTL + rand(0, 60)`），打散失效点。
  4. **客观对待性能数据（严禁造假）**：在架构设计初期，通过离线数学模型推演了进程内内存访问（微秒级）与分布式 Redis 网络 I/O（毫秒级）的延迟边界。在面试中明确说明：项目重在落地严谨的高并发防线与一致性机制，未进行大规模集群物理压测前，不堆砌虚假的 QPS 数字，展现求真务实的工程态度。

---

## 模块四：RAG 混合检索与语义缓存（AI 核心算法）

### Q7：为什么要用 RRF 算法做混合检索？为什么不直接把向量得分和 BM25 得分加权平均？
- **回答要点**：
  1. **量纲不统一问题**：向量检索的分数通常是余弦距离（0 ~ 1）或 L2 距离，而 BM25 词频得分是无界的浮点数（如 15.4、4.2），二者量纲和数值分布完全不同，做简单的线性加权（\(Score = \alpha \cdot S_{vec} + \beta \cdot S_{bm25}\)）极其脆弱，超参数极难微调。
  2. **RRF 原理**：倒数排序融合（Reciprocal Rank Fusion）完全**摆脱绝对分值，仅依据各策略给出的相对排名（Rank）**：
     \[
     RRF(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}
     \]
     其中 \(k=60\) 是平滑常数，用于抑制头部极小排名的过度主导。
  3. **规则模拟评测与口径边界**：在包含 8 篇典型技术文档、13 组测试查询的固定规则模拟评测集（`RAGEvaluationBenchmarkTest`）中，使用人工生成的关键词与模拟语义排名，验证 RRF 的融合计算逻辑；该固定测试集上，RRF 的 Hit@3 为 **92.3%**，MRR 为 **0.8718**（模拟关键词 Hit@3 为 84.6%，MRR 为 0.8327；模拟语义 Hit@3 为 92.3%，MRR 为 0.8942）。
  4. **求真务实原则（避免主观过度归因）**：明确向面试官说明，该评测是针对多源输入冲突时 RRF 倒数累加算术逻辑的基准验证，**不代表真实分词/FTS、物理 Embedding 模型或生产向量数据库的检索质量**；在没有海量真实检索与严格参数对照实验前，不轻易下“改善了语义漂移”或“MRR 下降由平滑常数导致”的主观结论。

### Q8：RAG 检索中为什么必须做 Pre-filtering（预过滤），而不是 Post-filtering（后过滤）？
- **回答要点**：
  1. **后过滤的致命漏洞**：如果检索时不传 `userId`，向量引擎先基于全局数据召回 Top-K（如 Top-5）。若系统内有多个用户，Top-5 可能会被其他用户的相似内容占满；之后在 Java 业务层过滤当前用户的 `userId`，结果很可能被直接滤成 0 个，造成严重的“假性未召回”。
  2. **更严重的是跨租户语义缓存击穿**：如果后过滤，语义缓存可能会把用户 A 问的私密数据命中并输出给用户 B。
  3. **我们的实现**：在构造 LangChain4j 的 `EmbeddingSearchRequest` 时，通过 `MetadataFilterBuilder.metadataKey("userId").isEqualTo(...)` 将过滤条件**直接下推到底层向量引擎的检索请求内**，在索引扫描阶段完成租户级逻辑预隔离，杜绝内存后过滤的候选集污染。

### Q9：语义缓存的余弦阈值为什么选 0.92？怎么防止误命中？
- **回答要点**：
  1. **阈值权衡分析**：
     - 当阈值 < 0.88 时，语义漂移明显，反义或不同场景的问题容易被误识别为同一意图（如“如何开启事务”与“如何关闭事务”）；
     - 当阈值 > 0.95 时，命中条件过于苛刻，绝大多数相似表达均无法命中，失去了缓存加速价值；
     - 权衡精准度与召回率，选定 **0.92 ~ 0.94** 作为推荐平衡点，对高频几乎相同的提问实现毫秒级拦截，直接跳过大模型调用排队。
  2. **双重校验防误伤**：在向量余弦比对通过后，针对包含否定词（“不”、“没有”、“关闭”）的敏感查询增加轻量规则校验，防止逻辑反转误命中。

---

## 模块五：Agent 编排、安全边界与工程质量

### Q10：Agent 的 ReAct 决策循环如何防止大模型无限调用工具（死循环）？
- **回答要点**：
  1. **最大迭代深度（Max Iterations）**：在 `AgentService` 编排层强制配置单次会话最大思考轮数（默认 8 轮），超出阈值直接熔断并向用户返回当前收集到的上下文摘要。
  2. **工具调用历史去重与循环检测**：跟踪同一个会话内 `ToolCall` 的名称与参数哈希，若连续 3 轮输出完全相同的工具与入参，判定为陷入推理死循环，主动注入 System Prompt 打断并请求人工介入（Human-in-the-loop）。
  3. **客户端审批拦截**：高危工具（如系统命令、破坏性文件写入）强制要求用户在前端点击审批确认，无法静默自主执行。

### Q11：后端 Maven verify 绑定的 JaCoCo 门禁具体是怎么配的？
- **回答要点**：
  - 在 `backend/pom.xml` 中引入 `jacoco-maven-plugin:0.8.14`；
  - 绑定 `prepare-agent` 到 `initialize` 阶段注入 JavaAgent；
  - 绑定 `report` 和 `check` 到 `verify` 生命周期目标；
  - 配置规则（Rule）：
    ```xml
    <rule>
        <element>BUNDLE</element>
        <limits>
            <limit>
                <counter>LINE</counter>
                <value>COVEREDRATIO</value>
                <minimum>0.65</minimum>
            </limit>
            <limit>
                <counter>BRANCH</counter>
                <value>COVEREDRATIO</value>
                <minimum>0.60</minimum>
            </limit>
        </limits>
    </rule>
    ```
  - 当前后端全量运行 **364 项自动化测试**（350 项通过、0 失败、0 错误、14 跳过），实测行覆盖率 **75.39%**（\(\ge 65\%\)），分支覆盖率 **61.63%**（\(\ge 60\%\)），均稳定越过强门禁标准。任何提交若破坏分支覆盖率或测试通过率，本地构建与 GitHub Actions 均会直接失败阻断。

### Q12：为什么项目中坚持“零模型也可运行”，这是怎么做到的？
- **回答要点**：
  - **产品定位思考**：绝不做一个“模型不可用就彻底瘫痪的空壳 UI”。模型只是增强推理引擎，而资料的录入、清洗、分类、标签管理、全文搜索、艾宾浩斯记忆复习是确定的工程主流程。
  - **优雅降级设计**：在启动时通过 `StartupValidationRunner` 探测模型端点，将大模型标记为 `OPTIONAL` 可选依赖；无模型时，知识库依然可以依靠 MySQL/H2 进行全文检索和复习调度；一旦用户接入本地 Ollama/Qwen 或云端 DeepSeek，AI 总结与 RAG 问答能力无感唤醒。
