# InterStellar 2.0: Fine-Grained Stream–Guided HW/SW Co-Design for Multi-Channel DRAM Performance Steering & Stream-Based Intelligent Memory Architectures 论文解析

[📄 下载论文原文 (PDF)](original.pdf){:download="interstellar_thesis.pdf"} &nbsp;|&nbsp; [🔗 在线阅读](original.pdf){:target="_blank"} &nbsp;|&nbsp; [DOI: 10.1016/j.sysarc.2025.103832](https://doi.org/10.1016/j.sysarc.2025.103832){:target="_blank"}

## 0. 论文基本信息

**作者 (Authors)**: Abdelrhman Mohamed Ibrahim Sayed Abotaleb, Maziar Goudarzi, Tomasz Czajkowski, et al.

**发表期刊/会议 (Journal/Conference)**: PhD Thesis

**发表年份 (Publication Year)**: 2026

**研究机构 (Affiliations)**: McMaster University, Huawei Technologies Canada Research Center

---

## 1. 摘要

**目的**

- 现代**Cyber-Physical Systems**（如自动驾驶、无人机）在共享多核平台上集成高性能AI/ML与实时控制任务，处理器性能持续提升，而**Memory System**成为主要瓶颈。
- 现有Hardware Prefetcher与Memory Controller（MC）对程序语义不感知，导致带宽利用率低、延迟波动大，无法同时满足**High Throughput**与**Tight Worst-Case Memory Latency（WCML）** 两种需求。
- 本文旨在通过一种统一的**Stream-Aware HW/SW Co-Design**机制，弥补语义鸿沟，同时优化数据密集型工作负载的带宽效率与实时任务的时序可预测性。

**方法**

- 提出统一的**HW/SW Interface**：编译器在编译时识别Stream（Direct/Indirect）的模式，生成紧凑的Stream Descriptors（包含基址、步长、循环边界等）；通过RISC-V CSR写入或预定义的内存映射，在运行时传递至硬件。
- **Nucleus Engine**：位于Last-Level Cache（LLC）旁，接收Descriptors，将LLC Miss与Stream关联，并附加Stream ID、类型等信息到内存请求。通过一个小的**Inverse TLB**（Stream TLB⁻¹）解决虚拟地址到物理地址的翻译问题。
- 基于此接口，设计了三种专门化架构：
    - **InterStellar**：提升通用高性能系统效率。Memory Controller应用两项协调策略：
        - **Intelligent Page Policy (iPP)**：基于Stream粒度管理DRAM Row Buffer驻留。Direct Stream使用**MaxHit**计数器决定何时Precharge；Indirect Stream使用**Sliding Conflict Window**和双阈值决策关闭行。
        - **Intelligent Batching (iBatch)**：当Stream激活一个Row时，预取该行中已知的未来Row-Hit地址，将数据存储在**Per-Bank iBuffer**中，后续Demand直接命中iBuffer，避免DRAM往返。
    - **InterStellarRT**：专为Hard Real-Time系统设计，强调可预测性。通过软件引导，将Stream请求组织成**rtBatch**，大小固定、不可中断。使用**Map2**地址映射确保rtBatch内跨Bank Group（BG）访问，利用较短`tCCDS`延迟。实现**BR-FR-FCFS**调度器，确保rtBatch的原子性。推导了严格的**WCML分析模型**（包含In-Isolation和Interference分析的引理与定理）。
    - **InterStellar 2.0 & COMPASS**：前者将架构扩展到**Multi-Channel DRAM**，通过**Channel-Aware Segmentation**将Stream Batch分割到不同Channel的Local Expander，无需跨Channel协调；后者协调**iPrefetcher**与**iMC**，通过中央**iCoordinator**管理，以降低有效Miss延迟。

**结果**

| 架构 | 评估配置 | 关键结果 |
| :--- | :--- | :--- |
| **InterStellar** | 8-Core RISC-V, GEM5+Ramulator, DDR4 | **1.5×平均**（最高**2.72×**）End-to-End加速；**24%平均**（最高**60%**）DRAM能耗节省。 |
| **InterStellarRT** | 4-Core RISC-V, 13个Benchmarks | **3.8×**更紧的In-Isolation WCML；**13.5×**更紧的Interference Latency界；**1.72×**加速与**14%**能耗降低（ vs. PartAll）。 |
| **InterStellar 2.0** | 8-Core, 1-32 DRAM Channels | **2.92×**加速与**2.83×**带宽提升（ vs. COTS）；Fine-Grained Sub-Stream跟踪带来额外**1.35×**提升。 |
| **COMPASS** | 23个Workloads, 25个配置 | 平均**1.88×**加速与**2.14×**带宽提升，优于BLISS（1.04×）、PARBS（1.14×）及独立Stream Prefetcher（1.63×）。 |

**结论**

- 提出的**Stream-Aware HW/SW Co-Design**能有效弥合程序语义与硬件调度之间的鸿沟。
- 通过软件提供的Stream信息，硬件可以做出更优的决策，同时提升**High-Performance System**的带宽与吞吐量，并为**Real-Time System**提供更严格、可通过公式分析的Worst-Case Latency界。
- 各个架构（InterStellar, InterStellarRT, InterStellar 2.0, COMPASS）展示了该方法的通用性，能够高效覆盖单通道、多通道、缓存与DRAM等多个内存层级。
- 该方法无需ISA或操作系统修改，易于集成到现有系统中，为未来高带宽、低延迟的异构内存系统提供了可扩展的解决方案。

---

## 2. 背景知识与核心贡献

**研究背景与动机**

- 现代AI/ML及实时嵌入式系统（如自动驾驶、无人机）面临“内存墙”瓶颈：处理器性能持续增长，但DRAM访问延迟改善缓慢，内存子系统成为主要性能障碍。
- 高吞吐量AI/ML工作负载（CNN、LLM）重复访问大型张量结构，性能受限于内存带宽而非计算；同时实时控制任务要求严格、可预测的延迟，二者在共享多核多通道DRAM平台上难以兼顾。
- 现有内存控制器和缓存预取器是基于硬件的“上下文无关”设计——处理每个请求时缺乏对程序级数据结构和未来访问行为的语义理解，导致带宽利用率低、能源浪费和严重的延迟可变性。
- 先前的HW/SW协同设计框架（Täko、XMem、MetaSys）虽然部分缓解了语义鸿沟，但依赖ISA或OS修改，且操作粒度是页面或区域，无法捕获细粒度流及其访问序列，难以指导DRAM级别的调度决策。
- 因此，需要一个统一的、轻量级的**流感知**HW/SW接口：软件将未来访问模式（如循环遍历数组的基地址、步长、迭代次数）编码为紧凑描述符，传递给硬件引擎，使内存层次结构能做出前瞻性和预测性的决策，同时**不要求ISA或OS更改**。

**核心贡献**

- **InterStellar (第2章)**：提出首个通用流感知HW/SW协同设计的DRAM控制器。
    - 软件通过描述符（Loop Descriptor、Direct/Indirect Stream Descriptor）将流信息写入CSR；硬件Nucleus引擎解码这些描述符，并将流ID附加到LLC缺失请求上。
    - 内存控制器集成两个策略：**智能页面策略 (iPP)** 按流维护行缓冲局部性，决定何时保持或关闭行；**智能批处理 (iBatch)** 在DRAM层主动提取已知的未来行命中请求，存入每Bank iBuffer，从而消除大量行冲突。
    - 在8核RISC-V系统上，InterStellar实现高达2.72×端到端加速、1.5×平均加速，并在多流工作负载下将DRAM能耗降低最高60%。
- **InterStellar 2.0 (第2章扩展)**：将流感知架构扩展到多通道DRAM系统。
    - 提出**多通道感知分片批处理**：Nucleus将流的未来访问按地址映射切片到各个通道，每个通道独立展开自己的iBatch段，无需跨通道协调。
    - 引入**细粒度子流追踪**：对于多维模板核（如Jacobi-2D），编译器为每个逻辑独立的数据切片生成多个子流描述符，硬件对各子流独立维护局部性统计，避免相互干扰。
    - 在1到32通道上评估：最高2.92×端到端加速、2.83×带宽提升；细粒子流单独带来最高1.35×额外改进。
- **InterStellarRT (第3章)**：面向硬实时系统的流感知变体，提供**可形式化分析的最坏情况内存延迟 (WCML) 界**。
    - 引入**实时批处理 (rtBatch)**：将流请求组织成固定大小的批次，每个批次在内存控制器中无中断执行；采用Map2地址映射使批次内CAS命令在Bank Group间交错，利用更短的tCCDS延迟。
    - 设计**BR-FR-FCFS调度器**，确保rtBatch一旦开始便不可打断，从而消除干扰期间非第一个请求的Bank间干扰。
    - 通过系列引理和定理推导出in-isolation和干扰下的WCML闭合公式：**in-isolation延迟界平均收紧3.8×，干扰延迟界平均收紧13.5×**（相对于PartAll基线）。
    - 同时实现1.72×端到端加速、1.9×带宽提升和14% DRAM能耗降低。
- **COMPASS (第4章)**：协调LLC缓存预取器与DRAM控制器的流感知架构。
    - 引入**iCoordinator**：集中式流描述符引擎，将流信息同时分发给智能缓存预取器（iPF）和智能内存控制器（iMC）。
    - iPF利用流知识提前预取未来缓存行，iMC则执行流感知batching和行管理；两者通过iCoordinator同步，避免预取和批处理之间的冲突。
    - 在23个工作负载、7种策略、25种硬件配置下评估：平均端到端加速达1.88×、带宽提升2.14×，均显著优于独立预取器或批处理调度器（如BLISS、PARBS）。
- **跨章节共同特征**：所有架构均采用相同的轻量级HW/SW接口（基于RISC-V CSR写操作，无ISA/OS修改），并严格遵循**编译器自动识别流**、**硬件中央引擎标签缺失包**、**内存控制器执行流感知策略**的流水线。整个系统在gem5+Ramulator上验证，覆盖PolyBench、LAPACK、Rodinia、Parboil、Phoenix、HPCG等套件中36个代表性内核。

---

## 3. 核心技术和实现细节

### 0. 技术架构概览

**整体技术架构**

本文提出了一个基于**流（Stream）**的统一硬件/软件协同设计架构，旨在通过软件显式暴露未来内存访问行为，指导硬件决策，从而同时提升高性能系统的吞吐量和实时系统的时序可预测性。架构的核心是**HW/SW接口**、**中央引擎Nucleus**以及**面向不同目标的三个具体实现**：InterStellar/InterStellar 2.0（通用高性能与多通道）、InterStellarRT（实时系统）、COMPASS（协调LLC预取器与内存控制器）。

- **统一HW/SW接口**
    - 软件层（编译器）在编译时通过**流描述符（Stream Descriptors）**编码内存访问模式，包括循环描述符（起始、步长、结束）、直接流描述符（基地址、步长）、间接流描述符（通过索引数组的访问）、链接变量描述符（处理运行时动态值）。
    - 描述符通过**控制与状态寄存器（CSR）**（RISC-V）或**内存映射区域**（ARM/x86）写入硬件，无需ISA或操作系统修改。
    - 软件开销极小：仅在循环入口写入少量CSR指令。

- **Nucleus中央引擎**
    - 位于**最后一级缓存（LLC）**旁侧，负责：
        - 解析软件描述符，计算每个流的虚拟地址范围（起始VA、结束VA）。
        - 维护**Desc Table**存储活跃流信息；通过**Stream TLB⁻¹**（逆向翻译结构）将LLC未命中的物理地址映射回虚拟地址，匹配对应流。
        - 在LLC未命中包上附加**元数据**（流ID、核心ID、线程ID、流类型），发送给下游内存控制器。
    - 添加的延迟仅为**2个周期**（TLB⁻¹访问 + Desc Table检索），与LLC标签访问并行，不在关键路径上。

- **内存控制器扩展层**
    - 基于Nucleus提供的元数据，内存控制器实现两个核心机制：
        - **智能页面策略（iPP）**：为每个流/子流独立跟踪行局部性，决定何时保持行打开或预充电。直接流使用**行命中计数器**，预估下一个行冲突时刻；间接流使用**冲突跟踪窗口**，基于双阈值规则决定预充电。
        - **智能批处理（iBatch）**：为直接流，一旦当前DRAM行被激活，控制器根据步长提前发送后续行命中请求，将返回数据暂存在**每Bank的iBuffer**中。后续请求若命中iBuffer，则无需重新访问DRAM，从而减少冲突和延迟。
    - 在**InterStellar 2.0**中，扩展了**多通道感知分割**功能：Nucleus根据地址映射将流的下一个批处理分割成每个通道对应的**片段种子**，每个通道独立扩展并调度自己的片段，无需跨通道同步。
    - 增加了**待处理ACT队列（PAQ）**，用于临时存储因iBuffer满或DRAM时序限制而无法立即发出的批处理请求，解耦逻辑批处理深度与瞬时物理容量。

- **三个具体实现**
    - **InterStellar / InterStellar 2.0（高性能系统）**
        - 目标：最大化吞吐量和带宽利用率，降低DRAM能量。
        - 在单通道和多通道（1‑32通道）DRAM上均有效。评估显示：8核系统平均**1.5×** E2E加速（最高2.72×），带宽提升**2.02×**，DRAM能量降低**24%**。
        - 支持**细粒度子流**（Fine-Grained Sub-Streams）：对Stencil等三维核，编译器为每个独立切片（如相邻行）生成单独的描述符，防止行局部性统计相互污染，进一步提升iPP精度。

    - **InterStellarRT（实时系统）**
        - 目标：为流式实时应用提供严格的**最坏情况内存延迟（WCML）**下界，同时保持高性能。
        - 关键增强：
            - **实时批处理（rtBatch）**：将直接流请求分组为大小**B=16**的批量，确保所有请求命中同一行，使用RDA（自动预充电）在批量结束时关闭行。
            - **地址映射Map2**：将相邻访问交替分配到不同**Bank Group（BG）**，利用DDR4/DDR5的短CAS延迟`tCCD_S`（4周期）而非长延迟`tCCD_L`（6周期），降低服务时间。
            - **调度器BR-FR-FCFS**：保证rtBatch一旦开始运行即不可中断（Theorem 5.3），消除内请求间的Bank间干扰。
            - 推导了**请求驱动的理论分析**（包括引理、定理），证明在隔离和干扰下均能提供显著更紧的WCML。
        - 平均**3.8×**更紧的隔离WCML，**13.5×**更紧的干扰WCML（与PartAll基线相比），同时E2E加速**1.72×**，带宽提升**1.9×**，DRAM能量降低**14%**。
        - 对**大步长流**提供**ForceB**模式，牺牲部分性能以确保可分析性。

    - **COMPASS（协调预取器与内存控制器）**
        - 目标：协调LLC预取器（iPF）和内存控制器（iMC），使两者共享流信息，对齐预取和批处理节奏。
        - 新增**iCoordinator**模块，负责在iPF和iMC之间传递流描述符，并协调预取发出时机与批处理调度。
        - 在23个工作负载、7种策略、25种硬件配置下，达到平均**1.88×**加速，最高**2.14×**带宽提升，超过单纯预取器或单纯批处理控制器。
        - 核心机制包括：iPF利用流信息进行精准预取（减少污染和MSHR压力），iMC进行流感知的iBatch和iPP，二者通过iCoordinator实现同步。

- **部署与可扩展性**
    - Nucleus与内存控制器**解耦**，可灵活放置（一个实例服务于所有核心，或每个LLC切片的实例）。
    - 多通道系统中，每个通道独立运行本地iPP、iBatch、PAQ，无全局瓶颈。
    - 所有组件均未修改ISA或OS，仅通过编译器插入少量CSR写指令，与现有软件栈后向兼容。

### 1. HW/SW Interface and Stream Descriptors

**核心观点**

HW/SW Interface是InterStellar系列架构的基石，它建立了一套轻量级的运行前契约，使内存控制器能够预见性地感知即将到来的内存访问流。这一设计彻底改变了传统内存控制器“被动响应、一无所知”的局限性。通过将这些信息作为元数据附着于每个 LLC miss 请求之上，下游的 Nucleus 引擎和内存控制器得以在完全了解程序意图的情况下，做出关于预取、调度和行管理的战略性决策。

---

**实现原理：描述符的种类与功能**

软件端通过编译器分析，将循环和内存访问模式编码为四种紧凑的125-bit描述符，通过 **CSR (Control and Status Register)** 写入操作传递给硬件。

- **Loop Descriptor (循环描述符)**: 定义了循环的边界和步长，是流的“时间框架”。包含Start Value, End Value, Step。支持动态链接，通过 **SL (Start Linked)** 和 **EL (End Linked)** 标志指向存放动态值的Link Descriptor。
- **Direct Stream Descriptor (直接流描述符)**: 定义了最为常见、规律性最强的流类型。包含Base Address, Stride（字节偏移），以及指向其所属Loop Descriptor的ID。同样支持动态基地址，通过 **BL (Base Linked)** 标志实现。
- **Indirect Stream Descriptor (间接流描述符)**: 用于描述通过另一数组索引（如 A[B[i]] ）访问的模式，具有一定的不确定性但仍可被硬件跟踪。包含Element Size和Stream Size来描述其数据范围。
- **Link Variable Descriptor (链接变量描述符)**: 作为动态参数的“指针”，指向存储运行时值的寄存器。这使系统能够处理非编译期常量，如作为函数参数传递的循环边界或动态分配的数组基址。

**算法流程与参数设置**

1. **编译阶段生成**: LLVM 编译器中端Pass分析循环内的内存访问模式，通过深度优先搜索重建地址计算链，形成流依赖树。
2. **运行时配置**: 在循环开始前，编译器插入特定 `csrrw` 指令，将描述符写入RISC-V核心预留的CSR空间。
3. **硬件解析与同步**: 位于LLC旁的Nucleus引擎监听CSR写入事件，解析描述符信息，建立描述符表 (Descriptor Table)，记录每个流的 **虚拟地址范围 (VA Span)**、类型和核心/线程ID。
4. **请求匹配与标记**: 当LLC发生缺失时，Nucleus通过逆序转换查询表（类似 `TLB^{-1}`，即 Stream TLB^{-1}）将物理地址映射回虚拟地址，然后匹配描述符表。匹配成功后，在请求包上附加少量元数据（如**流ID (Did)**、**核心ID (Cid)**、**类型 (DType)** 和**访问步长 (Stride)**）。

**输入输出关系与作用**

- **输入**: 编译器生成的描述符和运行时CSR写入事件。
- **输出**: 带有丰富语义标签的**LLC缺失请求包**，并更新Nucleus内部描述符表和 `TLB^{-1}` 缓存。
- **在整体架构中的作用**: 在Nucleus引擎内部，该接口驱动了**Affine Stream Table (AST)** 的构建，AST记录了每个仿射流的起始/结束VA和访问步长。这是后续所有优化的前提。在下游的MC中，针对不同调度场景，该接口决定了**行策略**和**组批策略**的选择。这种解耦设计使流信息的获取与下游优化解耦，且所有通信仅依赖现有架构机制，实现了**零ISA修改**、**零OS修改**的兼容性。

---

**形式化约定与动态支持**

当描述符中的字段（如循环起始值或数组基址）在编译时未知：
- 编译器会为该变量隐式创建一个Link Variable Descriptor。
- 在运行时，Nucleus监听目标寄存器的值变化。
- 一旦检测到值更新，Nucleus会自动将其代入相应Loop或Stream Descriptor的字段中，更新内部AST表项。

这一机制确保了系统对动态循环边界、运行时确定的数组基址以及间接索引模式的透明支持。

**与实时系统版本 (InterStellarRT) 的差异**

文档中提及的InterStellarRT采用了与InterStellar相同的接口理念，但描述符更侧重于**仿射流 (Affine Stream)**。InterStellar描述符中的亲缘标志（如SL, EL, BL）在InterStellarRT的 **Affine Descriptor** 中以更简化的形式被运用，仅需4个CSR写操作即可配置一个完整流。同时，InterStellarRT新增了 **srTLB (Affine Stream Reverse Translate Lookahead Buffer)**，专门用于高效地将LLC缺失请求的物理地址映射回其仿射流归属，而无需遍历整个描述符表。

**总体价值**

这一接口的核心价值在于：
- **零运行时开销**: 描述符在循环前一次性下发，所有匹配和标记逻辑通过硬件并行完成。
- **极微硬件成本**: 所有描述符可通过现有CSR基础设施容纳，无需增加额外寄存器。
- **精确性与通用性**: 支持直接和间接两种主要流类型，且通过链接机制兼容动态参数，覆盖绝大多数循环主导的内存访问场景。

通过这套接口，InterStellar系列在内存控制器层级首次实现了“软件引导硬件”的闭环控制，为后续的智能批处理、自适应页策略和跨层级协调优化奠定了语义基础。

### 2. Nucleus Engine

**Nucleus Engine 功能概述**

Nucleus 是 **InterStellar/InterStellar 2.0** 体系结构的中央硬件引擎，位于 **Last-Level Cache (LLC)** 边界。它的核心任务是将软件提供的流描述符（通过 CSR 写入）转化为物理地址域的实时辅助信息，并附加到每一个 LLC 缺失请求上，使下游内存控制器能够做出流感知决策。

**关键组件与工作原理**

*   **描述符表 (Descriptor Table, Desc Table)**
    *   包含来自编译器和运行时的所有活跃流（Loop、Direct Stream、Indirect Stream）的元数据。
    *   每个条目存储流类型、虚拟地址范围（通过 **start_VA** 和 **end_VA** 计算）、步幅、关联的线程/核心 ID。
    *   存储开销示例（来自 2.7.2 节）：对于 16 个流、8 个核心，约 2.76 kB。
    *   表项结构：（以标签形式呈现关键字段）
        | 字段 | 描述 |
        |------|------|
        | Descriptor Type | Loop / Direct / Indirect / Link |
        | Core ID / Thread ID | 标识请求来源 |
        | Start VA / End VA | 流访问的地址跨度 |
        | Stride (仅 Direct) | 流访问的字节步长 |
        | Size (仅 Indirect) | 间接流的总大小 |

*   **反向地址翻译结构 (Stream TLB^-1 或 srTLB)**
    *   由于描述符记录的是虚拟地址，而 LLC 缺失携带的是物理地址，Nucleus 必须将物理地址快速映射回虚拟地址以匹配流。
    *   **Stream TLB^-1**（图 2.9 中标注为 `TLB^{-1}`）是一个小型缓存，存储最近使用的 **(PA → VA)** 映射对，专为活跃流维护。
    *   当 TLB 未命中发生时，Nucleus 查询 Desc Table 的 VA 范围，若匹配则填充 TLB^-1。
    *   在文档实验中，256 条目 TLB^-1 足以覆盖工作负载。
    *   设计重要特点：对于大步幅直接流或低局部性间接流，TLB^-1 条目可以被覆盖，Nucleus 将此类事件视作非流活动，通过专用冲突跟踪窗口处理。

*   **LLC 请求过滤与附加器 (LLC Request Filter & Appender)**
    *   **LLC Request Filter**：每个 LLC 缺失包到达后，首先用 TLB^-1 获取其虚拟地址，然后访问 Desc Table 判断是否属于某个活跃流。此过程需要两个周期，但与 LLC 标签访问并行运行，不增加关键路径延迟。
    *   **LLC Pkt Appender**：如果请求命中流，则附加一个小的元数据包头，包含 stream ID、core ID、thread ID 和 stream type（直接/间接等）。对于直接流，步幅在第一个请求时单独发送一次。元数据通过片上互连的用户定义位（例如 AXI 总线）传递到内存控制器。

**多通道感知扩展 (Multi-Channel Aware Nucleus Extension)**

对于多通道 DRAM 系统（InterStellar 2.0），Nucleus 增加了 **Channel-Aware iBatch-Seed Dispatcher**（图 2.14）。其工作流程如下：

*   当识别出一个直接流时，Nucleus 确定即将访问的每个地址映射到哪个 DRAM 通道（基于物理地址映射，如 RoBaBgColRaCh）。
*   对于每个活跃通道，Nucleus 生成一个“batch segment seed”——即该通道负责的未来行命中请求的起始地址和步幅信息。
*   每个通道的本地内存控制器（MCi）**仅**接收自己段落的种子，然后独立扩展、执行 iBatch 和 iPP 策略。没有任何跨通道同步或全局批次队列。

这种方法允许带宽随通道数线性扩展，同时保持控制器自治。

**Nucleus 的运行时工作流示例（图 2.12）**

*   软件初始化描述符并为每个活跃流计算 start_VA 和 end_VA。
*   当两个 LLC 缺失包（物理地址 0xB200 和 0x1700）到达时，LLC Request Filter 查询 TLB^-1 和 Desc Table。
    *   0x1700 不在任何流范围内 → 不附加元数据（类型=None）。
    *   0xB200 映射到虚拟地址 0x3200，属于流 A 的范围 → 附加 stream ID=1, type=1 (Direct), core ID=0。
*   附加后的包被发送到内存控制器用于调度和策略执行。

**硬件成本总结（来自 2.7.2 节）**

*   **描述符存储**：复用 CSR 基础设施，32 个 CSR 足以存储 16 个描述符（128 位/描述符，占 2 个 CSR）。
*   **Desc Table**：约 2.76 kB（16 流 × 8 核）。
*   **Stream TLB^-1**：256 条目，约 2.5 kB（取决于条目宽度，约 40 位 VPN + 40 位 PFN + 元数据）。
*   **LLC 过滤与附加逻辑**：占主导的是比较器和窄关联查表，无大型 CAM；附加器是组合逻辑。
*   **多通道分段逻辑**：每个通道一个小 FIFO/记录（例如首地址和步幅），仅位提取和简单计算，开销可忽略。

**整体作用**

Nucleus 充当了软件语义和硬件微架构之间的桥梁：它使内存控制器能够做出**流感知**的页策略（iPP）和智能批处理（iBatch）决策，同时不对软件模型（无需 ISA 或 OS 修改）增加负担。通过提前处理描述符和地址转换，Nucleus 以极低的延迟附加元数据，使下游控制器能够将未来已知的内存访问转换为行命中批次，从而显著减少 DRAM 冲突和延迟。

**与系统其他部分的输入输出关系**

*   **输入**：
    *   来自应用/编译器通过 CSR 写的描述符（Loop, Direct, Indirect, Link）。
    *   来自 LLC 的物理地址缺失请求。
    *   来自 CPU TLB 的翻译更新。
*   **输出**：
    *   每个 LLC 缺失包附加了 (Stream ID, Core ID, Thread ID, Stream Type, 若为直接流则含步幅)。
    *   对于多通道系统，输出到每个内存控制器的通道特定批次段种子。
    *   向 TLB^-1 写入新的 VA→PA 映射。

### 3. Intelligent Page Policy (iPP)

**核心观点**
Intelligent Page Policy (iPP) 是 **InterStellar** 内存控制器中负责 **per-bank、per-stream** 行缓冲（row-buffer）驻留决策的模块。它利用软件提供的流信息，将传统硬件启发式（如open-page/close-page）替换为 **确定性流感知策略**：对直接流（direct stream）采用 **row-hit计数器** 预测何时预充电；对间接流（indirect stream）采用 **冲突跟踪窗口与双阈值** 动态判断行驻留。iPP 的决策直接决定了行命中/冲突率，并与 **iBatch** 单元协同，确保批处理只在行仍有局部性时扩展。

**实现原理与算法流程**

- **输入输出关系**
  - **输入**：来自 LLC 的请求包（已由 Nucleus 附加 **stream ID**、**sub-stream ID**、**stride** 等元数据）；每个 bank 当前的 **row-buffer状态**（打开的行地址）。
  - **输出**：对每个 bank 发出 **keep row open** 或 **precharge** 信号，以及可选的 **提前预充电** 指示。
  - **作用**：为后续请求（包括 iBatch 生成的突发行命中流）提供正确的行打开/关闭状态，减少不必要的行冲突延迟。

- **直接流（Direct Stream）行命中计数器**
  - 每个活跃的 **直接子流（sub-stream）** 在每个 bank 中维护一个 **自增计数器**。
  - 当该子流的请求在当前打开的 DRAM 行上命中时，计数器递增。
  - 控制器根据公式 **MaxHit_stream_i = DRAM Page Size / max(Cache Line Size, Stride(stream_i))** 计算出该子流在当前行上可预期的最大命次数。
  - 当计数器达到 **MaxHit** 时，iPP 判定该子流即将耗尽该行的局部性，立即发出 **precharge** 命令并重置计数器。
  - **效果**：行只保持到有效命中窗口结束，避免后续因跨行访问导致的冲突。

- **间接流（Indirect Stream）冲突跟踪窗口**
  - 对于无法通过静态公式预测的间接流（如 A[B[i]]），iPP 为每个活跃间接流在每个 bank 维护一个 **滑动窗口** 记录最近访问结果。
  - 窗口包含：**Prev_Addr**（上一次访问的行地址）、**Crnt_Addr**（当前访问的行地址）、**冲突计数器**、以及一个 **短历史移位寄存器**（记录最近访问是行命中还是冲突）。
  - 每次访问该 bank 时：
    - 若 **Crnt_Addr == Prev_Addr** → 行命中，计数器不变。
    - 若 **Crnt_Addr != Prev_Addr** → 行冲突，计数器递增，历史寄存器记录“冲突”。
  - 使用 **双阈值规则** 决定是否关闭行：
    - 若 **冲突数 ≥ TH**（高阈值）→ 立即关闭行（高冲突率）。
    - 若 **TL ≤ 冲突数 < TH** 且 **上一次访问也是冲突** → 关闭行（冲突趋势即将恶化）。
    - 否则保持行打开。
  - **参数设置**：**TH** 和 **TL** 是可编程的，通常根据系统对冲突容忍度配置。文档中未给出具体数值，但可通过软件/用户调整。

- **参数设置**
  - 直接流：**MaxHit** 由 DRAM 页面大小、缓存行大小和流 stride 共同决定（自动计算）。
  - 间接流：**TH（高阈值）**、**TL（低阈值）** 为可编程参数，每个子流/每个 bank 可独立设置。
  - 所有计数器与窗口均 **per-bank、per-stream** 实例化，保证隔离性。

- **与 iBatch 的协调**
  - iPP 充当 iBatch 的“停止条件”：
    - 当直接流计数器达到 MaxHit 时，iPP 请求预充电，iBatch 立即停止对该子流在该 bank 的批量扩展。
    - 当间接流冲突窗口超过 TH 时，iPP 同样请求预充电，iBatch 停止为该流生成新读取。
    - 只要 iPP 认为行仍有局部性（计数器未满或冲突未超阈值），iBatch 就继续填充行未来命中的地址。这种协作保证了行打开时间刚好覆盖有用批量，避免浪费并发开销。

**在整体架构中的作用**
iPP 是 **InterStellar** 内存控制器中最关键的 **局部性决策模块**。它直接决定了 DRAM 的 **行命中率**、**行冲突率** 以及 **有效带宽**。与仅根据整体历史做决策的传统自适应策略不同，iPP 利用 **流级认知** 做出精确定时的 precharge/keep 决策，从而：
- 将大部分访问转换为低延迟行命中（配合 iBatch 产生突发命中）。
- 避免行“抖动”——多流交替时不必要的频繁激活/预充电。
- 通过 **提前预充电** 减少下一个流第一个请求的等待时间（将其从行冲突降级为行缺失）。
- 最终，iPP 是 **InterStellar** 实现 **2.72× 端到端加速** 和 **24% DRAM 能量降低** 的核心支撑之一。

### 4. Intelligent Batching (iBatch)

**核心原理与实现机制**

- **Intelligent Batching (iBatch)** 是一种前瞻性预取机制，由 **InterStellar** 的 **Memory Controller (MC)** 侧实现。其核心思想是：一旦某 **stream** 的一条需求请求打开了一个 **DRAM row**，控制器立即利用该 stream 的描述符（**base address**、**stride**）预判该 row 内后续所有将被访问的 **cache line addresses**，并主动向 DRAM 发送读取命令，将返回的数据暂存于 **per-bank iBuffer** 中。后续核心对该 stream 的需求请求若命中 **iBuffer**，则以 **buffer hit** 速度响应，无需再次访问 DRAM。

- **算法流程**：
    - **触发条件**： MC 接收到一个标注了 **stream ID** 的需求 LLC miss，且该请求导致了 DRAM 行激活（ACT）。此时 **iBatch** 逻辑被激活。
    - **地址生成**：使用 stream 的 **stride**（从 **Nucleus** 附加的元数据中获得）和当前行的起始地址，由硬件 stride 增量器快速计算该行内未来连续 cache line 的物理地址。
    - **行命中优先**：仅生成“打开行”内连续的地址，确保每个预取请求都是 **row hit**，避免引入额外行冲突。
    - **PAQ (Pending ACT Queue)** ：当 iBuffer 容量不足或因 **JEDEC timing** (如 `tFAW`, `tRRD`) 无法立即发出所有预取时，过量的地址暂存于 **PAQ** 中，待条件允许时再逐个发出。**PAQ** 解耦了逻辑批次深度与瞬时物理容量。
    - **数据返回与匹配**：预取数据返回后写入 per-bank **iBuffer**，并记录地址和 `R` 标记（data ready）。后续需求请求到达时，**rtMatcher** (类似模块) 检查 iBuffer，若命中则直接返回数据，否则按常规路径处理。

- **参数设置**：
    - **iBatch depth**：单次发起的最大预取行数，典型值为 **16** 或更高（实验显示大于 64 行有明显提升，但受限于 iBuffer 大小和 DRAM timing）。**depth** 直接影响延迟隐藏效果。
    - **iBuffer size**：每个 bank 的本地缓存容量，常设为 **4 kB** 或 **8 kB**。大小需平衡存储开销与吞吐收益。
    - **PAQ depth**：每个 bank 的溢出队列深度，典型值 **512 entries**（每 entry 仅存储地址，开销小）。
    - **Channel-Local Batch Expander**：在多通道系统中，每个通道仅接收本通道的 batch seed（首个地址和 stride），自行扩展和调度，无需跨通道同步。

- **输入与输出**：
    - **输入**：来自 **Nucleus** 的 stream 元数据（**stream ID**、**stride**、**base address**）、需求 LLC miss 请求、以及来自 **iPP** 的停止信号（当行命中预算耗尽或冲突过高时）。
    - **输出**：向 DRAM 发送的 **CAS (column access)** 命令序列（预取），以及 **iBuffer** 中缓存的数据。后续需求请求若命中 iBuffer，则输出缓存数据并标记为 **buffer hit**（而非 DRAM row hit 或 row conflict）。

**在整体架构中的作用**

- iBatch 与 **Intelligent Page Policy (iPP)** 紧密协作：iPP 负责决定何时关闭行（基于 stream 的行命中计数器或冲突窗口），iBatch 在行保持打开期间持续注入前瞻预取。两者共用 **per-stream tracking** 信息，使预取仅在行有用时进行，避免浪费。
- 在 **InterStellar 2.0** 中，iBatch 通过 **Channel-Local Batch Expander** 支持多通道独立扩展：每个通道只处理映射到本通道的地址片段（如图 2.17、2.18 所示），保证无跨通道通信。图 2.19 展示了每个 bank 独立的 **iBatch** 组织方式，图 2.20 描述了通道感知的 **iBatch** 操作流程。
- 性能收益：iBatch 将大量原本会变为 **row conflict** 的访问转化为 **iBuffer hit** 或 **row hit**，显著降低 DRAM 活跃周期，提高有效带宽。实验显示，在 8 核系统中，iBatch 与 iPP 共同将 DRAM 冲突率从 95% 降至 14%，并实现平均 **1.5×** 的端到端加速（图 2.22、2.24）。
- 能耗优势：通过减少行激活/预充电次数和缩短无效 DRAM 工作周期，**InterStellar** 整体 DRAM 能耗平均降低 **24%**（图 2.27），其中 iBatch 对降低冲突贡献最大。

### 5. Real-Time Batching (rtBatch) and BR-FR-FCFS Scheduling

**核心原理**  
rtBatch（实时批次）是 InterStellarRT 的核心机制，它将来自同一个同构（affine）流的多条读请求在内存控制器（MC）中预组合为一个不可中断的批次，然后以确定的顺序和时序发送给 DRAM。批次大小 B 是一个可配置参数（本文默认 B=16），基于软件提供的流描述符（stride、base address）计算而得：一旦首条 affine 流请求（R_rtbs）被调度，MC 立即生成后续 B-1 条命中同一 DRAM 行缓冲的读地址，并存入专用的批次缓冲（rtBuffer）中。  

**地址映射（rtMap）与 Bank Group 交错**  
rtBatch 依赖特殊的地址映射机制（Map2）将同一批次内的连续读请求分布到不同的 Bank Group（BG）。Map2 将物理地址的低位用于选择 BG，使得第 i 条请求落入 BG_i，第 i+1 条落入 BG_(i+1)，从而实现 BG 级交错。这样做可以利用 DDR4/DDR5 中较短的跨 BG 列访问时间（tCCDS），而不必等待较长的同 BG 列访问时间（tCCDL）。  

**调度算法：BR-FR-FCFS**  
InterStellarRT 在传统 FR-FCFS 基础上增加了一个“批次就绪”优先级层。算法逻辑如下：  
- 当一个 affine 流请求的 rtBatch 被触发，该批次的所有请求被标记为“Batch-Ready”。  
- 调度器在所有“批次就绪”的请求中优先选择，并且保证一旦一个 rtBatch 开始执行，必须连续完成该批次的所有请求，不允许被其他请求中断（定理 3.5.3）。  
- 若没有批次就绪，则回退到 FR-FCFS 规则（先就绪先服务，同优先级时按到达顺序）。  
- 调度器还强制两个 BG 段之间的顺序一致性：第一个段总是从某个 BG 开始，第二个段紧随其后（算法 1）。  

**参数设置与逻辑流程**  
- **B（批次大小）**：由 rtBatch 逻辑根据式 (3.20) 确定，取决于 rtBuffer 容量和流的数量。在 B=16 时，批次的持续时间（t_RCD + (B-1)*t_CCDS）通常大于 t_RC，从而使得下一次激活等待时间优化为 t_RTP + t_RP - t_CCDS（式 3.6）。  
- **rtBuffer**：每个 DRAM bank 有专用的缓冲，存储提前取回的数据。每条条目包含地址、数据、两个标志位（V=有效数据已返回，R=有需求请求在等）。  
- **写入批次干扰**：由于 rtBatch 执行不可中断，只有批次的首条请求（R_rtbs）可能遭受其他核的写批次干扰（定理 3.6.4），其余 B-1 条请求不受影响。  

**输入输出关系**  
- **输入**：来自 LLC 的 miss 请求，已携带流 ID、类型、stride 等元数据。  
- **处理**：MC 的 rtMatcher 检查是否命中 rtBuffer（R_rtbh），命中则直接返回数据；若命中等候（R_rtbw）则等待数据到达；若不命中（R_rtbs）则触发新批次，生成后续请求并开始执行。  
- **输出**：DRAM 命令序列（ACT -> CAS -> CAS -> ... -> RDA），每个批次仅含一次激活（ACT）和一次自动预充电（RDA），中间均为列访问（CAS），且跨 BG 交错，从而将最坏情况下的请求内延迟从 t_RC（约 55 周期）降低到 (B-1)*t_CCDS（约 60 周期）加上一个 t_RCD（16 周期），而批次间等待优化后仅为 t_RTP + t_RP - t_CCDS（约 21 周期）。  

**整体作用**  
- **隔离干扰**：由于 rtBatch 不可中断，其他核的请求只能在批次间隙插入，从而将最坏情况下的内存延迟从每请求一个 t_RC 降为每批次仅一次激活等待。  
- **紧界计算**：基于批次的特性，InterStellarRT 推导出了形式化的最坏情况内存延迟界（定理 3.6.3、3.6.4），比传统 BNK 分区方案（PartAll）平均严格 3.8 倍（单核）和 13.5 倍（多核干扰）。  
- **性能与能耗**：实测表明，rtBatch 机制将 DRAM 冲突率从传统方案的 95% 以上降至 12.5%，同时实现平均 1.72 倍加速、1.9 倍带宽提升和 14% 能耗降低。  

**大跨步流的适配（ForceB）**  
当 affine 流 stride 超过两个缓存行时，Map2 的 BG 交错失效。InterStellarRT 提供 ForceB 模式，强制同一批次内的所有请求在同一个 BG 中连续执行，使用长列访问延迟（t_CCDL）替换短延迟，并相应调整等待时间计算（式 3.22-3.25）。此模式下界变宽松但仍比传统方案严格，且保证可分析性。  

通过以上机制，InterStellarRT 实现了对实时系统中流式内存访问的严格时序控制，在不引入复杂硬件修改的前提下显著收紧内存延迟界。

### 6. Coordinated Prefetcher and Memory Controller (COMPASS)

**COMPASS架构实现原理**

COMPASS的核心在于通过一个集中式的 **iCoordinator**，在智能LLC预取器 (**iPF**) 和智能内存控制器 (**iMC**) 之间共享软件提供的流信息，从而将预取发射与DRAM批处理节奏对齐，最大程度减少有效缺失延迟。

- **输入与输出关系**：输入包括软件通过HW/SW接口（CSR写入）传递的流描述符，以及来自核心的内存请求。输出是经过协调的预取和DRAM调度，最终降低平均内存访问延迟并提升带宽利用率。iCoordinator从描述符中解析流的基地址、步长、迭代次数等信息，并将这些信息分别传递给iPF和iMC。
- **iCoordinator工作流程**：iCoordinator位于LLC与内存控制器之间。它接收编译器注入的描述符，维护活跃流的状态表。当LLC缺失请求到达时，iCoordinator判断该请求属于哪个流，并将流ID和步长信息附加到请求中。同时，iCoordinator向iPF发送预取提示，向iMC发送批处理提示。**关键点是预取深度与批处理深度被协调**，使得预取数据在DRAM批处理开始前就已就位，或者批处理可以吸收预取请求，避免冗余DRAM访问。
- **iPF智能预取器**：iPF在LLC中实现，利用流信息进行高置信度预取。它根据当前访问位置和步长提前发出预取请求。与普通预取器不同，iPF的预取请求被标记为“流感知”，允许iMC区分预取和需求。iPF的预取度数（超前预取数量）与iMC的批处理大小（iBatch度数）相关联，以协调节奏。
- **iMC智能内存控制器**：iMC继承自InterStellar的机制，包括智能页面策略 (**iPP**) 和智能批处理 (**iBatch**)。它利用流信息在DRAM行打开后批量发出未来的行命中请求，并将数据缓存在iBuffer中。iMC与iPF的协调体现在：iMC在形成批处理时，会考虑iPF已经预取并缓存在LLC中的行，避免重复激活。同时，iMC的批处理调度确保预取的请求不会干扰需求请求的批处理顺序。

**算法流程与参数设置**

- **流识别与标注**：软件编译器（LLVM pass）生成Loop描述符和流描述符，通过CSR写入到iCoordinator的寄存器文件。iCoordinator建立流表，包括虚拟地址范围、步长、循环计数等。
- **协调执行流程**：
  - 当LLC缺失发生时，iCoordinator查询流表。如果匹配，则向iPF发出预取指令（提前N个cache line），并向iMC发送当前请求的流ID和步长。
  - iPF根据当前预取度向外发出预取请求，这些请求进入MSHR并在LLC中填充。iPF的预取度是动态可调的，与iMC的批处理大小相关。
  - 当需求请求到达iMC时，iMC检查该流是否已在iBuffer中有数据。如果有，则立即返回；否则，iMC根据步长计算未来的行命中地址，并形成批处理请求 (**iBatch**)。批处理大小 (**B**) 是配置参数，一般在16-64之间。
  - iMC的调度器 (**BR-FR-FCFS**) 确保一旦批处理开始，就连续执行直到完成，不受其他请求中断。同时，iMC会关闭不再需要的行以减少冲突。
- **参数设置与状态空间探索**：COMPASS评估中探索了多个参数，包括MSHR数量（16-256）、MC队列大小（16-256）、iPF度数（4-64）、iMC批处理大小（8-64）。图4.12-4.15展示了不同参数下的性能变化。**最佳配置通常出现在MSHR为64、MC队列大小为64、iPF度数16、iMC批处理大小32时**。

**在整体中的作用**

COMPASS通过协调预取和批处理，解决了传统方案中预取器注入大量请求造成MSHR拥塞和内存控制器行冲突的问题。iCoordinator的集中信息使预取器能够提前精确获取数据，同时内存控制器可以基于相同的流信息形成高效批处理。这减少了DRAM行冲突和激活次数，提升了带宽利用率。评估结果（如图4.10所示）显示，COMPASS (iPF+iMC) 相比单独的iPF或iMC实现了约 **1.88x** 的平均性能提升，相比COTS基线有 **2.14x** 的带宽改进。


---

## 4. 实验方法与实验结果

好的，根据您提供的论文第2、3、4章内容，我对其实验设置、结果数据和消融实验进行深入分析。

---

**实验设置分析**

该论文的实验体系构建精细，旨在全面评估提出的`InterStellar`系列架构（`InterStellar`、`InterStellar 2.0`、`InterStellarRT`、`COMPASS`）的性能、实时性和能效。

- **模拟器与平台**：核心采用`gem5`全系统模拟器与`Ramulator`周期精确DDR内存模型集成。`InterStellar`和`COMPASS`使用8核RISC-V Out-of-Order (OoO)处理器，`InterStellarRT`使用4核系统。处理器频率2.4GHz，模拟高性能内存子系统（如LLC 2MB）。
- **基准控制器**：对比对象包括**COTS**自适应页面策略控制器、**PARBS**（并行感知批调度）、**BLISS**（黑名单调度）等。`InterStellarRT`额外对比了实时内存控制器**PartAll**、**ORP**和**RTMem**。所有对比均在同一模拟框架下进行。
- **工作负载**：跨三大类共计36个Benchmark：1）高吞吐/流应用（`PolyBench`、`LAPACK`、`Rodinia`、`Parboil`、`Phoenix`）；2）实时应用（选自上述套件）；3）8核混合工作负载（`Z1-Z8`）。这些覆盖了直接流和小/大/混合步长，以及直接+间接混合模式。
- **硬件预取器**：`InterStellar`和`COMPASS`与6种主流HWP（如`AMPM`, `SPP`, `Stride/Stream`）对比，并测试了与`InterStellar`的组合效果，验证其与现有机制的协同性。

**结果数据分析**

多个架构在不同指标上表现出显著优势，核心结论是其性能提升源于将DRAM行冲突转换为高效的批量行命中。

- **`InterStellar` (通用高性能)**：
  - **性能**：在8核系统上，`InterStellar`相较于COTS实现**1.5倍**平均**E2E加速**，最高**2.72倍**。
  - **带宽与能效**：有效内存带宽平均提升**2.0倍**，DRAM能耗平均降低**24%**，最高达**60%**。
  - **预取器交互**：`InterStellar`独立即优于COST+HWP。两者叠加为**互补**关系，实现最优性能。

- **`InterStellar 2.0` (多通道与细粒度流)**：
  - **多通道扩展**：在**32通道**DRAM配置下，`InterStellar 2.0`实现最高**2.92倍** E2E加速和**2.83倍**带宽提升。**通道数量扩展**实验 (`1->32`) 显示其带宽近乎线性增长，而COTS受限。
  - **细粒度子流**：在`Stencil`的`S=3`场景下，细粒度追踪额外带来近**1.35倍**性能增益，证明了对独立访问片精准管理的价值。

- **`InterStellarRT` (实时系统)**：
  - **延迟界**：对于纯仿射流，单核**WCML**收紧**3.8倍**，多核干扰界收紧**13.5倍**。混合仿射性下分别为**2.15倍**和**4倍**。
  - **端到端性能**：平均**1.72倍** E2E加速和**1.9倍**带宽提升，能效提高14%。
  - **界紧致性**：`InterStellarRT`的理论界与实际测量值非常接近，验证了分析方法的精确性。

- **`COMPASS` (协调预取与调度)**：
  - **整体性能**：在**23个**工作负载、**25种**配置下，`COMPASS` (`iPF+iMC`) 实现了最高平均E2E加速（**1.88倍**）和带宽提升（**2.14倍**），全面超越独立`iPF`、`iMC`及所有基线，证明了架构协同的价值。

**消融实验分析**

论文通过消融控制变量，量化了各架构核心贡献。

- **`InterStellar`系列 (iPP 与 iBatch 解耦)**：
  - 设计一项实验（1ch, 1 core）对比**Baseline vs. InterStellar**。图2.8和2.22揭示：Baseline因流间冲突导致大量**行冲突**，而`InterStellar`的**`iBatch`**和**`iPP`**几乎消除冲突，**`iBatch`**是主要性能来源。
  - 另一实验（Fig. 2.25, 8-core）设加/减`iBatch`和`iPP`。`iBatch`独立将性能从1.0x提升至~1.4x，`iPP`提供~1.15x提升。两者组合达最高~1.5x，表明机制**可分离且高度互补**。

- **`InterStellar 2.0` (细粒度子流)**：
  - 固定所有条件，仅改变流描述方式，对比**粗粒度 (1S)** 和**细粒度 (3S)**。在`Stencil`的`S=3`场景，**3S**策略带来可比**35%**的性能提升，明确归因于为每个独立Row Slice维护专门的`iPP`状态，避免了相互污染。

- **`COMPASS` (预取器与调度器解耦)**：
  - 图4.10-4.11拆解为独立`iPF`、独立`iMC`及组合`iPF+iMC`。`iMC`带来约1.4x-1.5x提升，`iPF`带来约1.35x-1.45x提升。组合**`iPF+iMC`**进一步提升至~1.55x-1.75x，验证了协同设计通过`iCoordinator`实现1+1>2的效果。

- **`InterStellarRT` (`rtBatch`与Write-batch)**：
  - 图3.12揭示`rtBatch`大小`B`的量化影响。`B`提升显著收紧**隔离WCML**和**写干扰界**，因`B`增大能屏蔽更多`rtBatch`内请求免受干扰。`B=16`后效能增益趋于饱和，为`B=16`的选择提供了理论依据。

---

