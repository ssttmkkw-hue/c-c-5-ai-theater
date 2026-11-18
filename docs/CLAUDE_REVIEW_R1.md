# AI Theater / 演戏 — 评审 / Review

## 中文摘要

**总体判断:** 架构方向对,"先开演、后补拍"的 director 接缝设计得比较干净。但从观众席看,演出仍像一台"会动的积木展示",不像一场戏。我没有运行浏览器,以下"感觉"类结论来自读代码。

1. **最大的"僵"来自动画系统本身,而不是手势数量少。** `actor.js` 的 `setGesture` 会把 `gestureBlend` 归零。`applyGesture` 又只按"当前手势 × blend"累加,所以每次换手势,上一个姿势会瞬间消失,手臂先掉回垂下,再慢慢抬起。这就是机械感的主要来源,而且改起来很便宜。
2. **脸是死的。** 没有眉毛,瞳孔固定,嘴只是一个盒子随正弦开合,不跟文本和音节走。情绪只靠躯干小幅度倾斜表达,在 7 米外的座位上几乎看不出。
3. **视线靠转整个身体。** `yaw` 朝 `look` 目标阻尼转动,头只加一个小 lag 和随机 glance,没有"眼睛先到、头再到、身体最后到"的层次。
4. **舞台像样板间。** 默认打开的 `marks` 地标贴字("CS/DL")破坏沉浸感。灯光是一盏平的正面主光加追光,没有场景级灯光变化。镜头 `cinematic` 只是 `index % 3` 轮换。
5. **流式协议在导演侧是可用的,但有三个缺口。**
   - 没有 `replace-beat` / `cancel-scene`。
   - `scene-end` 在 director 里是空操作。
   - 缺 `hold/cue` 语义。
   `HOLD_MS = 20000` 超时会悄悄把戏结束,接真实 LLM 时会误杀。
6. **"首拍 6–10ms"要如实看待。** 规则解析的文本全在内存里,所以快。这个数字证明 director 接缝可用,不证明"LLM 现场写戏"能在几秒内开演。真实瓶颈会是模型首 token 延迟和 TTS。
7. **walk-abort 接缝基本稳固(见 C 节),但有一处缺陷:** 没有 `moveTo` 的"重新上场"拍会让演员在侧幕里直接开口说话。
8. **建议默认路线:** 保持程序化 rig,但换成真正的"姿势混合 + 目标驱动"层(局部 IK / 目标姿势插值)。同时做一个 `ActorStyle` 接口,让纸偶 billboard 作为第二风格,用来做低成本 A/B。VRM / glTF 放到第二轮。

---

## A. 坐在台下看戏的感觉 / The view from the seats

**Works**
- 舞台框架完整:台口、侧台、幕、脚灯、斜坡座位、"你"的小人在前排,"我在剧院里"的氛围已经成立(`theater.js`、`audience.js`)。
- 观众席会在独白时前倾、换场鼓掌,并有一个很小的噪声 blip(`audience.js` 的 `blip()`),这是很好的小细节。
- 字幕大小、描边和姓名色合理(`style.css` 的 `.sub-line`)。
- 开演时 `houseLamp` 降光(`theater.js` 的 `update`),有"灯暗了"的仪式感。

**Stiff / toy-like**
- **机位。** 观众席机位固定在 `AUDIENCE_CAM.pos [0.78, 1.36, -6.2]`,正对舞台,低而平,像证件照。真实观众会有轻微头部漂移和呼吸,这里没有。它也永远不会因为台上的事"被吸引",比如被拉近、转头看人上场。`cinematic` 模式(`cameras.js` 的 `onBeat`)是固定三个机位轮换,和戏剧结构无关。
- **灯光。** 一盏 `key` 平行光从前左上方打来,加半球光和环境光。台上人物像在白天室内。追光 `spot` 只会偏向说话者并在 14 和 36 之间调强度。没有色温随情绪或场景变化,没有 blackout,没有鬼魂的冷光切入(鬼魂只靠自带 PointLight)。
- **舞台标记默认开启。** `live.js` 里 `marks: true`,地面上有文字标签,从观众席看是"调试痕迹"。建议默认关,只在 free 相机或调试时开。
- **布景。** `elsinoreTexture()` 是一张所有场景共用的 Hamlet 背景。不论用户贴什么剧本,背景永远是埃尔西诺。对"现场请求"场景尤其违和。
- **字幕。** 字幕一次显示整拍,最多约 34 词。TTS 开着时字幕和语音同步,但没有逐句或逐词推进。字幕栏的 `margin-left: min(380px,100%)` 与面板绑定,面板收起时字幕仍然偏右。
- **观众小人。** 观众像静态装饰。除了"你"的标签,没有个性化、没有对台词的反应(笑、惊、转头)。7 个观众只有颜色和发色不同。

