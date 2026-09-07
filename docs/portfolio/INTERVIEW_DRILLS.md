# AI Agent Knowledge Desk — 顶级大厂 16 道连环深挖面试作战底稿

> **使用原则**：面试时不要死记硬背整段文字，回答框架固定为 **【1. 场景/痛点】->【2. 核心原理与根因】->【3. 方案对比与决策取舍】->【4. 代码落地点与实测数据】**。

---

## 模块一：向量数据库与高维索引（Milvus & PgVector）

### Q1：为什么生产环境选用 Milvus？它和 PgVector、Elasticsearch 向量插件怎么选型？
- **回答要点**：
  1. **数据规模与吞吐考量**：当向量规模在十万以内时，PgVector 依托关系型数据库运维成本最低，直接享受 ACID 事务支持；但当向量规模迈入百万至千万级，PgVector 在并发查询下的内存开销和 QPS 衰减严重。
  2. **专业向量引擎优势**：Milvus 采用计算与存储分离架构，写入走 WAL 和消息中间件（Pulsar/Kafka），底层基于 MinIO 做分段持久化，向量检索基于 C++ 内核（Knowhere），在千万级向量下的 QPS 和延迟（P99 < 15ms）远超 PG 扩展。
  3. **项目取舍与落地**：我们在项目中设计了 **三级弹性 Provider**：集群生产态优先走 Milvus；无独立向量库时走 PgVector；个人桌面版自适应降级为带 JSON 快照恢复的本地持久化索引，一套代码适配单机与云端。

### Q2：Milvus 中的 HNSW 索引核心参数是什么？你是怎么调优的？
- **回答要点**：
  1. **核心原理**：HNSW（Hierarchical Navigable Small World）是基于图跳表思想的多层邻近图，上层跨度大快速定位，下层密集精确遍历。
  2. **关键参数**：
     - `M`：每个节点在图中允许的最大外向连接边数（默认 16）。`M` 越大，检索精度越高、召回率越好，但图构建时间和内存占用线性增加。项目中设为 **16 ~ 32**。
     - `efConstruction`：构建索引时探索邻居的候选集大小。`efConstruction` 越大，构图质量越高，但建索引耗时变长。我们在离线批量建索引时设为 **200**。
     - `efSearch`（查询时）：查询时维护的动态候选集大小。我们在业务检索时设为 **64**，在毫秒级延迟（~3ms）与高召回率（92%+）间取得平衡。

---

## 模块二：消息队列与异步削峰（Kafka 实战）

### Q3：批量上传文档时，为什么要引入 Kafka？如何保证消息不丢失与不重复消费？
- **回答要点**：
  1. **痛点与削峰**：批量导入或上传超大 PDF/Markdown 时，MarkItDown 文本提取、分块切片（Chunking）与调用 Embedding 模型是 CPU 和 I/O 密集型操作。若走 HTTP 同步阻塞，会瞬间耗尽 Tomcat 线程池导致雪崩。引入 Kafka 进行异步解耦与削峰填谷。
  2. **防丢失三件套**：
     - **Producer 端**：设置 `acks=all`（所有 ISR 副本同步落盘才返回成功），配置 `retries=3` 和指数退避。
     - **Broker 端**：设置 `replication.factor=3`，`min.insync.replicas=2`，禁止非 ISR 副本选主（`unclean.leader.election.enable=false`）。
     - **Consumer 端**：关闭自动提交（`enable.auto.commit=false`），在文档切片与向量入库成功后，手动提交位移（Manual Ack）。
  3. **防重复（幂等消费）**：文档切片消息体中携带全局唯一的 `jobId` 与 `knowledgeItemId`；消费者消费前利用 Redis `setnx` 或数据库唯一索引校验，若已处理直接 Ack 跳过，保证绝对幂等。

### Q4：Kafka 消费失败如何处理？死信队列（DLT）怎么设计的？
- **回答要点**：
  - 在 `KafkaConfig` 中配置 Spring Kafka 的 `DefaultErrorHandler`，结合 `DeadLetterPublishingRecoverer`。
  - 对于可重试异常（如临时网络抖动、Milvus 短暂连接失败），执行最多 3 次重试，间隔 1s、2s、4s；
  - 超过最大重试次数或遇到不可重试异常（如文档格式解析损坏），消息自动路由到 `topic-retrieval.DLT` 死信主题，同时更新 `IngestionJob` 状态为 `FAILED` 并记录告警，人工介入排查。

---

## 模块三：多级缓存与高并发架构（Caffeine + Redis）

