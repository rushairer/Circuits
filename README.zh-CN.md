# Circuits

[English](README.md) · [架构](docs/ARCHITECTURE.md) · [路线图](docs/ROADMAP.md)

Circuits 是独立开源的浏览器电路设计工作台，使用 **TypeScript + Vite** 开发。长期目标是对标 Tinkercad Circuits 的功能体验，而非复制 Autodesk 专有源码、商标或素材。

> **当前 v0.3.0-alpha.2 是实验性原型，不是已完成的 1:1 复刻。** 无 Arduino 指令执行能力，不是通用 SPICE 仿真器。

## 已实现

- 12 类自绘 SVG 元件：电池、电阻、LED、面包板、Arduino Uno、拨动开关、按钮开关、电位器、电容、蜂鸣器、万用表、舵机
- 画布添加/拖动/旋转/删除、Shift 多选、框选、整体移动、批量旋转与删除、按引脚接线、导线选择与颜色编辑、拖拽重新连接导线端点、可保存的导线折点与网格吸附
- 撤销重做、多工程本地管理（新建、复制、切换、删除）、旧草稿自动迁移、JSON 工程导入导出、缩放与 Arduino 代码文本编辑
- 面包板五孔连通组、电源轨分段及两侧绝缘分隔；电阻与 LED 引脚靠近插孔自动吸附、建立接触，移动后会重新校准接触
- 实验性 MNA 直流求解：**一节电池 + 一只 LED + 电阻网络**（含并联），支持理想双端拨动开关闭合/断开
- 工程文件结构校验及单元测试

**重要限制：** LED 用固定 2V 导通压降近似。可放置的其余元件大多只有可视化与接线能力，不能声称已接入仿真；没有 MCU 运行时、暂态仿真、真实仪表或波形。

## 运行与验证

需要 Node.js 22.12+。

```sh
npm install
npm run typecheck
npm test
npm run test:e2e # 首次执行前安装 Chromium、Firefox 和 WebKit 浏览器
npm run build
npm run dev
```

## CI / GitHub Pages

每次提交到 `main` 会自动执行 TypeScript 检查、单元测试和 Vite 构建，并将经过验证的产物保存为 `circuits-dist`。发布到 GitHub Pages 还需要仓库管理员**首次启用 Pages**：

1. 打开 [Settings → Pages](https://github.com/rushairer/Circuits/settings/pages)。
2. 在 Build and deployment 的 Source 选择 **GitHub Actions**。
3. 打开 [Actions](https://github.com/rushairer/Circuits/actions/workflows/ci.yml)，运行 `Quality & Pages` 工作流（或推送新提交）。
4. 只有部署任务成功后，https://rushairer.github.io/Circuits/ 才可视为上线。

## 下一阶段

按 [ROADMAP](docs/ROADMAP.md) 先完善面包板插孔交互、导线编辑、工程模型版本化与端到端测试，再推进真实元件模型、仪表和 Arduino 模拟运行时。项目与 Autodesk / Tinkercad 无关联，代码采用 MIT 许可证。

### 键盘操作

Tab 聚焦元件，Enter / 空格选择当前元件，Shift 组合多选；Ctrl/Cmd+A 全选，方向键移动选中元件，Alt+方向键微移，Delete 删除，Ctrl/Cmd+Z 撤销。

GitHub Actions 同时测试 Chromium、Firefox、WebKit。Linux WebKit 测试不等同于 macOS/iOS 上的真实 Safari 验收。

### 画布导航

滚轮以鼠标光标为中心缩放；按住空格左键拖动或按鼠标中键拖动可平移画布。底部 +/− 以可视区域中心缩放，重置只恢复视角，不更改电路。

### 实验性非线性直流分析

点击工具栏的「模型：固定 2V」切换到「模型：非线性 DC（实验）」，再点击开始仿真，可观察多只 LED 串并联支路的独立电流、过流提示，以及万用表正负表笔之间的有符号直流电压差。未连接表笔会显示「未连接」而不是伪造 0 V。

该模型仅支持单个理想电池、电阻网络、理想开关和指数近似 LED；LED 曲线只在约 2 V / 20 mA 附近用于教学，不考虑器件温升、击穿或参数离散，不是 SPICE。原始固定 2V 模式保留为默认选项，确保旧工程的结果预期不被悄悄改变。

点击工具栏「示例电路」可以分别创建基础 LED、双 LED 并联、双 LED 串联、9V 万用表四类独立工程，不覆盖当前设计。打开示例时自动选择实验性非线性 DC 模式，再点击「开始仿真」查看读数。