**建议(便宜的)**
1. `marks` 默认关。
2. 给 `AUDIENCE_CAM` 加极慢的 sway 和呼吸(每帧在 `desiredPos` 上叠加 ±2cm),并在 `perform()` 的 `holdingCue` 和 `soliloquy` 时做轻微 push-in。
3. 场景级灯光预设(`night`、`day`、`ghost`、`interior`),由 beat 的 `emotion` 或未来的 `scene.mood` 切换。
4. 背景改成按 `scene.setting` 选的若干 canvas 纹理,没有就用中性幕布。

---

## B. 动画僵硬 / Animation stiffness

**根因按严重度排序(都在 `src/actors/actor.js`):**

1. **手势无交叉淡出。** `setGesture`(L132–138)只重置新手势的 `gestureBlend = 0`,旧手势立刻不再计入。从 `point` 切到 `handsOnChest`,手臂会先"掉"回垂下,再抬起。**修:** 保存 `prevGesture` 和 `prevBlend`,在 `applyGesture` 里同时累加旧手势 `(1 - b)` 和新手势 `b`。或者把每个手势定义成目标姿势表(关节 → 欧拉角),对 `acc` 做插值。后者同时修了下面第 2、3 点。
2. **`talk` 是节拍器。** `Math.sin(this.t * 7)` 驱动右肩和右肘(L374–378),所有人、所有台词都用同一频率,和文字无关。**修:** 用 beat 的标点和句重音触发离散的"小手势"(beat gesture),幅度和间隔加随机,频率约 0.3–1.2Hz,而不是连续正弦。无台词时让手落回放松。
3. **每句台词默认 `talk`。** 解析器里 `gesture: gestureFromText(...) || gestureForEmotion(...)`,几乎每拍都有手势,导致"一直在比划"。真实表演的静止同样重要。**修:** 解析器多给 `idle`/`null`,由运行时按停顿长度和强调词补偿。
4. **没有眉毛,瞳孔固定。** `rig.js` 没有眉毛几何,`pupil` 是固定子网格。**修(便宜):** 加两个眉毛 box 作为 `head` 的子关节,按 `emotion` 设定倾斜和高度。加瞳孔朝 `look` 目标的小幅偏移,这一项的观感提升比加十个手势都大。
5. **嘴不跟音节。** `syllable += dt * (9 + lipPulse * 8)`,开合是正弦,只在 `onboundary` 时脉冲(L264–270)。Chrome 的本地语音大多不触发 `onboundary`,因此基本是固定频率。**修:** 对 `line` 做粗略音节切分,按 `estimateSpeechMs` 把音节时间线铺满,用元音类别(a/o/e/闭口)决定开合幅度。无需真 viseme。
6. **视线用整身转向。** `yaw` 直接朝 `look` 阻尼(L205–214),`headLag` 和 `glance` 只是小修饰。**修:** 分三级,眼睛 → 头 → 躯干 → 脚,各自用不同阻尼和阈值。对方在 ±35° 内只转头不转身,超过才迈步转身。
7. **走路。** 固定 `2.55 m/s`,直线,无加减速,无到点前的减速,脚步相位只和距离绑定(`walkPhase += step * 6.2`),没有脚锁定,脚会"滑"。到达后 `yaw` 才转向 `look`,会有原地转圈感。**修:** 加 0.2s 的起步加速和 0.3s 的到点减速,走路时身体轻微前倾和左右摇摆(`pelvis.z` 随步相),到点后 `look` 先于身体到位。
8. **进场 / 出场。** 演员 `snap` 到侧幕坐标再走。从观众席看,他们是"出现在侧幕旁边然后走",而不是"从幕后走出"。**修:** 侧幕外放一个遮挡板,进场从板后淡入或直接从被遮挡位置走起,不要在侧幕外 1.5m 突然 `setVisible(true)`。
9. **Euler 叠加。** 所有关节用 `rotation.set(a.x,a.y,a.z)` 的 XYZ 顺序(L257–262)。肩部同时在 x 和 z 上加量时(`point`、`handsOnChest`),会出现万向锁式的奇怪姿势。**修:** 肩部改用 `rotation.order = 'ZXY'` 或四元数。
10. **呼吸和 idle 太小。** `spine` ±0.025 rad,`head` ±0.03 rad,从 7 米外看是静止的。

**具体修复 vs 实验赌注**

