让侧边栏里的 iris agent 看见当前页面上的图。用户随手测过，模型说看不见，也找不到专门的读图工具。

## 现状

- 没有「读取页面里某张图」的工具。`read_page` 只给文字。
- `take_screenshot` 在 `screenshot` 分组里，要先 `load_tools`。它用 `chrome.tabs.captureVisibleTab`，返回 `{ dataUrl }`（`src/lib/automationEngine.ts`）。
- `bindAgentTools` 没有 `toModelOutput`。AI SDK 6 因此把结果当成 JSON 文本送进模型（`createToolModelOutput`：对象 → `{ type: 'json' }`）。base64 在上下文里，但是一长串文字，模型不会把它当图片看。
- 用户自己贴上的图片是另一条路：消息上的 `file` part，那些会作为图片进入模型。工具结果不会。

## AI SDK

`tool({ toModelOutput })` 可以返回 `{ type: 'content', value: [{ type: 'media', data, mediaType: 'image/png' }] }`。SDK 会把 `media` 转成 `image-data`。文档写明多模态工具结果目前是 Anthropic 和 OpenAI。

iris 用的是 `createOpenAI().chat()`，走 OpenRouter 的 chat completions。`@ai-sdk/openai` 的 chat 适配器对 `content` 类型的工具结果执行 `JSON.stringify`，放进 `role: "tool"` 的字符串。Responses API 那条路径才会把 `image-data` 写成 `input_image`。所以只加 `toModelOutput`、不改发送方式，模型仍然看不到图。

## 验收

- 模型能根据当前标签页的可见画面回答一个只靠看图才能知道的问题。回复里要有这次真实调用的证据，不能只说字符串变长了。
- 工具结果里不要再塞完整的 data URL。需要给界面留的话，用短引用，别把整张图的 base64 再写进 JSON。
- 默认截当前会话标签，不是那个隐藏的 automation tab。
- 继续走现有的 OpenRouter chat 配置。如果 chat 接口送不出图片，就改一条确实能把图片送到模型的路径，并在 issue 里写明选了哪条、为什么。
- 先做视口截图。不要顺便做「把页面上每张 img 都下载下来」。