### Q5：Caffeine + Redis 多级缓存如何保证双写一致性？
- **回答要点**：
  1. **基础模式：Cache-Aside**。更新数据时，**先更新数据库，再淘汰缓存（Delete Cache）**。
  2. **为什么不是先删缓存再改库**？若先删缓存，在高并发下，线程 A 删了缓存还没改完库，线程 B 进来读不到缓存查旧库并回填脏数据，导致缓存永久变脏。
  3. **两级缓存的同步机制**：
     - 更新 DB 成功后，删除 Redis L2 缓存；
     - 通过 Redis Pub/Sub 或 Canal 监听 MySQL Binlog 广播失效消息，各个节点的 JVM 监听到事件后使本地 Caffeine L1 缓存失效；
     - Caffeine 设置较短的兜底 TTL（如 60s），即使广播瞬时丢失，也能在 60s 内自我修复。

### Q6：你在项目中是如何全面防御缓存穿透、击穿、雪崩的？实测 QPS 达到多少？
- **回答要点**：
  1. **防穿透（查不存在的 Key）**：对查询不存在的 ID 缓存带有 30s 短暂 TTL 的空对象（Null Object），防止恶意请求反复穿透击穿 DB。
  2. **防击穿（热点 Key 突然失效）**：采用互斥锁。在回源 DB 的代码块上使用并发互斥锁（本地使用 `ReentrantLock` 或 Redis 分布式锁），仅允许一个线程加载数据并回填缓存，其他线程等待并复用新缓存。
  3. **防雪崩（大量 Key 同时失效）**：基础过期时间（如 10 分钟）加上 0~60 秒的随机抖动时间（`TTL = baseTTL + rand(0, 60)`），打散失效点。
  4. **压测数据支撑**：在我们的压测套件（`rag_cache_benchmark.py`）实测中，L1 命中率 80%（0.15ms），L2 命中率 15%（2.1ms），多级综合架构读吞吐突破 **32,000 QPS**，P99 耗时控制在 **8.5ms** 以内。

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
  3. **实测收益证明**：在项目自建基准评测（`RAGEvaluationBenchmarkTest`）中，RRF 混合检索在面对专有名词（如 `efConstruction`、`JWT`）与模糊概念混合时，Top-3 召回率达 **92.3%**，既没有 FTS 的语义死板，也没有 Dense Vector 的关键词漂移。

### Q8：RAG 检索中为什么必须做 Pre-filtering（预过滤），而不是 Post-filtering（后过滤）？
- **回答要点**：
  1. **后过滤的致命漏洞**：如果检索时不传 `userId`，向量引擎先基于全局数据召回 Top-K（如 Top-5）。若系统内有多个用户，Top-5 可能会被其他用户的相似内容占满；之后在 Java 业务层过滤当前用户的 `userId`，结果很可能被直接滤成 0 个，造成严重的“假性未召回”。
  2. **更严重的是跨租户语义缓存击穿**：如果后过滤，语义缓存可能会把用户 A 问的财务私密数据命中并输出给用户 B。
  3. **我们的实现**：在构造 LangChain4j 的 `EmbeddingSearchRequest` 时，通过 `MetadataFilterBuilder.metadataKey("userId").isEqualTo(...)` 将过滤条件**直接下推到底层向量引擎的检索请求内**，在索引扫描阶段完成物理级租户隔离。

### Q9：语义缓存的余弦阈值为什么选 0.92？怎么防止误命中？
- **回答要点**：
  1. **实验数据推导**：我们通过在基准测试中扫描 0.80 到 0.98 的阈值表现：
     - 当阈值 < 0.88 时，语义漂移明显，反义或不同场景的问题被误识别为同一意图；
     - 当阈值 > 0.95 时，命中率急剧跌至 10% 以下，失去了缓存加速价值；
     - 最终在 **0.92 ~ 0.94** 达到拐点：常见工程问答命中率稳定在 **65%**，高频问题耗时从 1.35s 降至 25ms，实测 Token 节省率达 **64.8%**。
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
  - 只要任何提交导致后端行覆盖率低于 65% 或分支覆盖率低于 60%，本地 `mvn verify` 和 GitHub CI 将直接构建失败拒绝合并，以强自动化约束代码质量。

### Q12：为什么项目中坚持“零模型也可运行”，这是怎么做到的？
- **回答要点**：
  - **产品定位思考**：绝不做一个“模型不可用就彻底瘫痪的空壳 UI”。模型只是增强推理引擎，而资料的录入、清洗、分类、标签管理、全文搜索、艾宾浩斯记忆复习是确定的工程主流程。
  - **优雅降级设计**：在启动时通过 `StartupValidationRunner` 探测模型端点，将大模型标记为 `OPTIONAL` 可选依赖；无模型时，知识库依然可以依靠 MySQL/H2 进行全文检索和复习调度；一旦用户接入本地 Ollama/Qwen 或云端 DeepSeek，AI 总结与 RAG 问答能力无感唤醒。
