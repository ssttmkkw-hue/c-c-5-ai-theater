# AI Theater / 演戏: Claude Review R3

HEAD `c08cfd0`. I read `director.js`, `actor.js`, `cast.js`, `scan.js`, `premise.js`, `stream.js`, `voice.js`, `cameras.js`, the four style modules, `compare.js`, and `main.js` (`getState` and `theaterApi`). I looked at two screenshots, `actor-compare.png` and `live-hamlet.png`. I did not open the other ten, and I ran nothing. Everything below comes from code reading plus those two images.

## 中文摘要

**结论：R2 之后"手感"确实好了，但从观众席看，舞台仍然是"一个人在演，其他人在站桩"。最大的三件事是：**

1. **听者不会回到待机。** 已确认。`Director.perform()`（`director.js:548-550`）只对说话人调用 `setGesture`。上一位说话人的 `point`、`handsOnChest` 会一直挂到他下次开口。`setHolding` 是唯一一处把全员拉回 `idle` 的地方，它只在等流时触发。
2. **说话人在停顿时仍然半抬手。** 已确认。`poseOf('talk')`（`actor.js:623-626`）的底值是 `shoulderR 0.22 / elbowR 0.18`，`talkAmp` 衰减为 0 后这个底值还在。解析器给每个有台词的 beat 默认 `gesture:'talk'`（`scan.js:358`），所以几乎全程都是半抬手。
3. **台词解析仍是"格式识别"，不是"理解"。** 已确认。`premise.js` 是固定三拍模板，`emotionFromText`/`gestureFromText` 是词表匹配，没有"谁在对谁说"、"该不该走位"的推断。

**六种风格：真坏的有，只是弱的也有。**
- 看 `actor-compare.png`：gltf 是无脸的方块头，vrm 是无脸的方块头加 T 字张开的手臂，paper 的头不见了，只剩躯干和腿，浮在半空。
- 这几个不是"风格不同"，是"看起来坏了"。
- toon 和 ik 与 procedural 同体，差异小，但不算坏。
- vrm 不眨眼的说法我只对一半：代码里有 `blink` 表情（`vrm.js:148-149`），但驱动它的 `blinkWave` 在 clip 驱动路径里从不推进（`actor.js:362-373` 直接 `return`），所以实际上永远不眨眼。

**下一轮的重点（一轮能做完）：**
- P0：听者回到"听"的姿态、说话人停顿时放手、paper 把头和服装补回来。
- P1：gltf/vrm 的脸和服装剪影、观众席镜头做出可见的反应、voice 正则修正。
- P2：解析器的"对谁说话"推断、VRM 加载缓存与完整性。

**绝不能破坏：** 首拍快速开演、`window.__theater` 全部 API、6 种风格和 `compare.html`。

---

## 1. What still feels dead from the seats

### 1.1 Listener idle: confirmed

`Director.perform()` (`director.js:548-575`) does this for the speaker only:
- `setEmotion`
- `setGesture(beat.gesture || (beat.line ? 'talk' : 'idle'))`
- sets everyone else's `lookRef` to the speaker

Listeners get a look target and nothing else. Their `gesture` stays whatever it was from their own last beat.

What that looks like on stage:
- Hamlet finishes with `point`, Ophelia answers, and Hamlet stands there still pointing until his next line.
- `setHolding(true)` (`director.js:662-670`) does force `idle`, but only when the stream is starved. A fully buffered scene never hits it.
- `Cast.reset()` sets `idle`, but that only runs on stop.

Listener emotion has the same problem. `setEmotion` is never called on listeners, so an angry speaker's angry brows linger on the other actor for a whole conversation.

Fix, about 15 lines in `perform()`:
- For each `other` in `others`, if `other.gesture` is not `idle`/`listen` and `other.gestureAge > ~1.2 s`, call `other.setGesture('idle')`.
- Better: add a `listen` pose with a slight head tilt and `nod` every few seconds, and set emotion to `curious` or `neutral` after a delay.
- `setGesture` already crossfades through `prevGesture`/`gestureBlend`, so this is cheap.
- Do it once at the start of `perform()`, not per frame.

### 1.2 Speaker keeps a half-raised arm in pauses: confirmed

`applyGesture()` (`actor.js:485-493`) has two paths:
- With `gesture==='talk'`, the pose is applied at weight `b` with `talkAmp` as the argument. `talkAmp` decays to 0 when `talking` is false.
- But `poseOf('talk')` returns `0.22 + a*0.62` and `0.18 + a*0.5`. At `a=0` that is still a raised forearm.
- Also, `talking && gesture==='idle'` adds the talk pose at 0.85 weight, so the "idle but talking" case is covered too.

