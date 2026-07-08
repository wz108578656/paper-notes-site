# Balancing DRAM Locality and Parallelism in Shared Memory CMP Systems 通俗讲解

### 0. 整体创新点通俗解读

**痛点直击 (The "Why")**

- 现代DRAM靠 **row-buffer** 的**空间局部性 (spatial locality)** 来省电、提带宽。
- 但随着核数增加，多线程的访存流在memory controller被**交错 (interleaved)**。线程A刚打开一个row，线程B马上来把它打掉。结果是**row-buffer hit rate**断崖式下跌，大量时间浪费在 **activate/precharge** 上，功耗暴增。
- 传统的**out-of-order scheduling**（如FR-FCFS）想通过重排序找回一些locality，但**调度窗口 (scheduling buffer)** 有限，而且核多了以后，每个线程的请求到达间隔变大，调度器根本来不及把同一row的请求凑在一起。这就像在拥挤的食堂窗口排队，刚轮到你点菜，后面的人就插进来喊“我要红烧肉”，师傅只好把刚才的菜倒掉重新做。**调度只是治标，解决不了交错本身。**

**通俗比方 (The Analogy)**

- 想象一个**大型图书馆**，里面有很多**阅览室 (bank)**。每个阅览室都有一个大**书桌 (row-buffer)**，同一桌的书可以快速翻阅（row-hit）。过去只有一个人看书（单线程），他可以独占一个阅览室，书摊一桌子，效率极高。
- 现在来了**8个读者（多核）**，他们都在同一个阅览室里看书。A刚把一摞书摊开，B过来把书推到一边放自己的。C，D又轮番上阵。结果每个人都在**摊书、收书 (activate/precharge)**，几乎没时间看。这就是**inter-thread interference**。
- **银行分区 (bank partitioning)** 的做法：干脆把读者分开，每人分到一个**独立阅览室**。这样A的桌子再也不会被B弄乱，**locality** 保住了。但新问题来了：一个人只有一个阅览室，当他要查多本书（并发请求）时，只能一本一本地等，**parallelism** 不够，因为只有一间阅览室，就算几个同事同时帮忙找，也只能在一个房间里挤着。
- **Sub-ranking** 的妙处：不增加阅览室数量（不增加物理bank），而是把每个阅览室里的**大桌子换成几个小桌子**（即把一个 **rank** 分成多个 **sub-rank**）。这样同一个阅览室里可以同时有好几个人在各自的小桌子上摊书（并行操作）。注意，分桌子不是免费的：小桌子只能放更少的书，一次能查的书量变少，但可以同时查多本。
- **这篇论文的核心**：先**分阅览室 (bank partitioning)** 解决打架问题（提高locality），再**把大桌子换成小桌子 (sub-ranking)** 解决一个人查书慢的问题（恢复parallelism）。两者配合，既保留了独享空间的安静，又获得了并行查书的速度。

**关键一招 (The "How")**

- **作者并没有修改DRAM硬件或者memory controller的调度算法**，而是用了一个软件+微架构的巧妙组合。
- **第一步（软件）**：通过**OS物理页分配**实现 **bank partitioning**。常规的页分配是均匀散列到所有bank的（为了负载均衡），作者改成了根据 **core ID** 或 **thread ID** 来着色（coloring），使得每个核只能使用特定子集的物理页框，这些页框只映射到固定的几个bank。这样，不同核的访存流自然就被隔离到不同bank，硬生生消除交错。（需要配合 **cache set index permutation** 来避免cache set冲突导致bank冲突）。
- **第二步（微架构）**：用 **sub-ranking** 来“变出”更多bank。传统的 **rank** 是64bit宽，所有 **chip** 一起工作，一起接收命令。sub-ranking 把rank拆成**32bit宽的子rank**，每个子rank可以独立控制。这样，虽然物理上只有8个bank，但一旦用了32bit sub-ranking，每个bank可以被独立当作两个逻辑bank（因为每个子rank可以独立打开不同row），所以有效bank数翻倍。注意，要选择32bit宽度，因为太窄（16bit/8bit）会增加 **latency** 太多，得不偿失。
- **总而言之**：**作者并没有增加DIMM或bank数量，而是通过OS分配隔离干扰，通过sub-ranking让每个隔离后的核能同时操作更多“小bank”，从而同时提升了locality和parallelism。** 两个调优旋钮（bank分区数、sub-rank宽度）可以平衡不同应用的需求：对locality敏感的应用（如lbm）多分点bank，对parallelism敏感的应用（如mcf）多用点sub-rank。

### 1. Bank Partitioning via OS Physical Frame Allocation

