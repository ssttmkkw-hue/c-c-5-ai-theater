# AI Theater / 演戏

An experiment: paste a play, and a small company of procedural actors performs it on a 3D stage. You sit in the house — there is a figure in the front row marked 你 / YOU — and watch. v1 is a local, offline toy. The gestures are still stiff, and the animation is meant to keep changing.

一个试验：把剧本贴进去，几个程序生成的演员在三维小剧场里把它演出来。你坐在台下，前排有一个标着「你」的小人。第一版只在本地、离线运行。动作还生硬，动画会继续改。

This is not affiliated with any theatre, publisher, or model vendor. The Shakespeare excerpts are public domain. The Chinese subtitle lines shipped with those excerpts are plain renderings written for this project, not a published translation.

本项目与任何剧院、出版社或模型厂商都没有从属关系。《哈姆雷特》选段为公有领域。随选段附上的中文字幕是为本项目写的白话转述，不是已出版译本。

There is no live AI backend in this version. Choosing “AI parser” in the panel falls back to the rule parser and says so. A one-line premise does not call a model either: it becomes a local two-hander sketch and is labeled as such.

这一版没有在线的 AI 后端。面板里选「AI 解析」时，会退回规则解析，并在解析记录里说明。一句话剧情也不会去调模型：它会变成一段本地双人草稿，并标明这一点。

## Run / 运行

From the repository root, serve the files over HTTP. ES modules do not run from a `file://` URL.

在仓库根目录用 HTTP 把文件提供出来。ES module 不能用 `file://` 打开。

```bash
python3 -m http.server 8877
```

Open `http://localhost:8877`. Port 8877 is the one this project uses; leave 5173, 8765, and 8000 alone if something else is already bound there.

然后打开 `http://localhost:8877`。本项目用 8877。若本机已占用 5173、8765 或 8000，不要去抢那些端口。

The first visit opens a short note. Dismiss it with the button or Esc. The choice is remembered in `localStorage`.

第一次打开会有一段说明。用按钮或 Esc 关掉。这个选择记在 `localStorage` 里。

## Speed / Live / 速度与当场开演

This exists so a show can start in seconds, not after a rendered video or a finished comic. The audience types a premise or pastes a script, the curtain opens immediately, and the first playable beat begins as soon as the parser has it. Later beats can still be arriving. A future server-side model can stream the same events into the director; the browser still never sees an API key.

做这个，是为了让一场戏在几秒内开始，而不是等一段视频或一本漫画渲染完。观众写下一句剧情或贴上一整场剧本，大幕马上打开，解析器拿到第一拍能演的内容就开始。后面的拍可以还在路上。以后服务器上的模型也可以把同样的事件流推进导演；浏览器里仍然不会出现 API 密钥。

### Live request / 当场开演

The box at the top of the panel is the front door: “写一段剧本或一句话剧情 / Paste a script or a one-line premise”, then **开演 / Perform now**.

面板最上面就是入口：「写一段剧本或一句话剧情 / Paste a script or a one-line premise」，然后按 **开演 / Perform now**。

- A short note with no `HAMLET.` / `Ophelia:` cues is treated as a premise. v1 weaves it into a tiny original two-hander and labels it “local instant sketch, not an AI dramaturg (coming later)”. Conflict, love, and parting words pick different sketches. The actors do not mention the audience. No paid API.
- 没有 `HAMLET.` / `Ophelia:` 这种角色提示的短句，会当成剧情。第一版把它编进一段原创双人草稿，并写明「本地即兴草稿，不是 AI 编剧（以后再做）」。冲突、爱、离别会换成不同的草稿。演员不提起观众。不调用付费接口。
- A real script uses the streaming rule parser. Samples and the JSON preview stay where they were.
- 真正的剧本走流式规则解析。示例和 JSON 预览还在原来的地方。
- While it runs, a status line reads “解析中…已开演第 1 句 / Parsing… beat 1 already on stage”. If the director runs out of beats before `end`, the actors hold a small “waiting for the cue” glance.
- 演出时会有一行状态：「解析中…已开演第 1 句 / Parsing… beat 1 already on stage」。导演把手头的拍演完、流还没结束时，演员会稍稍看向侧幕，像在等提示。