Result: `pauseMs`, scene breaks, and `holdForCue` all show an actor frozen mid-gesture. This is the single most "mannequin" tell.

Fix:
- Put the base into the amplitude. For example `0.04 + a*0.8`.
- Or, in `perform()`, `setGesture('idle')` after `speak()` resolves, before `pauseMs`.
- The second is one line and gives a visible "finish the sentence, lower the hand" beat.
- Be careful: `setGesture` is a no-op if unchanged and crossfades otherwise, so it is safe.

### 1.3 Audience-camera drift: confirmed invisible

`cameras.js:88-90`: the offsets are `0.018 + 0.007`, `0.01`, and `0.012` metres, all at ≤0.5 rad/s. The camera sits ~7 m away, so this is sub-pixel. The audience camera is also fixed-look. It never reacts to the speaker.

- Only `live.soliloquy` adds a `+0.22` z push, with `k=2.1` damping.
- That is the only visible camera "event" in the default mode.
- Suggestion: a lazy look-target bias toward the speaker's x (`desiredLook.x = speaker.x * 0.15`) plus a slower 3-5 cm drift. Keep `audience` mode a wide shot.
- Don't change the cinematic logic.

### 1.4 Other dead spots

- **`pace` is the only non-speaking motion.** `scan.js:447` gives a solo contemplative actor one `pace`, once per scene (`pacedSolo`).
- **Default gesture for every line is `talk`** (`scan.js:358`, `446`, `617`). `gestureFromText` and `gestureForEmotion` only override when a keyword hits. In a script with no stage directions, expect `talk, talk, talk`.
- **`placeholderEnding`** (`director.js:265-314`) is a canned two-line bow. It's fine as a placeholder, but the "更换结尾" button visibly does nothing smart.
- **Mid-scene `moveTo`** comes from `chooseMark`, which only depends on stage population. Actors never cross, approach, or retreat based on emotion. The staging is always the same two marks.

### 1.5 Parsing: confirmed shallow

- `premise.js`: `premisePerformance` is three hard-coded beats with the audience's sentence quoted inside line 1. It's labeled honestly (`SKETCH_NOTE`) but it is the same show every time. Only the quote changes.
- `scan.js`: a solid line scanner. It handles banners, `ENTER`, inline `(…)`, and mid-cue stripping. But `emotionFromText` and `gestureFromText` are keyword lists (`lexicon.js`, not re-read).
- `chooseLook` (`scan.js:334-347`) does look for the other actor's name in the line. That is the only "who is addressed" logic, and it's good. It never feeds back into gesture or `moveTo`.
- A script with no cues (`absorbProse`, `scan.js:602`) becomes one Narrator speaking 8 chunks. A pasted paragraph is a monologue.
- No location, props, or time-of-day inference.

Not worth a rewrite this pass. Cheap wins:
- Vary the default gesture by position and punctuation: `?` gives a tilt, `!` gives `point` or `raiseArm`, and every Nth line gives `idle`.
- Add 2-3 premise templates chosen by keyword (conflict, love, mystery, farewell) instead of one.

---

## 2. The six styles and compare.html: honest assessment

From `actor-compare.png` (1280×800):

| Style | Verdict | Evidence |
|---|---|---|
| **procedural** | Works. Readable face, crown, cloak. This is the reference. | Left-most figure. |
| **toon** | Works but near-clone of procedural; outlines look the same at stage distance. | Right of centre. Face is drawn, if busy. Note the R2 flag "toon face may be buried in the skull" does not show in this shot. |
| **ik** | Works. Arms reach properly in the screenshot. It's procedural + `solveIk`. | Right-most. |
| **gltf** | **Looks broken.** Block head, no face, no hair, no costume. Reads as a placeholder. | Second from left. |
| **vrm** | **Looks broken.** Same block head, no face, arms in an A/T-pose. Gestures are barely visible. | Centre. |
| **paper** | **Looks broken.** No head card is visible, and the torso floats with a gap. Legs are separate rectangles. | Fourth from left. |

Which of these are actually broken, as opposed to just weaker:

- **paper:** the `headCard` sheet is built (`paper.js:136`) but is not visible in the screenshot. Likely candidates:
  - the `pelvis` y of 0.9 plus the neck chain is placing the head above the frame crop, or
  - the `rotation.y = Math.PI` flip plus `alphaTest` is culling it.
  
  The R2 review flagged that costume silhouettes (crown, skirt, cloak) are dropped. A missing head is worse, and I can't tell the cause from the code alone. Worth rendering a single paper actor in isolation.