| 类型 | 条目 |
| --- | --- |
| 具体修复,一天内可做 | 1(手势交叉淡出)、4(眉毛 + 瞳孔)、`marks` 默认关、7(加减速)、9(肩部 order)、idle 幅度加倍、`talk` 改成离散 beat gesture |
| 中等 | 5(音节时间线口型)、6(三级视线)、8(侧幕遮挡) |
| 实验赌注 | 目标姿势表 + 简单两骨 IK(手伸向对方、握手、拔剑)、程序化二次动画(衣摆 / 披风弹簧)、表演"节拍库"(见 E 节) |

---

## C. 架构:剧本 → 解析 → Performance JSON / 流事件 → director → 演员/语音

**Strengths**
- 数据流是单向的,分层干净:`scan.js`/`ruleParser.js` 产出事件,`stream.js` 负责事件和 JSON 互转,`director.js` 消费,`cast`/`actor` 渲染,`live.js` 是共享状态。
- `normalizePerformance` 永不抛错,未知值变警告,适合接 LLM 输出。
- `perform()` 里每个 `await` 后都检查 `gen !== this.generation || !this.playing`,没有遗漏。
- `ensureSpeaker` 让缺失角色降级为 courtier,而不是卡住。
- `holdForCue` 同时有 `_cueWait` 唤醒和轮询兜底,两条路径都能退出。

**walk-abort 接缝检查**

我顺着这些路径读过,**基本稳固**:
- `stop()`、`load()`、`loadPartial()`、`interruptTo()` 都会 `generation++`。
- `Cast.sync` / `Actor.dispose` / `Actor.snap` 会调用 `_finishWalk(false)`,不会留下悬挂的 Promise。
- `Actor.update` 的 abort 检查在 `dt = 0`(暂停)时也会运行,所以暂停中被 abort 仍能收尾。
- 新的 `walkTo` 在已有 `_arrive` 时先 `_arrive(false)` 再覆盖,旧调用者会得到 `false`。
- `loop()` 的 `finally` 在 generation 变化时重启循环,`play()` 在 `alreadyLooping` 时直接返回,等 `finally` 接手。这条路径对 `liveStart` 里的 `loadPartial` + `play` 很关键,是对的。

**需要补强的细节:**
1. `walkTo` 的短距离分支(`dist < 0.06`,L105–111)不会清 `this.goal`,也不会处理已存在的 `_arrive`。目前不会触发,因为旧的 perform 必须先结束才会开始新的,但这依赖一个没有写下来的不变式。建议这个分支也调用 `_finishWalk(false)` 清掉旧的 pending。
2. 只有 `walkTo` 检查 abort,而且只在 `update()` 里检查。如果标签页被切到后台,`requestAnimationFrame` 停止,walk 永不结束,`loopRunning` 一直为 true,新的 `play()` 只能等。切回前台才恢复。`wait()` 和 `Voice.speak` 用 `setInterval`(也会被节流),但最终会结束。建议给 `walkTo` 加一个基于 `setTimeout` 的看门狗(预计时长 × 2)。
3. **重新上场无 `moveTo` 的问题。** `perform()` 对不可见演员会 `snap` 到侧幕再 `setVisible(true)`,如果该拍没有 `moveTo`(AI / NDJSON 输出完全可能),演员会站在侧幕坐标 `x = ±6.15` 直接开口。规则解析器总是填 `moveTo`,所以现在没暴露。**修:** 进场且没有 `moveTo` 时,默认走向 `cs` 或最近的 `dl`/`dr`。
4. **`_cueWait` 唤醒后的竞态:** `pushBeat` 里 `if (this._cueWait) this._cueWait(); else if (playing && !paused && !loopRunning) this.loop(...)`。如果 `loop` 已经处于 `await sceneBreak` 或 `await perform`,这是对的。但 `_cueWait` 只在 `holdForCue` 内有效,我没发现死锁,只是这个"谁唤醒谁"的关系需要一个注释或一组测试。

**Underrun(导演饿了)**
- `holdForCue` 会让所有可见演员 `setGesture('idle')` 并看向侧幕,是不错的"等提示"表演。
- **风险:** `HOLD_MS = 20000`(L9)到点后写入 `stream-timeout`,设 `streamEnded = true`,然后戏就收尾了。对规则解析器无所谓,对真实 LLM(慢、重试、排队)会提前终止一场还在生成的戏。**修:** 分两级,软超时(约 6s)后换成更明显的表演和字幕"编剧在想",硬超时由用户决定或可配置。另外,晚到的 beat 在 `streamEnded = true` 之后会被 `pushBeat` 接受(没有检查),但循环已经退出,这些 beat 会永远躺在 playlist 里。
- 没有"缓冲预热"策略:首拍到后立刻开演,后续 beat 的间隔小于单拍时长时会反复 hold。对 LLM 流,建议可选 `minLeadBeats`(例如先攒 2 拍再开),让 hold 少发生。默认保持 1。

