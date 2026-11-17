# 论文驱动中文课程地图（Transformer Explainer）

对应论文：Transformer Explainer（CHI，doi:10.1145/3772318.3791725）。

本产品的中文教学已经全部进到界面里，不必先翻仓库里的 markdown。本文件是对照手册，不是产品大门。推荐入口：

1. **底部 CoachBar 入门条**：带路认界面、点生成、看注意力/温度。
2. **顶栏「书库」里的 Textbook 20 步**：每页固定六段——干什么 / 为什么 / 怎么算 / 看哪里 / 常见误解 / 进阶。教材在书库里，需要时再打开，不会自动弹出。
3. **左下角的「学习工作台」按钮**：学习路径、必做实验清单（勾选会保存在本机浏览器）、术语表、关键自测（无分数）。
4. **文底中文长文**：按论文学习目标 LO1–LO6 与数据流写成的教学正文；右上角可切到英文原文。

## 学习目标 LO 到 书本页 到 界面模块

| 论文目标 | 书本 page id | 界面上看 |
|---|---|---|
| LO1 自回归 next-token | how-transformers-work, sampling | 顶部生成、示例句子、右边概率 |
| LO2 架构总览（嵌入/块/概率） | what-is-transformer, transformer-architecture, blocks | 左嵌入、中块、右概率 |
| LO3 text→embedding（token+位置） | embedding, token-embedding, positional-encoding | 嵌入展开视图 |
| LO4 多头自注意力（QKV、多头、因果掩码） | self-attention, qkv, multi-head, masked-self-attention, output-concatenation | 注意力展开、头切换、掩码 |
| LO5 注意力后的 MLP | mlp | 块内 MLP 放大镜 |
| LO6 概率 + 温度 + top-k/top-p | output-logit, output-probabilities, temperature, sampling | 概率展开、温度滑条、采样控件 |
| 辅助机制 | residual, layer-normalization, dropout | 残差虚线、LN/Dropout 标记 |

论文设计思想在书本「进阶」段反复出现：token 中心数据流、渐进展开、浏览器直播 GPT-2、黄高亮引导。

## 三层路径：小白 → 进阶 → 专家

界面「学习工作台 → 学习路径」与下面一致。

### 小白（第 0 天）
- 走完 CoachBar 全部关卡（或在工作台点「打开新手引导」）。
- 需要时打开顶栏「书库」第 1–3 页，认清三块区域。
- 点「生成下一个词」至少 5 次，只盯右边第一名。

### 进阶（跟着 20 步）
- 按书库顺序走完 20 页；每页先读六段，再点黄高亮/放大镜。
- 在 QKV、掩码、温度三页大声复述「怎么算」，并可做工作台里的「关键自测」。
- 完成工作台「必做实验」清单（也可对照下方列表）。

### 专家门口（可开始读论文/做记录）
- 能向别人讲清：下一个词概率从哪来。
- 能独立设计温度 vs top-k 对照表。
- 对照论文第 6 节设计，解释每个交互解决什么学习困难。
- 下一步可对外阅读：原始 Transformer、GPT-2、因果 LM 训练目标（本工具先推理后训练）。

## 必做实验清单（已做进学习工作台）
工作台里每一项都有「怎么做 / 要看到什么」，并可点「看对应控件」闪一下相关区域。勾选写入 `localStorage` 键 `te-lab-checks`，刷新不会丢。

1. **温度对照**：同一输入，T≈0.2 / 1.0 / 1.5，记录前 10 名概率与生成 10 次的重复情况。温度不是「创造力旋钮」。
2. **top-k / top-p 对照**：固定温度，改 k 或 p，观察候选集合与意外词。
3. **换输入看注意力**：改一个主语/否定词，切换 head/block，看亮点是否移动。
4. **放大镜公式**：嵌入、注意力、概率三处各点开一次，悬停看数值/公式卡。
5. **教学闭环**：合上书库，用自己的话画「嵌入→因果多头注意力→MLP→logits→采样」流程图。

## 术语表与关键自测
- **术语表**：token、embedding、位置编码、Q/K/V、因果掩码、多头、MLP、残差、层归一化、dropout、logit、softmax、温度、top-k/top-p、自回归、decoder-only。每条都有大白话和「界面上看哪里」。
- **关键自测**：QKV、因果掩码、温度各两题，选完立刻给一句原因，没有分数或积分。可跳回书库对应页。

