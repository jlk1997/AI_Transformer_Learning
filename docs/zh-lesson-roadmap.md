# 中文课程路线图（更新）

详见 **[zh-paper-curriculum.md](./zh-paper-curriculum.md)**（论文 LO1–LO6 ↔ 20 步书本 ↔ 界面模块）。

教学模块已经做进产品，不必先打开本文件。本文件是对照手册，不是产品大门。

## 怎么用
1. 底部 **入门教练条** 走完短路。教材在顶栏「书库」里，需要时再打开，不会在最后一关自动弹出。迷路可点「我迷路了」。
2. 左下角的 **「学习工作台」** 按钮：看「学习路径」，做「必做实验」，查「术语表」，用「关键自测」检验 QKV / 掩码 / 温度（无分数）。
3. 顶栏 **「书库」** 里有 20 步教材，深讲；每页六段结构。工作台和书库可以一起开。教材是书库，不是入门大门。
4. 做温度 0.2/1.0/1.5、top-k/top-p、换输入看注意力、打开三处放大镜，最后合上书库复述流水线。
5. 向下滚动阅读中文长文（可切英文原文），再对照论文设计第 6 节，复述「下一个词概率从哪来」。

## 书本 20 步 id 顺序
1. what-is-transformer
2. how-transformers-work
3. transformer-architecture
4. embedding
5. token-embedding
6. positional-encoding
7. blocks
8. self-attention
9. qkv
10. multi-head
11. masked-self-attention
12. output-concatenation
13. mlp
14. output-logit
15. output-probabilities
16. temperature
17. sampling
18. residual
19. layer-normalization
20. dropout（含「学完变专家」清单）


## 怎么切换到图片课或音乐课
1. 顶部中间（应用名右侧）有 **文字 / 图片 / 音乐** 课轨开关。默认是文字。
2. 第一次切到图片或音乐，先读对照说明，再点「开始看图」或「开始看谱」。
3. 图片课主按钮是「再去噪一步」；音乐课主按钮是「生成下一个音符」。
4. 教练条、顶栏「书库」、左下角「学习工作台」按钮会换成对应课轨的内容。文底长文也会换。
5. 语言切换仍在教练条上（中文 / EN）。

## 图片课教材 18 步 id 顺序
1. image-is-a-process
2. two-routes
3. prompt-as-condition
4. why-latent
5. noise-and-timesteps
6. denoise-one-step
7. scheduler
8. cfg
9. seed
10. vae-decode
11. unet-dit
12. image-tokens
13. cross-attention
14. failure-cases
15. experiment-cfg
16. experiment-steps
17. myths
18. further-reading

## 音乐课教材 16 步 id 顺序
1. music-is-sequence
2. notes-vs-waveform
3. audio-codec
4. condition
5. next-note
6. attention-motif
7. rhythm-position
8. temperature-sampling
9. long-range
10. read-piano-roll
11. musicgen-path
12. diffusion-music
13. experiment-temp
14. experiment-condition
15. myths
16. further-reading


## 微调课路径

1. 对照屏：冻结推理 vs 改权重。
2. 需要时再点顶栏「书库」翻 22 步教材。教材不是这门课的大门。
3. 数据台准备 80–300 条语料，预览分词，留下验证集。
4. 先存下微调前的续写，再用推荐配方开训（需本机 8787 服务）。
5. 同一批提示词对照前后，再试语料外提示、过拟合、只改一个旋钮、温度 0.2/0.8、三种方法比较。
6. 实验勾选存在 `te-lab-checks-finetune`，不与其他课串用。自测不记分。