### Stream events / 流式事件

Full Performance JSON (above) is still what you save, load, and download. The live path speaks one JSON object per step. NDJSON is one object per line. Short beat aliases are accepted; the parser emits the long names.

上面的完整 Performance JSON 仍是保存、载入和下载的格式。当场开演走一步一个 JSON 对象。NDJSON 是一行一个。拍上的短字段名可以读入；解析器写出的是长名字。

```json
{ "type": "meta", "title": "Instant sketch", "locale": "en", "characters": [] }
{ "type": "character", "id": "player", "name": "Player", "costume": "traveler" }
{ "type": "beat", "sceneId": "sketch", "speaker": "player", "line": "…", "emotion": "emphatic", "gesture": "point" }
{ "type": "scene-end", "sceneId": "sketch" }
{ "type": "warning", "message": "local-sketch" }
{ "type": "end" }
```

| Alias / 短名 | Field / 字段 |
| --- | --- |
| `sid` | `sceneId` |
| `sp` | `speaker` |
| `ln` | `line` |
| `zh` | `lineZh` |
| `em` | `emotion` |
| `g` | `gesture` |
| `mv` | `moveTo` |
| `lk` | `lookAt` |
| `en` | `enterFrom` |
| `ex` | `exitTo` |
| `p` | `pauseMs` |
| `k` | `kind` |

`performanceToEvents` / `eventsToPerformance` / `eventsToNdjson` / `ndjsonToEvents` convert the two forms. `appendBeat(performance, beat)` adds one beat to a show that is still open. A late `character` event can spawn an actor before their entrance. A beat whose speaker was never introduced becomes a generic courtier instead of stalling the show.

`performanceToEvents` / `eventsToPerformance` / `eventsToNdjson` / `ndjsonToEvents` 在两种格式之间转换。`appendBeat(performance, beat)` 往一场还没结束的演出里加一拍。晚到的 `character` 事件可以在上场前先把演员造出来。某一拍的说话人如果从没介绍过，会自动变成一个普通侍从，而不是把整场停住。

### Directing / 导演

A bar under the subtitle works during the show. `window.__theater.intervene(action)` is the same set of hooks.

字幕下面有一条导演栏，演出时就能用。`window.__theater.intervene(action)` 是同一组钩子。

| Action / 动作 | Now / 现在 | Later / 以后 |
| --- | --- | --- |
| `{ type: 'replay' }` | Replay the current beat (or the last one, if you are between cues). / 立刻重演当前这一拍（如果正在等下一拍，就重演刚才那句）。 | |
| `{ type: 'angrier', scope: 'now' \| 'scene' }` | This speaker goes angry / emphatic for this beat and the next few (`scene` keeps it for the scene). Pitch and rate nudge up if the line is still being spoken. / 当前说话的人这一拍和后面几拍变得更怒、更重（`scene` 则维持到这场结束）。台词还没说完时，音高和语速会稍抬一点。 | |
| `{ type: 'faster' }` / `{ type: 'hold' }` | Speed up, or pause. / 加快，或停住。 | |
| `{ type: 'ending', note? }` | Actors glance toward the wings. A subtitle says a new ending will be written here, and a short **placeholder** couplet is appended. The button is dashed and marked “later”. / 演员看向侧幕。字幕写着新的结尾稍候，并接上两句**标明是占位**的收场。按钮是虚线，标着「稍后」。 | A streaming dramaturg can push replacement beats into `pushBeat` / `pushEvent` after this hook. v1 does not invent that scene with a model. / 以后的流式编剧可以在这个钩子之后用 `pushBeat` / `pushEvent` 把替换的拍推上来。第一版不会用模型现编那场戏。 |

### Honest limits / 老实说做不到的