**痛点直击**  
多核系统下，每个线程原本不错的 **row-buffer hit rate** 被彻底打散。根本原因不是调度器不给力，而是物理页帧在 **DRAM bank** 间的“无差别摊大饼”式分配——不同线程的虚拟页交错在同一个 bank 里跑，前一秒 A 线程刚打开某 row，下一秒 B 线程的请求就要关闭它（precharge + activate），空间局部性被直接清零。即使调度器拼命重排，受限于缓冲区深度和交织粒度，也只是杯水车薪。

**通俗比方**  
想象一个大型图书馆的阅览室（row-buffer），每个读者（core）习惯把一堆书摊在桌上慢慢看。如果所有读者都挤在同一张桌子上（share the same bank），一个人刚放好书，另一个人就过来把书收走，结果谁都无法好好阅读。**Bank Partitioning** 就是给每个读者分配一张专属桌子（专属 bank set）——桌子之间物理隔离，你永远不用管旁边的人怎么摆书。但副作用是每个读者能用的桌子数量变少了（parallelism下降），于是需要额外技巧（sub-ranking）来“把每张桌子加长”，补偿并发能力。

**关键一招**  
作者没有改动内存控制器硬件，而是把 **物理页帧分配** 这个操作系统日常操作当成了武器。核心逻辑：把物理页帧映射到 **DRAM bank** 的规则从“均匀打散”改成“按 core 归类”。具体通过 **page coloring** 实现——在物理地址的某些位上嵌入“core ID”作为颜色标记，OS 的页帧分配器保证同一个 core 的颜色对应的物理帧都落在同一组 bank 里。这样，线程 A 的访问只命中的 bank {0,1}，线程 B 只命中 bank {2,3}，行缓冲冲突直接消灭于无形。整个改动只在 OS **物理帧分配** 这一层，硬件架构和内存控制器无需任何修改。

---

**附加洞察**  
- 这种只动软件不动硬件的思路非常实用，尤其适合现代 OS 的页表管理（页位着色已有成熟实现）。  
- 但要注意：它会导致每个线程可用的 bank 数减少，所以论文必须搭配 **sub-ranking** 来提升有效 bank 数，否则低局部性应用（如 mcf）会因为并行度不足而性能倒退。  
- 关键判断标准是 **workload 的空间局部性**：如果全是高局部性（如 lbm），partitioning 收益显著；如果混合低局部性，必须同步加入 sub-ranking 找平衡。

### 2. DRAM Sub-Ranking to Increase Effective Banks

你手头有8个核心，但DRAM系统总共只有32个bank（2通道×2 rank×8 bank）。为了隔离线程干扰，你做了bank partitioning——每个核心只被允许访问4个bank。这下糟了：那些对**bank-level parallelism**极度饥渴的线程（比如`mcf`、`omnetpp`），原本需要8个甚至16个bank来隐藏那一连串的**row-conflict**延迟（40+ cycles），现在却被关在4个bank的笼子里。它们的**activation**和**precharge**命令无法充分重叠，**latency**像滚雪球一样堆积，IPC暴跌。加更多的rank？代价是额外的DIMM、信号完整性瓶颈、以及rank-to-rank切换的2个周期惩罚。加更多的chip？成本爆炸。在core数量增长远快于bank数量的今天，单纯靠partitioning等于“拆东墙补西墙”。


想象你有一个大会议室（一个**rank**），里面有8个小圆桌（**bank**），每个圆桌上有一份整版地图（**row-buffer**）。正常情况下，所有人共享所有这些圆桌，但互相干扰——你刚打开的地图，别人冲过来撕碎了。你干脆把会议室用隔板分成两个小会议室，每个小会议室只给特定小组用（**bank partitioning**）。这下干扰没了，但问题来了：你那小组本来需要8张地图来并行研究，现在只有4张，重要任务（多个**row-conflict**请求）被排成长队，效率下降。

**sub-ranking**的做法就像：你发现每个大圆桌其实可以拆分成两个半圆桌（每个32-bit宽的**sub-rank**）。你不加新桌子，只是把每张桌子锯成两半，让每半张桌子都能独立翻开一份地图。原来只有4张桌子，现在变成了8个半桌子——虽然每半张桌子稍微小一点（需要多花几个时钟周期才能从上面取数据），但**并行度**翻倍了。你的小组终于又能同时研究8份地图了，尽管取图慢了一点点，但总时间大大缩短。