**Late characters**
- `addCharacter` 只在"演员尚未可见且旧的是 courtier 而新的更丰富"时 `cast.replace`。这是合理的最小语义。
- 但 `addCharacter` 里的默认值和 `normalizePerformance` 不一致:前者 `voice.lang 'en-US'`,后者 `'en-GB'`。同一个角色走不同入口会有不同嗓音。
- `ensureSpeaker` 先于 `character` 事件创建的占位演员,会让后到的角色事件在"已可见"时被忽略(无法再换服装)。这是预期行为,只是需要在协议里写明:**`character` 必须先于该角色的首个 `beat`。**

**Mid-line interrupt**
- `interruptTo` → `voice.cancel()` → `_finish(false)` → `perform` 返回 `false`,**`actor.setTalking(false)` 在 `speak` 返回后执行**(L588),所以口型会正常停。
- `makeAngrier` 直接改 `this.current.emotion` 并重调 `showLine`,同时 `voice.emphasize()`,这是对"进行中的台词"的合理处理。但 `current` 与 `playlist[index]` 是同一对象时才会影响重放。`applyAnger` 返回的是浅拷贝 `{...beat}`,所以 `replay` 重放时第二次不会再被 `angerBeats` 作用一次(`angerBeats = 3` 已经在首次消耗)。这是个小的行为细节,不是 bug。

**Revising upcoming beats**
- **目前没有这个能力。** 能做的只有 `cutUnplayed()`(L723–730)+ `pushBeat`,而 `cutUnplayed` 有两个问题:
  1. 它按 `b.id` 过滤 scene.beats。`appendBeat` 在没有显式 id 时用的是 per-draft 的计数(`b${beatCounter}`),**每个场景从 b1 重新数**。AI 或 NDJSON 的无 id 拍会在不同场景里出现重复 id,导致被保留的拍比预期多。规则解析器给了全局唯一 id,所以现在不暴露。**修:** `appendBeat` 在 `normalize` 之后重写 id 为全局唯一(例如 `performance` 上维护计数)。
  2. `keep = index + 1` 假定当前拍正在演。如果正处于拍与拍之间(`current` 为 null 但 `index` 指向未开始的拍),这一拍也会被保留。
- 另外 `appendBeat` 每次都把整个场景重新 normalize 一遍(`[...scene.beats, expanded]`),再加 `pushEvent` 后 `main.js` 的 `applyTranslations(director.performance)` 每个事件都全量遍历。数百拍的长剧本下这是 O(n²)。目前 Hamlet 规模无感,但"贴整本剧"时值得改成只处理新增拍。

**AI parser placeholder**
- `aiParser.js` 的契约清晰(`ai-theater-stream-v1`,NDJSON/SSE,密钥留在服务端),`readEventStream` 能处理 SSE `data:` 前缀、`[DONE]`、注释行。这部分写得克制,没有越界。
- 缺口:没有 `AbortController`,用户点停止后请求继续跑(`halt()` 只递增 `liveToken`);没有首字节超时;`fetch` 失败时 `provider.parseStream` 才回退到规则流,这时 `director` 可能已经 `loadPartial` 并显示"大幕已开",回退产生的事件是一份**完全不同的戏**,但没有 `reset` 事件让导演知道要重来。
- `tools/prompt-performance.md` 如果要给流式用,需要单独一份"一行一个事件、先 meta 再 character 再 beat"的提示词,并要求"首个 beat 必须在前 N 个 token 内出现"。

---

## D. 速度 / 现场开演 / Speed and the live path

**协议是否紧凑、完整?**

紧凑度够用:短字段别名(`sp`、`ln`、`em`、`g` …)对 LLM 输出能省不少 token。**但"完整"度不够。** 缺这些事件:

| 缺失事件 | 用途 | 备注 |
| --- | --- | --- |
| `replace` / `revise` `{ beatId, patch }` | 改写尚未播出的拍("更生气""换结局") | 必须约定:已播出的拍不可改,只改 `index` 之后的 |
| `cancel-scene` `{ sceneId }` | 丢弃某个场景里未播出的拍 | `cutUnplayed` 已有雏形,协议里没有 |
| `reset` / `restart` | AI 失败后回退到规则流时重新开始 | 避免两份内容拼在一起 |
| `cue` / `hold` `{ reason }` | 编剧显式告诉导演"我在想" | 配合软超时(见 C 节) |
| `scene-start` `{ id, name, setting, mood }` | 灯光 / 背景 / 音乐预设 | 现在场景只能从第一个 beat 的 `sceneId` 推出 |
| `set-light` / `set-mood` | 编剧级灯光 | 可选,放到第二轮 |
| `seq` 或 `rev` 编号 | 去重、乱序、重连 | 现在 `pushBeat` 无幂等性 |
| `scene-end` 的语义 | 目前在 `Director.pushEvent` 里是 `break` 空操作 | 要么让它触发 `sceneBreak`(鼓掌、暗灯),要么从协议里删掉 |

