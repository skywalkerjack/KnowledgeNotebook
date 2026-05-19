# 知识笔记网站

一个纯静态的知识笔记阅读网站。网站打开时会遍历 GitHub 仓库里的 Markdown 笔记，把 `content` 目录下的一级文件夹作为分类，把分类里的 `.md` 文件作为文章，并以适合阅读的样式展示出来。

当前默认读取的笔记仓库是：

```txt
https://github.com/skywalkerjack/KnowledgeNotebook
```

## 功能特点

- 纯静态网站，只需要 `index.html`、`style.css`、`app.js`。
- 每次打开页面都会读取 GitHub 仓库目录，展示最新笔记列表。
- 笔记按 `content/分类/笔记.md` 自动分组。
- 支持中文分类名和中文文件名。
- 支持搜索分类和笔记标题。
- 手机端目录默认折叠，方便直接阅读正文。
- Markdown 会渲染为阅读友好的正文样式。
- 笔记正文读取带缓存和备用来源，减少 GitHub raw 访问不稳定带来的卡顿。

## 笔记仓库结构

笔记仓库需要保持下面这种结构：

```txt
KnowledgeNotebook/
└─ content/
   ├─ 财经/
   │  ├─ 钱凭什么流向你.md
   │  └─ 穷是因为活该吗.md
   ├─ 科技/
   │  └─ AI基础知识.md
   └─ 教育/
      └─ 学习方法.md
```

规则：

- `content` 是笔记根目录。
- `content` 下的一级目录会显示为网站分类。
- 每个分类目录下的 `.md` 文件会显示为笔记。
- 当前版本只展示 `content/分类/笔记.md` 这一层级，更深层目录不会显示。
- 仓库需要是公开仓库，否则纯前端网页无法安全读取内容。

## 本地预览

最简单的方式是直接双击打开 `index.html`。

如果浏览器限制本地文件访问，推荐用 Node.js 启动一个静态服务：

```bash
npx serve .
```

或者使用任意静态文件服务器打开项目目录即可。

打开页面后，网站会自动读取 GitHub 仓库目录。点击目录里的笔记标题，就会加载对应 Markdown 正文。

## 修改笔记内容

笔记内容不需要放在这个网站项目里维护。你只需要在 GitHub 笔记仓库中新增、删除或修改 Markdown 文件：

```txt
content/财经/新的财经笔记.md
content/科技/新的科技笔记.md
```

更新仓库后，重新打开网站或点击刷新按钮，网站会重新遍历仓库目录。

如果只是修改某篇笔记正文，文件内容变化后 GitHub 的文件 `sha` 会变化，网站会自动读取新版本，不会一直使用旧缓存。

## 配置自己的仓库

如果要换成其他 GitHub 仓库，修改 [app.js](./app.js) 顶部配置：

```js
const REPO_OWNER = "skywalkerjack";
const REPO_NAME = "KnowledgeNotebook";
const BRANCH = "main";
const NOTE_ROOT = "content";
```

字段说明：

- `REPO_OWNER`：GitHub 用户名或组织名。
- `REPO_NAME`：仓库名。
- `BRANCH`：读取的分支，默认是 `main`。
- `NOTE_ROOT`：笔记根目录，默认是 `content`。

例如仓库地址是：

```txt
https://github.com/example/my-notes
```

则配置为：

```js
const REPO_OWNER = "example";
const REPO_NAME = "my-notes";
const BRANCH = "main";
const NOTE_ROOT = "content";
```

## 部署到 GitHub Pages

1. 新建一个网站仓库，例如 `knowledge-note-site`。
2. 上传 `index.html`、`style.css`、`app.js` 和 `README.md`。
3. 打开仓库的 `Settings`。
4. 进入 `Pages`。
5. 在 `Build and deployment` 中选择从分支部署。
6. 选择 `main` 分支和根目录。
7. 保存后等待 GitHub Pages 生成访问地址。

部署完成后，每次访问网站都会从配置的笔记仓库读取最新内容。

## Markdown 支持范围

当前内置了轻量 Markdown 渲染逻辑，支持常见笔记格式：

- 标题：`#`、`##`、`###`、`####`
- 段落
- 无序列表和有序列表
- 引用块
- 代码块和行内代码
- 表格
- 链接
- 加粗和斜体

为安全起见，Markdown 中的原始 HTML 会被转义，不会直接插入页面执行。

## 访问速度优化说明

点击笔记时，网站会按以下顺序读取正文：

1. 浏览器内存缓存。
2. 浏览器 `localStorage` 缓存。
3. GitHub Blob API。
4. jsDelivr CDN。
5. GitHub raw 链接。

这样做是因为 `raw.githubusercontent.com` 在部分网络环境下可能较慢或不稳定。第一次打开某篇笔记仍然依赖网络，但成功读取一次后，再次打开同一版本会更快。

缓存键使用 GitHub 文件 `sha`。当你修改笔记并提交到 GitHub 后，文件 `sha` 会变化，网站会自动读取新内容。

## 常见问题

### 为什么有时笔记点开很慢？

因为笔记正文来自 GitHub。网络到 GitHub 或 CDN 不稳定时，首次读取会变慢。网站已经内置缓存和多个备用读取来源，但第一次打开新笔记仍然需要等待网络。

### 为什么新增笔记后页面没立刻出现？

请确认：

- 新文件已经提交并推送到 GitHub。
- 文件路径符合 `content/分类/文件名.md`。
- 仓库是公开仓库。
- 页面已经刷新，或点击了网站里的刷新按钮。

### 为什么私有仓库不能直接使用？

纯静态网页不能安全保存 GitHub Token。如果要读取私有仓库，需要增加后端服务或代理接口，由后端安全地访问 GitHub。

### 为什么更深层目录没有显示？

当前版本只读取一层分类，即：

```txt
content/分类/笔记.md
```

如果要支持多级目录，需要调整 `app.js` 中的目录解析逻辑和前端目录展示方式。

## 项目文件说明

```txt
知识笔记网站/
├─ index.html   # 页面结构
├─ style.css    # 页面样式和移动端目录折叠
├─ app.js       # GitHub 读取、搜索、Markdown 渲染和缓存逻辑
└─ README.md    # 项目教程
```