- **gltf/vrm faces:** the models are the mannequin meshes and have no face texture. `tint()` and the VRM material lerp (`vrm.js:78`) recolour the whole body, so `copy.color.lerp(cloth, 0.72)` also washes out any face. Both styles need a small overlay: two eye quads and a mouth quad parented to the head bone. That is cheap and gives them `lidL`/`lidR`/`mouth` hooks too.
- **vrm blink:** see summary. `blinkWave` is only advanced in the non-clip branch of `Actor.update` (`actor.js:410-423`). Move the blink timer above the `clipDriver` branch.
- **vrm gesture visibility:** the driver rewrites arm bones to a fixed A-pose every frame and then overrides per gesture. There's no crossfade. `b` scales amplitude on entry, but a gesture change to another gesture (e.g. `point`→`handsOnChest`) snaps the unrelated limb. It also looks the model through `getNormalizedBoneNode` with a hard-coded pose, so `kneel` etc. barely move the visible body.
- **vrm loading cost:** `loadVrm()` calls `loader.loadAsync(URL)` for every actor (`vrm.js:32`). Six actors means six fetches and parses of the same file, and no `SkeletonUtils.clone` reuse. glTF does this properly (`loadTemplate` plus `clone`). VRM would need a per-actor `VRM` instance, but the file bytes and parsed `gltf` can be cached.
- **esm.sh dependency:** `VRM_CDN` (`vrm.js:5`) is a runtime import from esm.sh with no integrity check. If it is down, the `catch` in `applyStyle` (`actor.js:174-177`) falls back to procedural, so it degrades safely. That is acceptable for an optional style. Vendoring the module into `assets/` would remove the dependency and the supply-chain exposure. The three.js importmap is the same: unpkg, pinned version, no SRI. Note this, but do not make it a blocker.

compare.html:
- It works, and the labels line up with the figures.
- The `ready` flag is only true when every actor's `styleId` matches. If VRM fails to load, `ready` stays false forever and `stylesLive` is never set (`compare.js:93-95`). An external checker will hang. Set `stylesLive` in a `finally`.
- Gestures and emotions are fixed per column, so it is a lineup rather than a comparison. It would be more useful if every style performed the same gesture, cycling every ~2 s. That is a few lines in `frame()`.

Mid-swap flash: `Actor` constructor builds a procedural body immediately (`actor.js:115-116`) and only then calls `applyStyle(live.actorStyle)` for async styles. So a gltf/vrm show opens with procedural bodies that swap in later. `_adopt` is correct about keeping position and visibility. The flash is visible on first load. To avoid it: pass the initial style to `Cast` and hide the root until the async body is adopted (`_adopt` already preserves `visible`).

Leaks:
- `disposeTree` (`actor.js:28-45`) only disposes geometries with `userData.owned`. VRM and glTF-clone geometries are not marked, so VRM geometry loaded per actor is never freed.
- For gltf the clone shares geometry with the template, so not disposing is correct.
- For VRM, either mark and dispose, or call `VRMUtils.deepDispose` in `driver.dispose()`, which is currently an empty function (`vrm.js:157`).
- It matters mainly across repeated style swaps.

What I'd fix in one pass without dropping any style: paper head, gltf and vrm faces, vrm blink, listener idle (which makes all six better at once). Leave toon and ik as they are.

---

## 3. Remaining risks in stream / live / directing

