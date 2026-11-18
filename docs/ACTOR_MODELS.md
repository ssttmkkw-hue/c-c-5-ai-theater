# Actor styles / 演员样式

Six bodies can play the same Performance JSON. Switch them from the panel, from `compare.html`, or with `window.__theater.setActorStyle(id)`. The director, blocking, subtitles, speech, `liveStart`, and `intervene` do not change.

六种身体演同一份 Performance JSON。从面板、`compare.html`，或 `window.__theater.setActorStyle(id)` 切换。导演、走位、字幕、朗读、`liveStart` 和 `intervene` 不变。

Scores are from the house, about seven meters out, on this machine (SwiftShader). They are rough, not a lab benchmark.

分数是从大约七米外的观众席看的，在这台机器上（SwiftShader）。只是粗看，不是实验室基准。

| | Look / 样子 | Motion / 动作 | Stiffness / 僵 | Load / 加载 | Runtime / 运行 | Effort / 工作量 | License / 许可 | Watching a play / 坐着看戏 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `procedural` | Chibi joints, brows, pupils | Crossfade poses, discrete talk beats | Medium. The snap-to-idle between gestures is gone. | None | ~20 meshes, no skinning. Cheap. | Already here; this round only fixed the face and the blend | Original | **Default.** Fastest first line, emotion reads from the seats |
| `paper` | Flat cards, ink face, thick head, crown / cloak / skirt | Same pose table on hinges, mouth scales | Low stiffness, little range. The head stays a block when the neck bows | None | Cards plus a few costume planes | About a day of drawing and hinges | Original canvas | Good when you want a toy stage, not a body |
| `toon` | Cel bands, dark shell, rounder head | Same as procedural | Same as procedural, but the silhouette is easier to read | None | Extra shell mesh per part | Small | Original | Best cheap upgrade if the mannequin feels like clay |
| `ik` | Same mannequin plus reaching hands | Two-bone arms, ankle plant, spine follows the look | Hands meet the gesture instead of a fixed euler. Elbows can still fold oddly | None | A few vector solves per frame | Medium | Original | Use when pointing and giving must hit a spot |
| `gltf` | Blocky skinned human with eye and mouth cards | `AnimationMixer` clips, 0.25s fades, blink on the cards | Clips are short and loop or hold. Less finger detail than the joint rig | One small glTF when selected (~40KB) | 1 skinned mesh, 17 joints, plus three face cards | Generator plus mixer | CC0, made here | Useful comparison. Not the default |
| `vrm` | Mannequin with the same face cards, expression morphs | Bones lerp toward the gesture, look-at, `aa` and blink | Arms leave the T-pose. Coarser than procedural | File ~30KB, fetched once and reused, plus `@pixiv/three-vrm@2.1.0` from esm.sh, only when selected | Humanoid update + a few morphs | Highest. Version pin and a real VRM file | CC0 mesh. Loader is MIT, not vendored | Expression ceiling of this round. Too heavy to be the default |

## Recommendation / 建议

Keep **`procedural`** as the default for “sit and watch a play.” It is on screen before any extra fetch, the gesture crossfade and the brows are visible from the seats, and every costume color is just a material. Use **`toon`** if you want the same acting with a clearer outline. Use **`paper`** for a flat show. Use **`ik`** when a hand has to reach. Treat **`gltf`** and **`vrm`** as the skinned and expression controls, not as the thing the audience sees first.

默认继续用 **`procedural`**。它不用额外下载就能上台，交叉淡入和眉毛在座位上读得到，服装颜色只是材质。想要更清楚的轮廓就用 **`toon`**。想要平面戏用 **`paper`**。手必须伸到一个点上用 **`ik`**。**`gltf`** 和 **`vrm`** 是蒙皮和表情的对照，不是观众第一眼该等的身体。

`getState().actorStyle` is the id. Unknown ids passed to `setActorStyle` become `procedural`. An unknown gesture name becomes `talk` on the actor and, inside glTF / VRM, a missing clip becomes idle or talk. Nothing there throws.

`getState().actorStyle` 是这个 id。`setActorStyle` 遇到不认识的 id 会回到 `procedural`。不认识的手势名在演员上变成 `talk`；glTF / VRM 里没有对应片段时回到 idle 或 talk。这些路径不抛错。

## What was searched / 查过什么

On 2026-11-19:

