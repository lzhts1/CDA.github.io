# CDA · World of Workflows

交互式演示：[打开网站](https://lzhts1.github.io/CDA.github.io/)

- 查看从 20 条 WoW 记录学习得到的规则。
- 切换 DeepSeek V4.1 Flash 1017 / V4 Pro，比较三个样例的预测与 WoW 记录。
- 单步或自动回放已经完成的五步 ServiceNow 工单流程。

站点使用保存的预测和执行记录。页面文件位于 `index.html` 和 `assets/`，展示数据位于 `data/demo.json`。

## 本地预览

在本仓库目录运行 `python -m http.server 8000`，打开 `http://localhost:8000`。

## 更新

从 CDA 复现工程导出最新页面与展示数据：

```powershell
.\.venv\Scripts\python.exe -B scripts\export_pages.py --output .deploy\github-pages
git -C .deploy\github-pages add index.html assets data third_party .nojekyll
git -C .deploy\github-pages commit -m "Update CDA demo"
git -C .deploy\github-pages push origin main
```

GitHub Pages 从 `main` 分支的根目录发布。

## 数据来源

使用 [World of Workflows](https://github.com/Skyfall-Research/world-of-workflows) 的轨迹数据。对应 MIT 许可见 [third_party/WoW-LICENSE](third_party/WoW-LICENSE)。