- The rule parser is instant and shallow. It is not a dramaturg.
- 规则解析很快，也很浅。它不是戏剧构作。
- Premise sketches are local templates. The premise is quoted; the other lines are original filler, not a model’s scene.
- 一句话剧情是本地模板。你的那句话会被引到台词里，其余是原创的填充，不是模型写的一场戏。
- No live LLM runs in the browser. The AI parser’s `parseStream` is the seam: NDJSON or SSE from a backend you configure, otherwise one warning and the rule stream.
- 浏览器里没有现场的大模型。AI 解析器的 `parseStream` 是接缝：你自己配置的后端可以回 NDJSON 或 SSE，否则只留下一条警告，然后用规则流。

`getState()` adds `streaming`, `pendingBeats`, `streamEnded`, `timeToFirstBeatMs`, `lastIntervention`, and `holding`. `timeToFirstBeatMs` is how long it took from opening the live show to the first beat actually starting. `liveStart(text)` resolves at that moment, not when the curtain comes down. `parseStream`, `pushEvent`, and `pushBeat` are on `window.__theater` for a local test.

`getState()` 额外有 `streaming`、`pendingBeats`、`streamEnded`、`timeToFirstBeatMs`、`lastIntervention` 和 `holding`。`timeToFirstBeatMs` 是从打开这场直播到第一拍真正开始的毫秒数。`liveStart(text)` 在那个时刻 resolve，而不是等大幕落下。`parseStream`、`pushEvent`、`pushBeat` 也在 `window.__theater` 上，给本地测试用。

## Paste a script / 粘贴剧本

1. Paste text into the script box, or pick a sample and press **Load and play / 载入并演出**.
2. **Parse / 解析** turns the text into Performance JSON and shows it under the disclosure, including warnings.
3. **Play / 演出** parses if nothing is loaded yet, then starts the show. Space does the same when focus is not in a field. Space again pauses.
4. You can also paste a Performance JSON object. If it has `scenes` or a top-level `beats` array, it is staged directly. A broken `{...` falls back to the rule parser and records `json-invalid`.
5. **Download JSON / 下载 JSON** saves the current performance. **Import / 导入** reads a JSON file back in.

1. 把文本贴进剧本框，或选一个示例再按 **载入并演出**。
2. **解析** 会把它变成 Performance JSON，并在折叠栏里连同警告一起显示。
3. **演出** 在还没有装入内容时先解析，然后开演。焦点不在输入框里时，空格也是开演或暂停。
4. 也可以直接贴 Performance JSON。只要有 `scenes`，或顶层有 `beats` 数组，就会按演出数据上台。看起来像 JSON 但解析失败时，会按剧本来读，并记下 `json-invalid`。
5. **下载 JSON** 保存当前演出。**导入** 把 JSON 文件读回来。

A minimal two-hander the rule parser understands:

规则解析器能认出的最短双人剧：

```text
Enter ALICE.

ALICE.
The lantern is lit.

Enter BOB.

BOB.
Then we cross the yard.
```

Speaker cues look like `HAMLET.` or `Ophelia:`. Stage directions can sit on their own line in parentheses, brackets, `_underscores_`, or `*asterisks*`.

角色提示写成 `HAMLET.` 或 `Ophelia:`。舞台指示可以单独成行，用圆括号、方括号、`_下划线_` 或 `*星号*`。

## Performance JSON / 演出数据

Version 1. The normalizer fills defaults and never throws on a messy object; unknown values become warnings and a safe fallback. Mark coordinates are meters: `x` stage right, `y` up from the stage floor, `z` upstage. The runtime stands actors on the raised stage. `"audience"` is not a point; the director aims it at a seat in the house.

第一版。规范化会补上缺省值，不会因为一份乱的对象抛错；不认识的值变成警告，并退回一个安全的默认。标记坐标单位是米：`x` 向舞台右侧，`y` 从台面向上，`z` 向上场。运行时会把演员放到升高的台面上。`"audience"` 不是一个点，导演会把它对准观众席里的一个座位。

