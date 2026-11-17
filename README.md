# 蚁算Transformer

看见 Transformer 怎么猜下一个词。这是一间开在你自己电脑上的教室，不用注册账号。教室里有四门可以动手的课：

- **文字**：看见模型怎样一步步猜下一个词
- **图像**：看见图像是怎样一步步生成的
- **音乐**：看见音乐是怎样一步步生成的
- **微调**：在本机做一个小的 GPT-2 学习实验

本机教学服务和课堂画面都在这台电脑上运行，不会把课堂训练放到浏览器里的冻结模型中去。

## 怎么开始上课

1. 只需准备一次：安装 Python 3.11 或更高版本，以及 Node.js 20 或更高版本。
2. 双击项目文件夹里的 **启动帮手**（`启动帮手.bat`，也可以用 `start-classroom.cmd`）。
3. 在浏览器中打开 http://127.0.0.1:5173

启动帮手会检查课堂是不是已经在运行。已经打开的服务会保持原样，不会再开一份。如果还缺 Python 或 Node.js，它会用白话告诉你。

第一次使用前，如果课堂依赖还没装好，需要在项目文件夹里运行一次 `npm install`；本机教学服务的 Python 依赖在 `finetune-lab/requirements.txt`。这两步可以请会安装的人帮忙，启动帮手本身不做复杂安装向导。

## 这间教室从哪里来

蚁算Transformer 在 [Transformer Explainer](http://poloclub.github.io/transformer-explainer) 的基础上，做成了可动手的本机四门课教室。原作由 Georgia Institute of Technology 的 Polo Club 团队开发，线上演示见 http://poloclub.github.io/transformer-explainer ，演示视频见 https://youtu.be/TFUc41G2ikY 。

研究论文：[Transformer Explainer: Learning LLM Transformers with Interactive Visual Explanation and Experimentation](https://dl.acm.org/doi/10.1145/3772318.3791725)（doi:10.1145/3772318.3791725）。Aeree Cho, Grace C. Kim, Alexander Karpekov, Seongmin Lee, Alec Helbling, Benjamin Hoover, Zijie J. Wang, Minsuk Kahng, Duen Horng Chau. *Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems.*

[![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)
[![arxiv badge](https://img.shields.io/badge/arXiv-2408.04619-red)](https://arxiv.org/abs/2408.04619)

## 给开发者

如果要自己用命令启动课堂画面：

```bash
npm install
npm run dev
```

然后在浏览器中打开 http://127.0.0.1:5173 。日常上课请优先双击「启动帮手」；它会同时照看课堂画面和本机教学服务。`finetune-lab/start.bat` 也会转到同一个帮手。

本机教学服务监听本机端口，前端通过 `/tutor-api` 与 `/finetune-api` 访问。不要向 `/train/start` 发送请求，除非你正在微调课里亲自开训。

## Credits

Transformer Explainer was created by <a href="https://aereeeee.github.io/" target="_blank">Aeree Cho</a>, <a href="https://www.linkedin.com/in/chaeyeonggracekim/" target="_blank">Grace C. Kim</a>, <a href="https://alexkarpekov.com/" target="_blank">Alexander Karpekov</a>, <a href="https://alechelbling.com/" target="_blank">Alec Helbling</a>, <a href="https://zijie.wang/" target="_blank">Jay Wang</a>, <a href="https://seongmin.xyz/" target="_blank">Seongmin Lee</a>, <a href="https://bhoov.com/" target="_blank">Benjamin Hoover</a>, and <a href="https://poloclub.github.io/polochau/" target="_blank">Polo Chau</a> at the Georgia Institute of Technology.

## Citation

```bibTeX
@inproceedings{cho2026transformer,
  title={Transformer Explainer: Learning LLM Transformers with Interactive Visual Explanation and Experimentation},
  author={Cho, Aeree and Kim, Grace C and Karpekov, Alexander and Lee, Seongmin and Helbling, Alec and Hoover, Benjamin and Wang, Zijie J and Kahng, Minsuk and Chau, Duen Horng},
  booktitle={Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems},
  pages={1--21},
  year={2026}
}
```

## License

The software is available under the [MIT License](https://github.com/poloclub/transformer-explainer/blob/main/LICENSE).

## Contact

If you have any questions, feel free to [open an issue](https://github.com/poloclub/transformer-explainer/issues/new/choose) or contact [Aeree Cho](https://aereeeee.github.io/) or any of the contributors listed above.

## More AI explainers to check out

- [**Diffusion Explainer**](https://poloclub.github.io/diffusion-explainer) for learning how Stable Diffusion transforms text prompt into image
- [**CNN Explainer**](https://poloclub.github.io/cnn-explainer)
- [**GAN Lab**](https://poloclub.github.io/ganlab) for playing with Generative Adversarial Networks in browser
