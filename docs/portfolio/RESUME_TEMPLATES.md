# AI Agent Knowledge Desk — 大厂 STAR 标准简历模板（三版本精编）

> **使用指南**：本文件提供三个不同求职方向的简历描述模块。请根据所投递岗位的 JD（Job Description）要求，直接将对应模块复制粘贴到你的个人简历“项目经历”一栏中。每个版本均严格遵循 **STAR 原则**（情境 Situation、任务 Task、行动 Action、结果 Result），数据严谨求实，经得起面试官硬核代码深挖。

---

## 版本 A：Java + AI 复合架构 / 大模型工程研发岗（🌟 推荐主力版本）

### 项目名称
**AI Agent Knowledge Desk｜企业级 RAG 与本地优先（Local-First）智能知识工作台**

### 技术栈
Java 21、Spring Boot 3.5、LangChain4j、Spring AI、Milvus、Kafka、Redis、PostgreSQL (pgvector)、Caffeine、MyBatis-Plus、Flyway、Docker、JaCoCo、Electron、React、TypeScript

### 项目简介
作为核心开发者独立设计并落地的 AI 智能知识工作台。系统打通了从网页/本地文档多源采集、分块切片、向量化存储，到基于大模型的智能检索、间隔复习与 Agent 问答全链路。架构上兼顾“集群级生产态（Milvus + Kafka + Redis）”与“桌面极简零依赖态（H2 + 本地 JSON 向量快照）”，实现一套代码多端自适应。

### 核心亮点（STAR 结构）
1. **构建 Milvus + PgVector + 本地快照三级向量弹性存储体系**：针对大规模集群和本地轻量运行双重场景，基于 LangChain4j 设计统一向量存储 Provider，启动期支持生产态连接 Milvus 分布式向量库、过渡态连接 PgVector，并在单机桌面态自动优雅降级至具备 JSON 持久化快照与损坏自愈的本地向量索引，保障服务零中断。
2. **基于 Kafka 落地异步切片与文档向量化削峰事件流**：设计 `KnowledgeIngestionProducer`（同步等待 Broker ACK 确认与 2s 超时降级）与消费者解耦文档导入后的切片与向量入库；消费者端配置 Spring Kafka `DefaultErrorHandler` + `DeadLetterPublishingRecoverer` 实现指数退避重试与死信队列（DLT）路由闭环；建立基于 SHA-256 摘要与进程内并发互斥锁（Double-checked in-flight lock）的防重机制，抑制本地异步降级与 Consumer 重试时的重复切片写入。
3. **设计 RRF（Reciprocal Rank Fusion）混合检索与租户隔离安全下推**：结合全文稀疏检索（BM25/FTS）与密集向量检索（Dense Vector），利用 RRF 算法（\(k=60\)）融合排序；在自建工程基准测试集上（8 篇典型技术文档、13 组专有名词与语义对比查询），验证 Top-3 召回率维持在 **92.3%** 高位，有效兼顾专有名词精确匹配与泛化语义召回；检索请求强制将 `userId` 元数据下推底层向量引擎，实现租户级数据逻辑隔离与跨租户防穿透。
4. **落地基于余弦相似度的大模型语义缓存（Semantic Cache）与多级缓存防线**：针对高频重复相似问答，设计基于高维向量余弦相似度（阈值 \(\ge 0.92\)）的语义缓存拦截层，命中相似查询直接复用历史响应，显著削减 LLM API 调用开销与排队延迟；针对元数据设计 Caffeine L1 + Redis L2 两级缓存拓扑，从架构上落地互斥锁防击穿、随机 TTL 抖动防雪崩、空值缓存防穿透，并结合 Cache-Aside 双写淘汰保障最终一致性。
5. **建立高标准工程质量与自动化回归流水线**：为后端编写 360 项自动化测试（346 项通过、14 项跳过、0 失败、0 错误），配置 JaCoCo 行覆盖率（实测 75.25% \(\ge 65\%\)）、分支覆盖率（实测 61.61% \(\ge 60\%\)）双重强门禁并接入 Maven `verify` 与 CI/CD Pipeline，确保核心路由、模型网关故障转移及错误边界具备 100% 可回归性。

---

## 版本 B：高并发 Java 后端 / 分布式系统研发岗

### 项目名称
**AI Agent Distributed Platform｜高可用智能知识检索与任务调度平台**

### 技术栈
Java 21、Spring Boot 3.5、Kafka、Redis、MySQL/PostgreSQL、Caffeine、MyBatis-Plus、Flyway、JWT、Docker、K8s、Prometheus、JaCoCo