另外,`scene-end` 当前的副作用是:换场的掌声只在**下一场的第一拍到达**或流结束后才触发。晚到的下一场会让观众"静默等待",这不像剧场。

**liveStart UX**
- 好的:`liveStart` 在首拍真正开始时 resolve,状态行显示"解析中…已开演第 1 句",大幕立即拉开,等待时有侧幕张望。这套反馈是对的。
- 问题:
  1. `liveStart` 里 `await first;` 之后 `void parsed;`,解析 Promise 的错误只会走 `.catch` 里发 `ai-fallback-error`,**对用户没有可见错误**(只写进 warnings 列表)。
  2. 如果文本为空或非常短且 `looksLikePremise` 判错,用户得到的是一场"本地草稿",标注只在状态行和 warning 里,字幕里的台词 `This is a local instant sketch, not an AI dramaturg` 虽然诚实,但**作为台词放进演员嘴里**会破第四面墙,观众听到"我们是草稿"会出戏。建议这类声明放在状态行和标题牌上,不要让演员说。
  3. `playFromPanel`、`togglePlay`、`liveStart` 三条入口有重叠逻辑,`loadedText === text` 判断用于决定"续播还是重来",编辑文本后按空格会重新开演,可能不是用户想要的。
  4. 面板占了左侧约 380px,字幕和导演栏跟着右移。手机或窄屏下观感差(`@media max-width: 760px` 把 `margin-left` 归零,但面板 `max-height: 42vh` 仍盖住舞台)。"直播请求"应该是一个**独立的、居中的小输入条**,不是整套面板。

**Premise sketch**
- 诚实地标明了来源,这是优点。
- 但它的内容很弱:三句固定话术,两个固定角色(`Player`/`Friend`,`甲`/`乙`),几乎不用前提内容(只是原样引用一次)。观众输入"一个国王发现王后在偷偷喝毒酒",得到的是"我们先演起来。你给的是这一句:……"。**对演示价值来说,这是整个直播路径里最弱的一环。**
- **便宜的改进(仍然无 LLM):**
  - 从 premise 里抽名词和动词,选 4–6 套"模板戏"(争吵、告别、发现、审讯、求婚),用关键词匹配选择,再把 premise 的主语和宾语代入。
  - 把模板写成一个 JSON 库(`src/data/beats-library.js`),每套 8–12 拍,带情绪曲线和走位。这在不调用任何模型的前提下,能让"几秒内开演"看上去像一场戏。
- 一旦接了真模型,这些模板可以作为兜底和"在模型首 token 之前先演的前奏"。这是**把本地先演与远程流式拼起来**的关键设计,见 E5。

**导演钩子:哪些留本地,哪些交给未来的流式编剧**

| 钩子 | 建议 |
| --- | --- |
| `replay`、`hold`、`faster` | 永远本地,和内容无关 |
| `angrier` | **应该本地做第一层**(现在已做:情绪、手势、音高),之后再让编剧改写台词措辞。两层可以并存 |
| 本地的"强度"通道 | 增加 `calmer`、`louder`、`slower`、`sadder`、`funnier`,全是对 `emotion`/`pauseMs`/`gesture` 的运行时重写,无需模型 |
| `ending` / "换结局" | 必须交给编剧(流式)。本地占位台词("A new ending will be written here")同样会破第四面墙,建议改成纯表演:演员看向侧幕、灯光渐暗、字幕写"……" |
| 观众插话("让国王上场") | 交给编剧。协议需要 `insert-after-current` |

**风险**
- 没有幂等和顺序保证,重复事件会重复上台。
- `liveToken` 只在 `main.js` 层挡过期事件。`Director.pushEvent` 直接被 `window.__theater.pushEvent` 调用时没有保护,只适合测试。
- 流事件进入 UI 的 `setJson(director.performance)` 在每个事件后整份 JSON 重新 `JSON.stringify`(`onChange` → `setJson`),长剧本是 O(n²) 的字符串化,而且发生在主线程、动画帧之间。建议 JSON 预览只在折叠栏展开时、且节流更新。

---

## E. 互不相同的实验方向 / Mutually different experimental ideas

分为"下一步做"到"更野的赌注"。每条都与前一条**机制不同**,不是继续打磨现有手势。