| Field | Meaning / 含义 |
| --- | --- |
| `version` | Always `1`. / 固定为 `1`。 |
| `title` | Show title on the proscenium sign. / 台口匾上的剧名。 |
| `source` | Credit line. Shakespeare samples use a public-domain credit. / 出处。莎士比亚示例标明公有领域。 |
| `locale` | `"en"` or `"zh"`. / `"en"` 或 `"zh"`。 |
| `note` | Optional free text. / 可选的一句说明。 |
| `characters[]` | `id`, `name`, `aliases[]`, `color` (`#rgb` or `#rrggbb`), `costume`, `skin`, `hair`, `voice`. |
| `voice` | `lang` (BCP-47, default `en-GB`), `pitch` (0.3–2), `rate` (0.6–1.6). Used only if speech is on. / 仅在朗读打开时使用。 |
| `costume` | `prince`, `maiden`, `king`, `queen`, `ghost`, `courtier`, `traveler`, `visitor`. Anything else becomes `courtier` and warns. / 其他值会变成 `courtier` 并警告。 |
| `marks` | `cs`, `dl`, `dr`, `ul`, `ur`, `sl`, `sr` as `[x, y, z]`, plus `audience: "audience"`. |
| `scenes[]` | `id`, `name`, `beats[]`. |
| `beats[]` | One breath, entrance, exit, or hold. See below. / 一口台词、一次上下场，或一次停顿。见下。 |
| `warnings` | Strings collected by the parser or the normalizer. / 解析器或规范化记下的字符串。 |

Beat fields / 拍的字段:

| Field | Meaning / 含义 |
| --- | --- |
| `id` | Stable id. Default `b1`, `b2`, … / 缺省为 `b1`、`b2`…… |
| `kind` | `speech`, `action`, or `pause`. Inferred when omitted. / 缺省时按有没有台词来推断。 |
| `speaker` | Character `id`, or `null` for a silent beat. / 角色 `id`，纯停顿则为 `null`。 |
| `line` | Spoken text. Empty for an entrance, exit, or pause. / 台词。上下场或停顿可以为空。 |
| `lineZh` | Optional subtitle gloss. Bundled samples fill this from `src/data/translations.js` when the English line matches. / 可选中文字幕。内置示例在英文对得上时由翻译表填上。 |
| `emotion` | `neutral`, `contemplative`, `curious`, `uncertain`, `emphatic`, `angry`, `sad`, `tender`, `fearful`, `proud`, `haunted`, `joyful`. |
| `gesture` | `idle`, `talk`, `point`, `handsOnChest`, `raiseArm`, `kneel`, `turnAway`, `pace`, `bow`, `weep`, `give`, `take`, `drawSword`, `shrug`, `nod`, `shakeHead`. |
| `moveTo` | A mark id, or `null` to stay. / 标记 id，或 `null` 表示留在原地。 |
| `lookAt` | `audience`, `aside`, a character id, a mark id, or `null`. |
| `enterFrom` | `left`, `right`, or `null`. Used when the actor is still offstage. / 演员还在侧幕时从哪边上。 |
| `exitTo` | `left`, `right`, or `null`. |
| `pauseMs` | Hold after the line, or the whole beat when the line is empty. Clamped to 0–8000. / 台词之后的停顿；没有台词时就是这一拍的长度。限制在 0–8000。 |

`src/data/curated.js` is a hand-authored example of this object. It is not the output of a model.

`src/data/curated.js` 是手写的一份示例，不是模型的输出。

## Bundled samples / 内置示例

| Id | What it is / 内容 |
| --- | --- |
| `hamlet-a3s1` | *Hamlet* Act 3, Scene 1, from the soliloquy through the nunnery. Public-domain English, parsed by the rules. / 《哈姆雷特》第三幕第一场，从独白到修道院。公有领域英文，由规则解析。 |
| `hamlet-a1s5` | *Hamlet* Act 1, Scene 5, Hamlet and the Ghost. / 第一幕第五场，哈姆雷特与鬼魂。 |
| `demo` | *The Courtyard*, a short original two-hander written for this project. / 《院子》，为本项目写的原创短剧。 |
| `hamlet-a3s1-curated` | The same opening beats as 3.1, with blocking written by hand in Performance JSON. / 同样的 3.1 开头，走位是手写在 JSON 里的。 |