作者没有增加任何**rank**、**channel**或**DIMM**，而是直接修改了DRAM芯片的组织方式：将一个64-bit宽的**rank**拆分为两个32-bit宽的**sub-rank**。具体做法是让**memory controller**通过独立的**chip-select**信号分别控制每个**sub-rank**上的**die**。这样，同一个物理**rank**内的两半可以持有不同的**row**，并独立地执行**activation**、**read/write**、**precharge**命令序列。从**memory controller**的视角，它好像拥有了两倍的**bank**，因为原来一个**bank**现在变为两个半独立**bank**。代价是每次访问只激活一半的**DQ**线（32-bit而非64-bit），因此一次**burst**需要多花4个**DRAM clock**（例如从64B cache-line需要4 beats变成8 beats）。但这额外4周期的**latency**相比于**row-conflict**的40+周期，完全值得。最巧妙的是，这个改动只涉及DRAM模块内部（或**module-side controller**），对**memory controller**的接口改动极小，只需增加额外**chip-enable**信号线，无需改造昂贵的处理器芯片。

**核心逻辑转换**：不是“增加资源数量”，而是“分裂已有资源粒度”；不是“减少每个请求的字节宽度”，而是“让每个请求占用的时间变长一点点，但换来两倍的并发度”。这个trade-off在**bank-limited**系统中恰好踩准了平衡点。

### 3. Combined Bank Partitioning and Sub-Ranking

**痛点直击**

传统 DRAM 系统为了利用空间局部性，会把连续的物理地址映射到同一个 **row-buffer**，这样后续读写就能直接命中，又快又省电。但当多核处理器上的多个 **thread** 并发访问内存时，这种精妙的设计立刻崩溃。不同 **thread** 的访问流在 **memory controller** 的调度队列中被随机交错，导致它们的请求频繁命中不同 **bank** 中的不同 **row**。每个请求都迫使 **DRAM** 执行一次 **precharge** 和 **activate** 操作，把好不容易打开的 **row** 关掉，再重新打开另一个 **row**。

这是一场“刚铺好路就挖掉，再重新铺”的灾难。结果是 **row-buffer hit rate** 断崖式下跌，访问 **latency** 飙升，并且由于频繁的 **activate** 操作，功耗大幅增加。现有的 **FR-FCFS** 等内存调度器虽然能通过重排序部分恢复局部性，但其效果受限于有限的调度缓冲区深度和 **thread** 的请求到达间隔。随着核数增加，这种“缝缝补补”的调度策略会越来越力不从心。

**通俗比方**

这就像一个大办公室里，有两个互不相干的项目组，被迫使用同一个**巨大的、杂乱无章的档案柜**。项目组A（高局部性）原本可以顺着一格看完相关档案，但项目组B（低局部性）总是随机抽走旁边的档案，导致A每次都要重新拉开整个抽屉。

*   **Bank Partitioning（分区）** 的做法是：用一把锁将档案柜横向切开，每个项目组只能使用属于自己的那一半抽屉。这样一来，A组的翻阅不再受B组打扰，局部性得到完美保护。但代价是，当A组需要查阅多个不相关的档案时（低局部性，需要高并行度），他们只能在自己那一半的狭窄空间里倒腾，效率反而可能下降。

*   **Sub-Ranking（子秩拆分）** 的做法是：不切档案柜，而是把每个抽屉本身改造成一个“多层旋转架”。原本一个抽屉放一叠档案，现在一个抽屉被拆成更小的单元（**sub-rank**），可以同时打开和翻阅。这等效于在不增加柜子体积和造价的前提下，把抽屉数量翻倍。

*   **Combined Bank Partitioning and Sub-Ranking** 的做法则是：**对档案柜进行纵向切割（分区），同时对每个分区内的抽屉进行“多层化改造”（sub-ranking）**。这样，A组在自己专享的分区内，不仅能免受打扰，还能利用“多层抽屉”同时查阅多份档案，一举解决了分区带来的并行度下降问题。

**关键一招**

作者最巧妙的一招，是**将两个原本相互对立、甚至冲突的技术，通过操作系统（OS）层的调整，完全解耦并组合起来**。

他们并没有在硬件层面（如改变 `DRAM chip` 或 `DIMM` 的物理结构）去实现一个复杂的“智能分配器”。相反，他们的核心手法是**操纵虚拟地址到物理地址的映射**。

*   **第一步：通过页面着色实现Bank隔离**。作者修改了 **OS** 的物理帧分配算法。在分配内存时，OS 会确保一个 **thread** 的所有物理帧，其 `DRAM` 地址中的 **bank** 位都来自一个固定的子集。这本质上是一种 **cache coloring** 技术，只不过用来对 **bank** 进行着色和分区。这是一种**纯软件**的修改，不需要改动 **memory controller** 或 DRAM 模组。

*   **第二步：通过Sub-Ranking补偿并行度**。当分区导致每个 **thread** 可用的 **bank** 数量减少时，作者引入了 **sub-ranking**。**Sub-ranking** 将一个标准的 64-bit 宽 **rank** 拆成多个更窄的（如 32-bit） **sub-rank**。这样做，相当于让每个 **bank** 内部“分裂”出更多独立运作的 **sub-bank**。虽然访问单个 **sub-rank** 的 **latency** 略有增加（因为需要更长的时间拼凑出完整数据），但**有效 bank 数量翻倍**所带来的 **bank-level parallelism** 提升，足以抵消这个微小的副作用，甚至还能节省更多的DRAM激活功耗。