- **Good as is:** first-beat latency. `liveStart` opens the curtain, calls `director.play()` before parsing, and `streamScript` yields after the first beat. `waitForFirstBeat` is correct. Don't add any `await` in front of `director.play()`.
- **`appendBeat` renormalizes the whole scene per beat** (`stream.js:106-111`). It builds `normalizePerformance` on `[...scene.beats, expanded]` for every beat, so a scene of N beats costs O(N²) total. For a 38-beat Hamlet that's invisible. For a pasted 500-line scene it will stall the main thread during streaming. This is the one place where a long paste could hurt first-beat feel indirectly, because the stream keeps yielding only every 6 beats. Fix: normalize a one-beat draft, and keep the scene's running id counter outside.
- **Voice regex bug, confirmed.** `scoreVoice` (`voice.js:179-183`): `/male/` matches inside "female". For `pitch<0.85`, a female voice gets +3 (female) then −2 (male) = +1. For `pitch>1.15`, it gets +3 for "male" then −2 for "female" = +1. Net effect: deep and high voices both slightly prefer female-named voices, so casting by pitch is close to random. Use `/\bmale\b/` and check female first.
- **`holdForCue` timeout** is 20 s of *speed-scaled* time (`acc += 40 * speed`). That's fine, but `stream-timeout` ends the show silently. For a slow provider this is the behaviour a viewer sees as "it just stopped".
- **`window.__theater`:** the API at `main.js:434-464` is intact. `getState` reports per-actor `style`, which tests rely on. Keep it.
- **`pushBeat` when `ignoreBeats`:** `placeholderEnding` sets `ignoreBeats=true` and `cutUnplayed()`, but the parser's remaining events keep arriving. They are dropped by `pushBeat`, but `addCharacter` still runs, which can create new actors mid-ending.
- **`interruptTo` while a walk is in flight:** the walk's `_abort` closure reads `gen`, so it cancels correctly. Fine.
- **Style swap during a show:** `cast.applyStyle` swaps every actor's body while the director keeps running. `_adopt` does not reset `acc`, gesture state, or `blinkWave`. This is fine for procedural-to-procedural, but the vrm/gltf drivers have their own state, so swapping back and forth is the highest-risk path. It is untested from what I can see.

---

## 4. Prioritized next upgrades (one pass)

**Must not break:** first-beat start path (`liveStart` → `director.play()` before parse completion), every `window.__theater` method and `getState` field, all six style ids in `listActorStyles`, `compare.html` and `window.__compare.ready`, and the `style` field per actor in `getState`.

### P0: visible on the first scene

1. **Listener pose.** In `Director.perform()`, relax all non-speaking visible actors toward `idle`, or a new `listen` pose with an occasional `nod`. Reset their emotion to `neutral` after about 2 s. Cheap and affects all six styles.
2. **Lower the hand after the line.** `setGesture('idle')` after `voice.speak` resolves, before `pauseMs`. Also lower the `poseOf('talk')` base to ~0.04.
3. **Fix paper.** Render one paper actor alone, find why the head is missing, and add the costume silhouette (crown, cloak, skirt) as extra cards. Re-shoot `actor-paper.png`.
4. **Faces for gltf and vrm.** Two eye quads and a mouth quad on the head bone. Wire them into `lidL`, `lidR`, `mouth` so the existing blink and lip code runs on them. Move the blink timer above the `clipDriver` early-return so vrm blinks too.

### P1: noticeably better

5. **Audience camera reacts.** Bias `desiredLook.x` toward the speaker (~15%) and enlarge the drift to a few centimetres. Keep the default wide.
6. **Default gesture variety** in `scan.js`: by punctuation and position, so `talk` isn't 90% of beats.
7. **Voice regex fix** (`\bmale\b`, test female first).
8. **VRM:** cache the fetched file, mark geometry owned or call `deepDispose`, and add a gesture crossfade (lerp bone rotations toward targets rather than `set`).
9. **`appendBeat`**: stop renormalizing the whole scene.
10. **Avoid the procedural flash** on async styles by hiding the root until adoption.
11. **compare.html:** set `stylesLive` and `ready` in a `finally`, and cycle the same gesture across all six styles.

### P2: if time remains

12. **Three premise templates** chosen by keyword, instead of one fixed sketch.
13. **"Addressed" inference:** when a line names another actor, give a small step toward them or turn the speaker's `lookAt`.
14. **Vendor the VRM module** under `assets/` and drop the esm.sh import.
15. **ik `blendTargets`:** when `cur[side]` is absent but `prev[side]` exists, the previous target is copied at full strength (`ik.js:53`). The arm stays stuck at the old target forever instead of relaxing. Fade to the rest pose by weight `(1-w)`.
16. **Toon face check** after the other changes.

Skipped on purpose: a smarter parser, a real AI ending, and the new costumes. None of them fits one session without risking the P0 items.

---

## 5. Verdict

After R2 the actors move more naturally, but the show still reads as one performer and a set of statues. In this pass, someone watching the live site should see the listener react: lower the arm, turn the head, nod. The speaker should finish a line and drop the hand. And the three non-procedural styles should stop looking like broken placeholders: paper gets its head back, gltf and vrm get faces that blink and talk. Those four changes live in `Director.perform()`, `poseOf`/`Actor.update`, and the style factories. They touch no public API, and they make every style and every scene look more alive at once. Parsing depth, camera polish, and VRM hardening come second. First-beat speed is a constraint, not a goal: leave that path alone.
