# Circuits

独立开源浏览器电路设计实验台，以 Tinkercad Circuits 的功能对齐为长期目标。

**当前 v0.1：原型，未达到 1:1 完整复刻。** TypeScript + Vite，GitHub Pages 自动部署。

## Quick start

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

支持元件拖放/移动/旋转、引脚接线、基础电池-电阻-LED 回路评估、简单 Arduino C++ 文本编辑、JSON 导入/导出、本地自动保存。**不支持真正的 Arduino 程序执行，也不是通用 SPICE 求解器。**

完整的后续研发计划见 [ROADMAP](docs/ROADMAP.md)。本项目与 Autodesk、Tinkercad 无隶属关系。

## Pages

推送 main 自动执行 `.github/workflows/ci.yml`。在 Settings → Pages 选择 GitHub Actions 作为发布来源。