## Camera and controls / 机位与操作

| Input / 操作 | Result / 结果 |
| --- | --- |
| `1` or **Audience / 观众席** | A seat in the house, behind the front row. / 观众席，在前排后面。 |
| `2` or **Cinematic / 镜头** | A wider and closer series of shots that shifts on each beat. / 稍远或稍近的镜头，每一拍会换。 |
| `3` or **Free / 自由** | Orbit the stage, or move with WASD / arrows. `Q` and `E` (or Page Down / Page Up) change height. Shift moves faster. / 轨道环绕，或用 WASD / 方向键移动。`Q` 与 `E`（或 Page Down / Page Up）改变高度。按住 Shift 更快。 |
| **Sit back down / 坐回去** | Returns to the audience camera. / 回到观众席机位。 |
| Space | Play or pause, unless you are typing in a field. / 演出或暂停。正在输入时不会触发。 |
| Esc | Closes the help note, blurs a field, or folds the script panel. / 关掉说明、让输入框失焦，或收起剧本栏。 |

The transport under the subtitle can step one beat, stop, or restart. The speed menu offers `0.75`, `1`, and `1.25`. Speech uses the Web Speech API when it is available and the **Speech / 朗读** toggle is on. If the browser has no voices, the line simply holds for an estimated duration and the show continues. Missing voices are not treated as a failure.

字幕下的走带可以上一拍、下一拍、停止或重来。速度菜单是 `0.75`、`1`、`1.25`。朗读打开且浏览器提供 Web Speech 时才会出声。没有语音时，台词按估计的时长停住，然后继续。缺少语音不算失败。

**中文字幕** toggles the gloss for lines that have a `lineZh`. The panel language button switches the chrome between 中文 and English. Until you touch the subtitle checkbox, the gloss follows that language.

**中文字幕** 开关控制已有 `lineZh` 的台词。面板上的语言按钮切换界面的中文和 English。在你改过字幕复选框之前，字幕语言跟着界面语言走。

## Experiments / 试验

Each switch is stored in `localStorage` under `ai-theater-experiments`. They start on, except **Blocking marks** and **IK targets**, which start off. A saved choice still wins.

每个开关都存在 `localStorage` 的 `ai-theater-experiments` 里。默认开着，但**舞台标记**和 **IK 目标点**默认关。已经存过的选择仍然有效。

| Id | What you should see / 你会看到 |
| --- | --- |
| `idle` | Breath, weight shift, blink. / 呼吸、重心和眨眼。 |
| `lookAt` | Heads turn toward the person being addressed, with a small lag. / 头转向受话的人，带一点滞后。 |
| `lips` | Jaw and mouth while a line is spoken. / 说话时的下颌和嘴。 |
| `spotlight` | The follow spot leans toward the speaker. / 追光偏向正在说话的人。 |
| `marks` | Stage marks (`CS`, `DL`, `DR`, …) on the floor. Off until you turn it on. / 台面上的走位标记。要打开才看得到。 |
| `posture` | A posture stacked on top of the gesture for the beat's emotion. / 在手势之上，按情绪加上的体态。 |
| `audience` | The house fidgets, leans in on a soliloquy, and claps between scenes. Your own seat stays either way. / 观众席会晃、独白时探身，换场时鼓掌。你自己的座位一直在。 |
| `curtains` | The red curtain closes when the show is stopped and opens when it plays. Off, the curtain stays open. / 停止时合上红幕，演出时拉开。关掉则幕一直开着。 |
| `ikTargets` | Pink spheres on the IK hand targets. Only matters while the actor style is IK. Off by default. / IK 手的目标点。只有演员样式是 IK 时才有用。默认关。 |

## Actor styles / 演员样式

