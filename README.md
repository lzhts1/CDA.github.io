# CDA · 四个世界，一份记忆

[打开演示](https://lzhts1.github.io/CDA.github.io/)

从世界 A 开始，查看 CDA 实际选择的操作、逐字呈现的观察，以及持续维护的规则表。依次进入 B、C、D，观察规则的新增、修订与退役。完成后可切换世界、回看各轮记录。

默认使用一次已完成探索的 112 轮记录（DeepSeek V4 Pro），不需要后端。四世界在 ServiceNow 的独立实验表上运行，业务逻辑来自 [World of Workflows](https://github.com/Skyfall-Research/world-of-workflows) 的受控移植。数据是模型当次实际维护的认识及观察摘要。

界面采用 React、Tailwind 与官方 [shadcn/ui](https://ui.shadcn.com/) 组件，支持桌面和手机。

实时探索入口连接本机 CDA 工程服务 `http://127.0.0.1:8767/`。在完整工程终端运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_exploration.ps1
```

模型可选 DeepSeek V4.1 Flash 1017 / V4 Pro，同一会话使用同一模型。模型与 ServiceNow 凭据留在本地后端，公开站点不包含密钥。

网页为 `index.html` 和 `assets/` 下带内容哈希的 JS、CSS；当前数据为 `data/exploration.json`。旧页面资源和 `data/demo.json` 为保留档案。

本仓库可通过静态 HTTP 服务预览回放。在完整 CDA 工程中更新：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_frontend.ps1 -Install
.\.venv\Scripts\python.exe -B scripts\export_exploration.py --site-dir .deploy\github-pages
```

已有依赖时省略 `-Install`。构建脚本将依赖、缓存、配置与临时文件留在 E 盘。

GitHub Pages 从 `main` 分支根目录发布。WoW 使用 MIT 许可，见 [WoW-LICENSE](WoW-LICENSE)；shadcn/ui 的 MIT 许可见 [shadcn-LICENSE](third_party/shadcn-LICENSE.txt)。
