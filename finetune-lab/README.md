# 微调课训练器（finetune-lab）

这是给「微调」课用的本机 Python 服务。它不在浏览器里训练，也不改另外三门课。

前端通过 Vite 代理 `/finetune-api` 访问本机教学服务。服务没开时，教材、自测和数据台仍然可用，只是不能开训或对照续写。

日常上课请回到项目文件夹，双击「启动帮手」。它会同时打开课堂画面和本机教学服务。

## 本机环境

- 推荐 Python 3.11 或更高版本
- 显卡：NVIDIA 消费卡（例如 RTX 4070），驱动支持 CUDA 12.x 即可
- 不要用把大模型塞进浏览器的方式来做这一课

## 安装

在 `finetune-lab` 文件夹里，用你已经安装好的 Python：

```bat
python -m pip install torch --index-url https://download.pytorch.org/whl/cu124
python -m pip install -r requirements.txt
```

如果要用特定版本的 Python，把上面的 `python` 换成那个解释器。先装带 CUDA 的 PyTorch，再装其余依赖。

第一次开训会从 Hugging Face 下载 GPT-2 small（自由模式可选 medium）。请保证网络可用。权重缓存在本机 Hugging Face 缓存目录。

## 启动

请双击项目文件夹里的「启动帮手」。也可以运行本目录的 `start.bat`，它会转到同一个帮手。

浏览器打开 http://127.0.0.1:5173/ ，切到「微调」，看工作室顶部是否显示「训练器已连接」。然后可用「极短跑（2 步）」确认循环能启动，不必一上来做完整长训。

## 接口摘要

- `GET /health` 设备与依赖
- `POST /tokenize` 分词预览
- `POST /train/start` 开始或从检查点恢复（body 可带 `maxSteps`）
- `POST /train/pause` `resume` `stop`
- `GET /train/events?runId=` SSE 推送损失、日志、显存
- `POST /generate` 同一批提示词，基座 vs 微调后
- `GET /runs` 档案
- `GET /runs/{id}/export` 下载适配器 zip

跑次写在 `finetune-lab/runs/` 下。

## 推荐配方（与课程界面一致）

LoRA、r=16、alpha=32、注意力投影层、学习率 2e-4、预热 50、余弦调度、3 个 epoch、批次 2、累积 4、序列长度 512、fp16、梯度裁剪 1.0、种子 42、验证损失连续 2 次不再下降则早停、训练/验证约 9:1。

只做自己的学习实验。模型会跟着你喂的文本走，不要拿去骚扰别人。