The **Actor style / 演员样式** menu swaps every on-stage body without reloading the page. The choice is kept in `localStorage` (`ai-theater-actor-style`). The same hooks are `window.__theater.setActorStyle(id)`, `getActorStyle()`, and `listActorStyles()`. `getState().actorStyle` is the current id.

**演员样式**菜单会换掉台上所有人的身体，不用整页刷新。选择记在 `localStorage`（`ai-theater-actor-style`）。同样的钩子是 `window.__theater.setActorStyle(id)`、`getActorStyle()`、`listActorStyles()`。`getState().actorStyle` 是当前的 id。

| Id | What it is / 是什么 |
| --- | --- |
| `procedural` | The jointed mannequin. Gestures crossfade, and the face has brows and pupils. Default. / 关节人偶。手势交叉淡入，脸上有眉毛和瞳孔。默认。 |
| `gltf` | Original CC0 skinned figure and clips. Loaded when selected. / 原创 CC0 蒙皮人和片段。选中才加载。 |
| `vrm` | Original CC0 VRM, loaded with `@pixiv/three-vrm@2.1.0` from esm.sh only when selected. / 原创 CC0 VRM。只有选中时才从 esm.sh 加载 `@pixiv/three-vrm@2.1.0`。 |
| `paper` | Canvas paper puppet. Original drawings. / 画布纸偶。图是现画的。 |
| `toon` | Same joints, cel shading and an outline. / 同一套关节，分色和轮廓。 |
| `ik` | Same joints, with two-bone arms reaching the gesture. / 同一套关节，双骨手臂伸向手势目标。 |

[compare.html](compare.html) (also `#compare` on the main page) stands all six in a row. Notes, licenses, and what was searched and left out: [docs/ACTOR_MODELS.md](docs/ACTOR_MODELS.md).

[compare.html](compare.html)（主页的 `#compare` 也会打开它）把六种样式排成一排。说明、许可证，以及查过但没放进来的素材：[docs/ACTOR_MODELS.md](docs/ACTOR_MODELS.md)。

A one-line premise is still labeled in the status row as a local sketch. The actors do not say that they are a sketch.

一句话剧情仍然在状态行标明是本地草稿。演员不会把「我们是草稿」说出来。

## Project structure / 目录

```text
index.html              page, import map for three@0.160.0, inline favicon
style.css
src/main.js             boot, frame loop, window.__theater
src/parse/              rule parser, AI placeholder, presets, lexicon
src/performance/        Performance JSON, director, speech timing
src/stage/              set, marks, curtains, lights
src/actors/             rig, cast, audience, styles (paper, glTF, VRM, toon, IK)
compare.html            side-by-side actor styles
assets/actors/          original CC0 glTF and VRM, plus LICENSE notes
src/camera/cameras.js   audience, cinematic, free
src/ui/                 panel and strings
src/data/               samples, subtitle glosses, curated JSON
src/runtime/live.js     shared show state (streaming, holding, speed)
src/performance/stream.js  NDJSON events ↔ Performance JSON
src/parse/scan.js       shared rule scan for full parse and live stream
src/parse/premise.js    local two-hander for a one-line premise
src/util/math.js
tools/prompt-performance.md
tools/parse-with-claude.mjs
tools/smoke-parse.mjs
```

`window.__theater` exposes `load`, `play`, `pause`, `pasteAndPlay`, `setMuted`, `setCamera`, `setExperiment`, `setActorStyle`, `getActorStyle`, `listActorStyles`, `getState`, `waitIdle`, `parseStream`, `liveStart`, `intervene`, `pushEvent`, and `pushBeat` for a local smoke test. It is not a supported public API.

`window.__theater` 提供 `load`、`play`、`pause`、`pasteAndPlay`、`setMuted`、`setCamera`、`setExperiment`、`setActorStyle`、`getActorStyle`、`listActorStyles`、`getState`、`waitIdle`、`parseStream`、`liveStart`、`intervene`、`pushEvent`、`pushBeat`，给本地冒烟测试用。这不是对外承诺的 API。