## 与文底长文的关系
默认语言为中文时，文底是按 LO 与数据流重写的中文教学正文（保留 `article-*` 锚点，放大镜「阅读更多」仍能跳转）。切到 EN 可阅读英文原文。主线仍建议：教练条 → 需要时再打开顶栏「书库」里的 20 步教材 → 工作台实验与自测 → 再对照论文。


## 图片课与音乐课（同一套壳，不同课轨）

顶部可在 **文字 / 图片 / 音乐** 之间切换。默认仍是文字课（GPT-2）。底栏教练、顶栏「书库」、左下角「学习工作台」按钮、语言切换的位置不变；切换课轨时，中间视觉、教材页、教练关卡和工作台内容会一起换。

界面会标明：图片与音乐用的是预先设计的示例轨迹，用来把流程看懂，不是在浏览器里下载并运行大模型。

第一次切到图片或音乐时，会先出现对照说明：「你刚才学的『下一个词』在这里变成了什么」。看过后会记在本机 `localStorage`（`te-course-contrast-image` / `te-course-contrast-music`）。

### 图片课（潜在扩散主路）

- 主按钮：**再去噪一步**（可「一次播完全部步骤」，可暂停、回退）。
- 三块：左条件/提示词，中潜图从噪声变清，右本步噪声 / VAE / CFG 对照。
- 旋钮：听话程度（CFG）、总步数、起点编号（种子）、调度器、示例提示词。
- 对照模式：图像 token 自回归，按块填写，右边是下一块概率。
- 教材 18 步、教练 12 关、实验 5 项、自测 6 题。实验勾选键：`te-lab-checks-image`。
- 文底是图片课长文（中/英），锚点与教材页对应，例如 `#article-cfg`。

图片教材页顺序：image-is-a-process, two-routes, prompt-as-condition, why-latent, noise-and-timesteps, denoise-one-step, scheduler, cfg, seed, vae-decode, unet-dit, image-tokens, cross-attention, failure-cases, experiment-cfg, experiment-steps, myths, further-reading。

必做实验：CFG 1/7/15；步数 4/20/50；固定种子改一个提示词；回放第 3 步与更后的步骤；切到图像 token 讲清差别。

### 音乐课（下一个音符）

- 主按钮：**生成下一个音符**。
- 三块：左条件与已有音，中钢琴卷帘，右下一音高/时值概率。
- 旋钮：意外程度（温度）、Top-k / Top-p、示例旋律、调式条件；可试听当前片段，不会自动播完整首。
- 对照视图：音频 token、扩散谱图。
- 教材 16 步、教练 12 关、实验 5 项、自测 6 题。实验勾选键：`te-lab-checks-music`。
- 文底是音乐课长文（中/英），锚点例如 `#article-next-note`。

音乐教材页顺序：music-is-sequence, notes-vs-waveform, audio-codec, condition, next-note, attention-motif, rhythm-position, temperature-sampling, long-range, read-piano-roll, musicgen-path, diffusion-music, experiment-temp, experiment-condition, myths, further-reading。

必做实验：温度 0.2/0.8/1.4 各生成约 8 个音；Top-k 对照；改一个条件（如小调改大调）；看主题重复时的注意力；对照音符 / 音频 token / 扩散谱图。


## 第四门课：微调

文字课是冻结模型的下一个词推理。微调课在本机 Python 服务里改权重，让续写跟着小语料走。主按钮仍是「推进一步」，用来讲解训练的一步；开训、暂停、对照续写在工作室。浏览器不装大模型，也不把 LoRA 接回文字课的 ONNX 桑基图。

教材共 22 页，仍是六层结构，放在顶栏「书库」里，需要时再打开，不是这门课的大门。工作室五块：数据台、方法与参数、训练监控、对照游乐场、实验档案。默认推荐 LoRA（r=16, alpha=32），可换冻结层或全量。训练器在 `finetune-lab/`，默认端口 8787。服务未启动时，教材和自测仍可用。

示例口吻包只有笔记、短诗和技术小段子。模型会跟着你喂的文本走，只做自己的学习实验，不要拿去骚扰别人。