### 1. 姿势交叉淡出 + 目标姿势表 + 离散"表演节拍"(do next)
把 `applyGesture` 的 if 链换成"手势 = 关键姿势表 + 进出曲线",加旧手势淡出。再加一个 **beat gesture 调度器**:在台词的标点和重音词位置触发 0.4–0.8s 的小动作,其余时间保持静止或做自我触碰(摸脖子、整衣领)。同时补眉毛和瞳孔跟随。
- **成本:** 1–2 天。**风险:** 低。**收益:** 立刻去掉"机械感"的主要来源。

### 2. 纸偶 / 皮影 billboard 演员(do next,作为第二风格)
每个角色是一张(或几张)分层的 canvas/SVG 纸片,挂在 Three 的 plane 上:头、躯干、两臂、两腿各一片,用铰链旋转,带轻微的纸张摆动和阴影。动作少、风格强,容错高,**天然适合"现场生成角色"**(只需要一个色板和一张脸)。
- 好处:不需要骨骼和蒙皮,没有"恐怖谷"。风格化让简单动作也显得有意图。可以直接复用现有 `GESTURES` 到 5–6 个关节的目标角度表。
- 成本:2–3 天,一个 `PaperPuppet` 类实现和 `Actor` 相同的接口(见下面的切换方案)。许可:全部程序生成,无外部素材。

### 3. 动作"节拍库"+ 戏剧技法层(do next / soon)
不改 rig,改"演什么":一份小型的**戏剧技法表**,把常见舞台调度命名成可复用单元:`"cross-on-line"`(说到某词时走位)、`"turn-on-last-word"`、`"hold-then-break"`(长停顿后爆发)、`"cheat-out"`(演员朝观众侧身 30° 而不是正对对方,这是真舞台的惯例)、`"upstage-listener"`(听者退到说话人身后)。解析器和未来的编剧只输出这些技法名,运行时展开。
- 这解决的是"为什么演员总是面对面站桩":真舞台上人物的朝向和站位是一种语言。
- 成本:2 天。依赖:无。

### 4. 局部 IK + 注意力系统(medium)
给手臂加两骨 IK(CCD 或解析解),给头眼加注意力目标队列(说话人、被提到的人、打断者、观众)。让"指向""递给""握剑""抓住对方肩膀"都是**对目标点的 IK**,而不是预设欧拉角。这能让同一个手势在不同站位都对得准。
- 成本:3–5 天。风险:中(关节限位、调试)。收益:高,**是后面接 glTF / VRM 的前置能力**。

### 5. 本地先演 + 远程接管("前奏"模式)(medium,速度目标的核心)
首拍之前不等模型:本地立刻演一段 10–20 秒的**前奏**(报幕人念标题、演员站位、观众席安静,甚至用 premise 的关键词生成一段"开场白"),同时请求服务端流式编剧。模型的第一个 beat 到达时,前奏自然收尾并接上。这把"几秒内开演"从**解析速度**改成**不让观众感觉到等待**。
- 需要协议里的 `scene-start`、`cue`、`reset`,以及 director 的 `minLeadBeats` 和"前奏可被打断"语义。
- 这是对目标 3 最直接的回应,比再优化 6ms 的解析重要得多。

### 6. glTF 蒙皮角色 + CC0 动作(medium)
使用 CC0 的人形角色(例如 Quaternius 的 Universal Base Characters / Ultimate Modular Men/Women 系列、Kenney 的角色包,**使用前核对各包当前的 license 页面,本评审无法联网核验**)。拿现成的 idle / walk / talk 剪辑,用 `AnimationMixer` 混合,再叠加我们自己的 look-at 和 IK。
- 好处:有真正的蒙皮和身体比例,走路不滑。缺点:服装和 8 种 costume 的映射、关节命名差异、素材体积,以及"所有角色长得像一个人"。
- 建议放在第二轮,等 IK 和注意力系统稳定后再接,否则只是把同样的僵硬换到更贵的身体上。

### 7. VRM 角色(medium-wild)
VRM 带标准化的人形骨骼、表情(blendshape)、视线目标和 spring bone,**天然解决眉毛、口型、眼神、头发和衣摆**。用 `@pixiv/three-vrm`(MIT)加载,素材用 VRoid Studio 自制或 CC0 / CC-BY 的样例。
- 好处:表情系统一步到位,和 TTS 的元音口型最匹配。风险:CDN 依赖多一个包(与"无构建"兼容,但要钉版本);Three r160 与 three-vrm 版本匹配要先验证;素材 license 差异大(VRM 文件自带 usage 条款,有些禁止商用或再分发,**不能随仓库分发时必须逐个核对**)。
- 建议作为"表情上限"的对照组,而不是默认。