`tools/smoke-parse.mjs` checks the rule parser in Node, with no browser and no network. `tools/parse-with-claude.mjs` fills `tools/prompt-performance.md` and prints the prompt. It does **not** call `claude` unless you pass `--invoke` yourself, on a machine where that CLI is already installed. The page never runs it and never sees an API key.

`tools/smoke-parse.mjs` 在 Node 里检查规则解析器，不打开浏览器，也不联网。`tools/parse-with-claude.mjs` 会把剧本填进 `tools/prompt-performance.md` 并打印提示词。除非你自己在已经安装 Claude CLI 的机器上加上 `--invoke`，否则它**不会**调用 `claude`。网页不会运行它，也看不到任何 API 密钥。

```bash
node tools/smoke-parse.mjs
node tools/parse-with-claude.mjs path/to/script.txt
```

## Parser limitations / 解析器的限度

The rule parser is a cue-and-direction heuristic, not a dramaturg.

规则解析器只是「角色提示 + 舞台指示」的启发式，不是戏剧构作。

- Cues need a Latin-script name, either in capitals (`HAMLET.`) or in title case (`Ophelia:`). A Chinese name with no Latin cue is not detected. Ids are slugs of ASCII letters and digits, so a name that cannot be slugged becomes `actor`.
- 角色提示需要拉丁字母的名字，全大写（`HAMLET.`）或标题式（`Ophelia:`）。没有拉丁字母提示的中文名认不出来。`id` 是 ASCII 字母和数字的 slug，无法 slug 的名字会变成 `actor`。
- Long speeches are cut on sentence punctuation into beats of roughly a few dozen words. Verse line breaks are joined first.
- 长台词按句读切开，大约几十词一拍。诗行会先被拼起来。
- Blocking is a guess: one person stands center (`cs`); two people take `dl` and `dr`. Entrances come from the wings. It will not reproduce a printed prompt book.
- 走位是猜的：一个人站在中（`cs`）；两个人分站 `dl` 和 `dr`。上场从侧幕走进来。它不会还原印刷本里的调度。
- Emotions and gestures come from a small word list. A direction it does not know is kept as a warning and does not move anyone.
- 情绪和动作来自一张小词表。不认识的舞台指示只留下警告，不会因此移动人。
- “Enter” / “Exit” / “Exeunt”, “aside”, and a handful of verbs (kneel, bow, weep, pace, draw a sword, …) are the directions it acts on.
- 它会执行的指示主要是 Enter / Exit / Exeunt、aside，以及下跪、鞠躬、哭泣、踱步、拔剑等少数动词。
- The AI parser is a placeholder. With no endpoint configured it records `ai-fallback-no-backend` and uses the rules. No key is shipped, and the page does not call a paid API.
- AI 解析只是占位。没有配置端点时会记下 `ai-fallback-no-backend`，然后用规则。仓库里没有密钥，页面也不调用付费 API。

## A note on the acting / 关于表演

v1's bodies are built from boxes, capsules, and spheres. Walks, looks, and the curtain are timed procedures, not motion capture. Later passes can replace a gesture or a costume without changing the Performance JSON. Treat the current movement as a sketch that will keep evolving.

第一版的身体是盒子、胶囊和球搭的。走路、视线和大幕都是计时的程序，不是动作捕捉。以后可以换掉某个手势或某套服装，而不改 Performance JSON。把现在的动作看成还会继续长的草图。

## Roadmap / 以后

Not in this version, and not promised as a schedule:

这一版没有做，也不当成工期承诺：

- A real streaming dramaturg on the `ending` / `pushBeat` seam. The button and the hook are there; the model is not.
- 在 `ending` / `pushBeat` 这条缝上接一个真正会流式写戏的编剧。按钮和钩子在，模型不在。
- More costumes than the eight already on the procedural body.
- 比程序人偶上已有的八套服装再多一些。
- A real server-side parser, if one is ever added, would keep the key off the page and return the same Performance JSON. v1 does not include that server.
- 若以后真的加上服务器端解析，密钥会留在服务器上，返回的仍是同一份 Performance JSON。第一版不包含那台服务器。