这个设计的精妙之处在于，**bank partitioning** 解决了“干扰”问题，**sub-ranking** 解决了“资源不足”问题。它们一个主攻**定性**（消除冲突），一个主攻**定量**（增加资源）。两者结合，而非二选一，才真正实现了一种**平衡态**：让高局部性的应用保持高命中率，让低局部性的应用保持高并行度，最终在提升性能的同时大幅降低功耗。

### 4. Cache Set Index Permutation to Preserve Bank Partitioning

在DRAM **bank partitioning** 的方案里，操作系统通过**页着色**（page coloring）把属于不同 `thread` 的物理页固定到互不相交的 **bank** 集合。这很聪明——它能从根本上杜绝不同 `thread` 的访问流共用同一个 **row-buffer**，从而避免干扰。但问题来了：传统 DRAM 地址映射中有一个常见的优化叫 **XOR-permuted bank indexing**。它的初衷是打散 `cache set` 内部的 bank 冲突——具体做法是把 `bank index` 和 `cache tag` 中的一部分进行异或（XOR）。这个操作让本来受着色控制的物理页被均匀地散开到所有 **bank** 上。**结果就是，bank partitioning 被轻易瓦解了**：你辛辛苦苦给每个 thread 分配好的独享 bank，经过 XOR 之后，又变成了大锅饭。更关键的是，这个优化原本是为了缓解 `cache set` 内的 bank 冲突，而 bank partitioning 本身并不反对打散 `cache set` 内的访问——它只要求不同 thread 的页不能落在同一个 bank 组。**所以我们需要一种新方式，既能保住 bank partitioning 的隔离性，又能避免 `cache set` 内部的 bank 冲突**。之前的做法等于是"为了给房间通风，把整面墙拆了"。


想象你有一个大农场，里面有很多隔间（**bank**）。你想让不同农户（`thread`）各自使用不同的隔间，避免他们互相干扰（**bank partitioning**）。于是你在农场门口贴了门牌号（页着色），规定每个农户只能进特定编号的隔间。

但农场内部有一个自动传送带（**XOR-permuted bank indexing**），它本来是用于把货物均匀分配到隔间，避免某个隔间堆满货物（**bank conflict**）。这个传送带有一个机制：它不看门牌号，而是根据货物标签（`cache tag`）的一部分重新分配隔间。结果，即使农户想进 A 隔间，传送带也可能把货物送到 B 隔间里去。“门牌号”形同虚设。

现在的解决方案是：**不动门牌号（不改 bank 索引），而是改造传送带的分配逻辑**——不再从货物标签里取一部分来重新决定隔间，而**只对货物在隔间内部的放置位置（cache set 索引）进行置换**。这样，只要货物属于同一个农户，它就一定进入同一个隔间组（**bank partition**），但在这个隔间组里，货物可以分散在不同的架子上（不同 bank）。最终效果：隔间隔离完好，但每个隔间内部依然能避免局部拥挤。


作者没有改变物理地址到 DRAM 地址的映射（那会影响整个内存控制器的解码），也没有放弃 XOR 打散带来的好处。**核心操作是：把 XOR 的目标从 `bank index` 换成 `cache set index`**。

具体逻辑如下：
- 原本的优化：`DRAM_bank = phys_bank XOR (tag_bits)` → 破坏 bank 分区。
- 现在的做法：`Cache_set = phys_set XOR (some_bits_from_tag)` → 不改变 DRAM bank 归属。

关键在于，`cache set` 的确定是在处理器内部的 cache 寻址阶段，独立于 DRAM bank 映射。修改 `cache set index` 只会改变 cache line 在 cache 中的存放位置，而**不会影响该 cache line 退役后写回 DRAM 时所对应的物理地址**。因此，物理页到 DRAM bank 的绑定完全不受影响，`bank partitioning` 得以完整保留。

同时，由于同一个 `cache set` 内的 cache line 在置换后可能来自不同的 `tag` 域，它们在访问 DRAM 时会自然散列到不同 bank（因为物理地址中的 bank 位没被扰乱，但不同 tag 对应不同物理行，落在不同 bank）。**这样就实现了同一 cache set 内部的 bank 并行度，而没有破坏跨 thread 的 bank 隔离**。巧妙之处在于，它把“打散冲突”的责任从 DRAM 层上移到了 cache 层，让两个不相干的需求（隔离 vs 并行）各安其位。