### 8. Toon / SDF 风格渲染(wild,低成本高辨识度)
不换模型,换渲染:给现有 rig 加轮廓线(反向壳法)、三阶色带和一张纸质噪点纹理,或者把脸做成 SDF 脸(用一个 shader 画眼、眉、嘴,通过 uniform 控制表情)。**SDF 脸一个 shader 就解决了眉毛、眼神、嘴型的问题,而且不依赖骨骼。**
- 成本:2–3 天。风险:低,可以和 1、4 叠加。
- 从观众席看,轮廓线和色块比物理材质更能读出"这个人在做什么"。

### 9. "在场感"系统:观众席成为演出的一部分(wild,和演员模型无关)
关于"身处剧场"的几个小机制,机制互相独立:
- **观众反应:** 解析出的情绪触发观众小人的集体反应(笑、倒吸气、前倾、鼓掌),并带一点延迟和个体差异。
- **"你"的小人可控:** 允许点头、鼓掌、嘘声(键盘 / 按钮),编剧未来可以读到观众的反应(这是"现场请求"的自然延伸:观众不只点播,还在影响演出)。
- **舞台灯光读剧本:** 独白时周围暗下去,只留一圈光;鬼魂入场时冷色渐入;怒时灯偏红。
- **声音:** 幕布声、脚步声(踏木板)、观众咳嗽和衣物声的低音量环境声(Web Audio 合成,无需素材)。**声音往往比画面更能让人觉得"我在剧场里"。**

### 10. 摄影导演:镜头跟戏走,而不是轮换(wild)
给 `cinematic` 机位一个"摄影导演"状态机:独白用慢推,对话用过肩加反打,打斗或愤怒用快切,大场面拉远,说完最后一个词后的停顿里再切(而不是在新拍开始时切)。观众席机位也加一条规则:轻微追随说话人的头部高度。
- 成本:1–2 天。可以和任何演员风格叠加。

### 推荐的默认与切换方案

**默认:** 先做 1 + 3 + 8(SDF 脸或至少眉毛)+ 9 的灯光和声音部分,保持程序化 rig。这是**投入最低、对"死气"改善最大**的组合。同时落地 5(前奏模式),因为它直接对应速度目标。

**比较与切换的做法(重要):**

1. **先抽象接口,再做第二个实现。** 抽出 `ActorStyle` 接口:
   ```js
   { create(character), setPose(targets), setLook(point), setFace(emotion), setMouth(openness),
     playGesture(name, blend), walkTo(x, z, abort), dispose() }
   ```
   `Actor` 目前把 rig 创建(`createRig`)、关节累加(`acc`)、行为逻辑(walk、look、gesture 选择)混在 `actor.js`。拆成两层:**行为层**(决定"要什么":目标位置、目标朝向、手势名、情绪、口型开合度)和**表现层**(决定"怎么长"),只有表现层可替换。
2. **共用同一份 Performance JSON 和 director。** 所有风格接收相同的行为层输出,所以比较是公平的。`Performance` 里的 `costume` 字段保持语义(角色是谁),风格由全局 `live.actorStyle` 选择,不写进 JSON。
3. **加一个风格切换器**(`live.actorStyle`,键盘 `4/5/6`),在**同一场戏、同一时间点**切换,而不是重播。这样就能肉眼并排对比。
4. **评分维度**(每种风格 1–5 分):从观众席 7 米外是否读得出情绪、走路是否可信、说话时是否像"在说"、30 秒内是否出戏、能否由程序化方式批量生成新角色(速度目标)、体积和加载时间、许可证风险。
5. **顺序建议:** 程序化改良版(基线)→ 纸偶 → toon/SDF 脸 → glTF → VRM。纸偶和 toon 是无素材的,能最快产出可比较的结论。glTF 和 VRM 需要素材和许可证核对,放在最后。

---

## F. 下一轮任务清单(给 cursor-agent)/ Next-round task list

按优先级排列,全部可本地实现,无付费 API、无部署,若 vendoring 素材须为 CC0 / MIT 等宽松许可。

**P0 — 一天内,立刻改善观感**
1. `actor.js`:手势交叉淡出(保存 `prevGesture`/`prevBlend`),`applyGesture` 同时累加两者。
2. `rig.js`:加眉毛(两个 box,`head` 的子关节)和瞳孔跟随;`actor.js` 按 `emotion` 设置眉毛角度,按 `look` 目标偏移瞳孔。
3. `live.js`:`marks` 默认 `false`(已存储的偏好保持不变)。
4. `actor.js`:`talk` 改成离散 beat gesture(随机间隔,幅度随机),其余时间回落;idle 幅度约翻倍;肩部 `rotation.order`。
5. `director.js` `perform()`:重新上场且没有 `moveTo` 时,默认走向 `cs`/`dl`/`dr`(修复侧幕里说话)。