### 项目简介
主导设计的高可用、低延迟企业级分布式知识数据处理与任务调度中台。负责底层数据流管道搭建、多级缓存一致性保障、异步消息解耦、鉴权安全边界及自动化交付质量保障。

### 核心亮点（STAR 结构）
1. **基于 Kafka 打造高吞吐异步数据流水线与削峰机制**：重构文档摄取与切片计算链路，引入 Kafka 解耦核心 API 与后台异步计算；在 `KnowledgeIngestionProducer` 中同步等待 Broker ACK（2s 超时）并在超时或 Broker 异常时自动降级至本地线程池异步处理；消费者端配置 Spring Kafka `DefaultErrorHandler` 指数退避重试并自动路由至死信队列（DLT）；在向量消费端落地基于 SHA-256 摘要与进程内基于 `itemId` 的分段互斥锁（Double-checked in-flight lock），有效抑制本地异步降级与 Consumer 并发时的重复切片写入。
2. **落地 Caffeine + Redis 多级缓存拓扑与高并发防线**：针对高频元数据设计“本地内存 L1（Caffeine） + 分布式 L2（Redis）”二级架构；采用互斥锁防击穿、随机过期时间防雪崩、空值缓存防穿透，配合更新场景 Cache-Aside 模式（先更 DB 再删缓存）确保最终一致性，构建高可用、防穿透的系统防护屏障。
3. **安全架构与双 Token 无状态鉴权体系**：基于 HMAC-SHA256 实现 Access Token（1h）+ Refresh Token（30d）轮换刷新机制，敏感数据库凭证采用 AES 字段级对称加密存储；在对外 API 层划分租户上下文预校验，杜绝越权访问与数据横向泄露。
4. **设计主备模型网关与容灾降级熔断**：封装统一 `ModelGateway`，针对第三方 API 抖动引入 `withIdempotentRetry` 指数退避重试（智能识别 429/503 状态码）；当主通道不可用时自动纳秒级熔断并无缝切换至备选通道，保障核心系统高可用。
5. **严苛的企业级 CI/CD 质量工程体系**：全模块推行防御性编程与契约测试，编写 360 项自动化测试（346 项通过、14 项跳过、0 失败、0 错误）；在 Maven 编译生命周期中强制绑定 JaCoCo 行 \(\ge 65\%\)（实测 75.25%）、分支 \(\ge 60\%\)（实测 61.61%）双门禁，接入 GitHub Actions 自动化流水线，实现代码零硬伤交付。

---

## 版本 C：AI Agent / 大模型应用工程研发岗

### 项目名称
**AI Agent Knowledge Desk｜智能智能体编排与 RAG 增强系统**

### 技术栈
LangChain4j、Spring AI、Java 21、Spring Boot 3.5、Milvus、PgVector、DeepSeek、OpenAI、Docker、Electron

### 项目简介
面向知识管理与工程辅助场景的自研 AI Agent 系统。支持多轮上下文理解、Tool Calling 工具动态编排、人类介入确认（Human-in-the-loop）、RAG 混合检索召回与语义缓存加速。

### 核心亮点（STAR 结构）
1. **端到端 Agent ReAct 决策循环与安全工具调用编排**：基于 LangChain4j / FlexAgent 运行时构建 Agent 状态图循环；设计客户端与服务端双向受控工具调用桥（ToolExecutionBridge），引入权限判定与防死循环最大迭代限制，阻断任意系统破坏性调用。
2. **RRF 混合检索（Hybrid Search）算法与召回精度优化**：在统一向量空间中融合关键词稀疏特征与高维 Dense Vector 嵌入；在自建工程技术评测集（8 篇文档、13 组查询）上量化验证，RRF（\(k=60\)）算法相比纯关键词检索将 Top-3 命中率从 84.6% 提升至 **92.3%**，有效抑制代码符号与技术缩写的“幻觉检索”。
3. **租户隔离向量预过滤（Pre-filtering）与跨用户安全防护**：深入向量引擎底层，构造 `EmbeddingSearchRequest` 时直接下推 `userId` 元数据过滤规则，杜绝“检索后再在内存过滤”造成的候选集污染与跨租户安全隐患。
4. **大模型语义缓存（Semantic Cache）设计与请求拦截**：针对重复高频及同义问答，设计基于高维向量余弦相似度的语义缓存拦截层；基于语义相似度分布选定 0.92 ~ 0.94 推荐余弦阈值平衡命中率与语义准确率，命中相似问答直接阻断后续全量推理，优化交互响应并降低 Token 调用开销。
5. **自动化基准评测体系（RAG Benchmark）建设**：自主构建自动化评测套件，覆盖 Hit@1、Hit@3、MRR 指标度量，量化分析多路召回与融合算法的排序权衡，为算法与工程迭代提供客观数据支撑。