- **Quaternius Universal Base Characters** — the pack page says CC0 and includes glTF. The free zip is about 122MB. A second write-up said the site-wide license text changed in 2026. The zip’s own `License.txt` was not downloaded in this session, so the meshes were not copied.
- **Kenney** (Animated Characters 3, Blocky Characters, Mini Characters) — the author pages say CC0. They were not vendored. The rigs and skins would fight the eight costumes, and several downloads are FBX rather than one small glTF.
- **Poly Haven** — no small redistributable actor that matched this stage.
- **Khronos glTF sample models** — rigged samples exist. They are not a cast, and they were not copied.
- **Mixamo** — redistribution of the clips is not allowed for this public repo. `src/actors/styles/retarget.js` only renames tracks (`mixamorigHips` → `hips`, and the usual arm and leg names).
- **VRM** — `@pixiv/three-vrm@2.1.0` is the last 2.1 release whose peer dependency is Three `^0.160.0` (2.1.1 asks for 0.162, 2.1.3 asks for 0.164). It is imported from `https://esm.sh/@pixiv/three-vrm@2.1.0?external=three` so it uses the page’s `three@0.160.0` import map. The default show does not import it.
- **VRoid** — VRoid Hub cannot mark a model CC0, and turning on third-party use rewrites the license. AvatarSample A–Z is not CC0 and forbids redistributing the file while labeled CC0. Older beta samples are described as CC0 on a pixiv help page, but there was no small raw file to vendor without taking a full VRoid mesh. The file in `assets/actors/vrm/theater-cc0.vrm` was generated here instead.

2026-11-19 查过：

- **Quaternius** 的 Universal Base Characters 页面写着 CC0，也有 glTF。免费包大约 122MB。另有文章说 2026 年网站总许可文字改过。这次没有下载压缩包核对里面的 `License.txt`，所以没有拷贝模型。
- **Kenney** 的角色包页面写着 CC0。没有放进仓库。骨骼和皮肤会跟现有八套服装打架，而且不少下载是 FBX，不是一个小 glTF。
- **Poly Haven** 没有一块可以直接放上这个舞台的小型可再分发演员。
- **Khronos** 的 glTF 示例里有绑定好的模型。它们不是一套演员，也没有拷贝。
- **Mixamo** 的片段不能随这个公开仓库再分发。`src/actors/styles/retarget.js` 只做轨道改名。
- **VRM**：`@pixiv/three-vrm@2.1.0` 是仍声明同伴依赖 Three `^0.160.0` 的最后一版（2.1.1 要 0.162，2.1.3 要 0.164）。从 `https://esm.sh/@pixiv/three-vrm@2.1.0?external=three` 引入，走页面上的 `three@0.160.0`。默认演出不加载它。
- **VRoid**：Hub 不能把模型标成 CC0，打开「他人可使用」会改写许可证。AvatarSample A–Z 不是 CC0，并且禁止把文件标成 CC0 再分发。更早的 beta 样本在 pixiv 帮助页上被写成 CC0，但没有一份小的原始文件可以拿来，又不想带一整套 VRoid 网格。所以 `assets/actors/vrm/theater-cc0.vrm` 是在这里生成的。

Details and the generator live in [../assets/actors/LICENSE.md](../assets/actors/LICENSE.md) and `tools/make-actor-assets.mjs`.

细节和生成脚本在 [../assets/actors/LICENSE.md](../assets/actors/LICENSE.md) 和 `tools/make-actor-assets.mjs`。

## Feel fixes that landed with this / 一起落下的观感修复

- Gestures keep the previous pose and crossfade. Arms do not drop to the sides between two gestures.
- Brows follow emotion. Pupils saccade and shift toward the look target. The body turns more slowly than the eyes when the angle is small.
- Blocking marks default to off.
- A local premise is still labeled in the status line. The spoken lines do not say “we are a sketch.”
- An entrance with no `moveTo` walks to downstage left or right before the line.
- The audience camera drifts a few centimeters, leans in a little on a soliloquy, and biases its look toward the speaker.
- A listener drops the last gesture, tilts in, and nods. After the line, the speaker lowers the hand before the pause.
- A one-line premise picks a conflict, love, or parting sketch when the words match. The lines stay inside the scene.

- 手势会留下上一个姿势再交叉淡入。两个手势之间，手臂不会先掉回身侧。
- 眉毛跟着情绪。瞳孔会跳视，也会偏向注视目标。角度不大时，身体转得比眼睛慢。
- 走位标记默认关闭。
- 本地剧情仍然标在状态行。台词里不说「我们是草稿」。
- 没有 `moveTo` 的上场会先走到下场左或下场右，再开口。
- 观众席机位有几厘米的漂移，独白时稍稍靠近，视线会偏向正在说话的人。
- 听的人会放下上一个手势，侧头，偶尔点头。一句说完，说话的人会在停顿前把手放下。
- 一句话剧情若对上冲突、爱或离别，会换成对应的草稿。台词留在戏里。