**P1 — 协议和接缝,支撑现场路径**
6. `stream.js` + `director.js`:增加 `reset`、`cancel-scene`、`replace`(只允许改未播出的拍)、`cue`/`hold` 和 `scene-start` 事件;`scene-end` 触发 `sceneBreak`(鼓掌、暗灯)。给 `pushEvent` 加 `seq` 幂等去重。
7. `stream.js` `appendBeat`:拍 id 全局唯一;只 normalize 新增的一拍(消除 O(n²));`cutUnplayed` 处理"拍与拍之间"的情况。
8. `director.js` `holdForCue`:软超时(约 6s,换表演和字幕)+ 可配置硬超时,晚到的拍在 `streamEnded` 后要有明确行为(拒绝并警告,或重启循环)。
9. `actor.js` `walkTo`:短距离分支清理旧 pending;加 `setTimeout` 看门狗,防止标签页在后台时 walk 悬挂。
10. `main.js`:`setJson` 节流且仅在折叠栏展开时更新;`applyTranslations` 只处理新增拍;`liveStart` 的错误要在 UI 上可见;给 `AIParser.parseStream` 加 `AbortController`,`halt()` 时取消。
11. 修正 `director.addCharacter` 默认 `voice.lang` 与 `normalizePerformance` 不一致。

**P2 — 速度目标的真正瓶颈:前奏模式**
12. 新增 `src/runtime/prelude.js`:本地 10–20 秒前奏(报幕、站位、灯光渐起),可被首个远程 beat 打断并无缝接上;`director` 增加 `minLeadBeats` 选项。
13. `premise.js`:改成"模板戏库"(`src/data/beats-library.js`,5–6 套各 8–12 拍),用关键词选型并代入 premise 的名词;**去掉台词里"我们是本地草稿"这类出戏话**,改在状态行和标题牌里标注。
14. 增加本地运行时"强度"通道:`calmer`/`louder`/`slower`/`sadder` 等,全是对 `emotion`/`pauseMs`/`gesture` 的改写;`ending` 钩子的占位改成纯表演(看向侧幕、渐暗、字幕"……")。

**P3 — 为演员风格比较做准备**
15. 拆分 `Actor`:行为层(目标位置、朝向、手势名、情绪、口型开合度)和表现层(`ActorStyle` 接口),把 `createRig` 包成 `ProceduralStyle`。
16. 实现 `PaperPuppetStyle`(程序化 canvas 纸片,无外部素材)和键盘 `4/5` 实时切换器 `live.actorStyle`;在 `README` 里记录评分维度和评测方法。
17. 摄影导演状态机(`cameras.js`):独白慢推、对话过肩反打、在停顿里切镜头;观众席机位加微小漂移。
18. `audience.js` 观众反应(按 `emotion` 触发集体反应)和 Web Audio 合成的环境声(脚步、幕布、咳嗽),可按实验开关控制。
19. (可选)场景级灯光预设与 `scene.setting` 驱动的背景纹理,取代永远是埃尔西诺的背景。

**暂缓,需先核对 license 和版本:** glTF/CC0 角色(每个素材包单独核对)、VRM(`@pixiv/three-vrm` 与 Three r160 的版本匹配、素材自带的使用条款)。

---

## 结论 / Verdict

这个项目的骨架比表面看起来结实:单向数据流、永不抛错的 normalizer、每个 `await` 后都检查 generation,以及一套能对接服务端流的事件协议,是对"现场开演"目标的正确回答。walk-abort 这条接缝我顺着 stop / load / interrupt / dispose / pause 几条路径读过,基本稳固,留下的只是几处靠隐含不变式撑着的地方。但目前演出的"死气"主要来自两个具体、可修的问题:手势切换时旧姿势瞬间消失(没有交叉淡出),以及没有眉毛和眼神的脸;其次才是 talk 节拍器式的手势、整身转向的视线和固定轮换的镜头。速度这一项,6–10ms 的首拍时间证明的是 director 接缝,不是端到端能力;真正会决定"几秒内开演"的是模型首 token 延迟,所以前奏模式(本地先演、远程接管)和缺失的 `reset` / `replace` / `cancel-scene` / `cue` 事件,比继续优化解析速度更值得投入。premise 草稿现在是最弱的一环,它的台词会让演员自己说"我们是本地草稿",这会破第四面墙。我建议先做 P0 的手势交叉淡出、眉毛和瞳孔、`marks` 默认关,再做前奏模式和协议补全,等行为层与表现层拆开后,用无素材的纸偶和 SDF 脸做第一轮演员风格对比,glTF 和 VRM 留到许可证和版本都核对清楚之后。
