# AI Theater / 演戏: Review R2

I did this review by reading code only (`actor.js`, `rig.js`, `styles/*`, `compare.js`, `director.js`, `live.js`, `premise.js`, `cameras.js`, `voice.js`, `main.js`, and the docs and licenses). I ran nothing and looked at no screenshots, so every "feels" claim below is inferred from the code. I flag the places where I would want a screenshot before trusting my own reading.

## 中文摘要

- **P0 手感修复:方向对,但只修了说话的人。** 交叉淡入(`setGesture` 里的 `prev*` 字段)、眉毛、瞳孔跳视都是真的改动。但从座位上看,"死"的来源已经转到别处了:
  - **听的人永远定格在上一个手势。** `director.perform()` 只给说话者设手势,没有任何地方在对话结束后把听者放回 `idle`。跪下、指人、鞠躬会一直保持到他下次开口。
  - **说话者在停顿里也举着"talk"手臂。** `poseOf('talk')` 在 `talkAmp=0` 时右臂基础值是 0.22/0.18 rad,所以安静时手臂是半举着的。
  - **观众机位漂移几乎看不见。** 漂移 1–2 厘米,在 7 米外约 0.15°。
- **六种样式:确实不一样,但质量参差。**
  - `procedural` 和 `ik` 是同一个身体。
  - `toon` 很可能把脸埋进头里了:眼睛、瞳孔、眼睑、鼻子、嘴按几何计算都在放大后的头壳之内。**这点建议先看截图确认。**
  - `ik` 有 bug:手势结束后手臂会卡在上一个目标。
  - `paper`、`gltf`、`vrm` 都丢掉了服装轮廓(王冠、裙子、斗篷、鬼魂透明)。
  - `vrm` 不会眨眼,也没有手势交叉淡入。
- **默认 `procedural`:同意。** 但理由应该是"它是唯一完整的",而不是"别的更差一点"。
- **直播路径:** 首拍很快是实话,但有几处风险。premise 草稿的台词仍在谈论"这一句";风格切换发生在中途时,新上场的演员会先出现一具程序化身体、再弹成别的样式;VRM 依赖 esm.sh 且无完整性校验。
- **结论:** 可以给主人看,作为本地可玩的实验。前提是把下面 P1 的三处改掉,并且口头说明"toon 样式待核对"。

---

## 1. Did the P0 feel fixes address the stiffness?

**Partly.** The mechanisms are real:

- **Gesture crossfade.** `Actor.setGesture` (`actor.js:235`) snapshots `prevGesture`, `prevBlend`, `prevAge` and `prevTalkAmp`. `applyGesture` (`actor.js:485`) blends the old pose out by `(1-b)*prevBlend` while the new one comes in. This does remove the snap-to-idle between two gestures. Good.
- **Brows and pupils.** `applyBrows` and `applyPupils` have a sensible table and clamped, damped saccades. Brow tilt of 0.3–0.5 rad on a 0.11 m box is visible at 7 m, though only barely at the low end (`proud` is 0.2, `tender` is −0.12). The pupil range is ±0.022 m on a 0.045 m eye, so the saccades are subtle.
- **Auto-enter from wings.** `director.js:566` sends a fresh entrance to `dl` or `dr`, so the line no longer starts from the wings. Good.

**What still feels dead from the seats:**

1. **Listeners never come back to idle.** `setGesture` is called at `director.js:550` (speaker), `:258`, `:602` (exit) and `:668` (hold). Nobody resets the listener's gesture. After "kneel", "point", "bow" or "weep", the listener holds that pose through the other actor's whole speech, until they next speak. In a two-hander this is the most visible deadness. Fix: on `perform()`, after the speaker's line ends, set the speaker back to `idle` (or a `listen` pose), and set other visible actors to `idle` when a new speaker starts.
2. **The "talk" pose is a held pose even when not talking.** `poseOf('talk')` (`actor.js:623`) gives `shoulderR: 0.22 + a*0.62` and `elbowR: 0.18 + a*0.5`. At `a=0`, which is every pause (`pauseMs`) after a line, the right arm stays half-raised. Combined with point 1, a character who finished talking keeps a half-raised arm indefinitely.
3. **`talkAmp` is a random-number twitch.** `updateTalk` (`actor.js:463`) picks a new target every 0.28–0.7 s with no link to the words. It reads as a metronome "speaking arm". The `onboundary` callback already feeds `pulseLip`; it could drive arm beats too, but it's unreliable on many engines.
4. **Camera drift is invisible.** `cameras.js:88` uses 0.018 m and 0.007 m amplitudes. At the audience camera's roughly 7 m distance that is about 0.15°. Nobody will notice. The soliloquy push (`oz += 0.22`) is the only camera motion a viewer can see.
5. **Body yaw rate is slow by design (0.75/s for small gaps).** This is fine for "turning the head first", but with the body 0.4 rad off for about a second it can look like a lag rather than a choice.
6. **No weight shift, no breathing at a readable scale.** `applyIdle` is ±0.05 rad on the spine. Real stillness-with-life needs foot shifts or a weight transfer. This is probably the biggest remaining "mannequin" cue after listener freezing.

## 2. The six styles, honestly

| Style | Does it really differ? | Problems found |
|---|---|---|
| `procedural` | The reference. | Joints are fully driven. Costumes (`dress`) give eight distinct silhouettes. This is the only style where all of the P0 face work applies. |
| `ik` | Barely differs from `procedural`: same body, arms replaced by a two-bone solve. | **Bug:** `blendTargets` (`ik.js:43`) uses `(a || p).slice()` at full strength. When going from a targeted gesture to `idle` (which has no target), `prev` holds the old target at weight 1 forever. After "handsOnChest" → idle, or "talk" → idle, the arm stays at the old target until the next `setGesture`. Also there is no fade-in when only `cur` has a side. So IK actually has *worse* blending than the procedural crossfade it sits on top of. Elbow pole is a fixed vector, so folds are plausible but not guaranteed. |
| `toon` | Visually different in principle (cel bands, outline shells). | **Probably buried face.** In `rig.js:158-162` the skull is scaled 1.14/1.04/1.10 but the eyes, pupils, lids, nose and mouth keep their procedural positions. By my arithmetic, the eye at (±0.08, 0.04, −0.17) relative to the skull center sits at ellipsoid distance ≈0.57 (inside); the pupil front at z≈−0.226 is ≈0.92 (still inside). Lids, nose and mouth are inside too. Only brows barely poke out. So a toon actor would have a blank face and brows. **Please verify on `compare.html`.** Also, outline shells for lids and mouth (`mesh()` at `rig.js:96`) are not scaled with the animated parts, so blink and jaw would leave dark ghost boxes if the face is exposed. |
| `paper` | Genuinely different: flat cards, ink face, same pose table. It's the only style that reads as a deliberate choice. | The face is a static painted card, so brows are 3-D boxes floating on it and the mouth is a plane; expect mixed styles. No costume (crown, skirt, cloak, ghost transparency all lost). Cards are `DoubleSide` with `rotation.y = π`, so check the back view. Texture and geometry dispose is handled (`userData.owned`). |
| `gltf` | Different: skinned, clip-driven, adult proportions. | No face (no lids, mouth, pupils: all `null`), so the P0 face work doesn't apply. No costume: everyone is one tinted blockman, so a king and a maiden look the same. No walk-to-gesture layering (one clip at a time, 0.25 s fade). Gesture clips set to `LoopOnce` clamp, so a repeated gesture name never replays (but `setGesture` already ignores repeats). `clipDriver` path returns before blink code (`actor.js:362-373`), so no blinking either. |
| `vrm` | Different on paper (expression morphs, humanoid bones). | **Never blinks:** `blinkWave` is only advanced in the non-clip path, after the early `return` at `actor.js:372`, so `driver.update` reads a constant 0. **No crossfade at all:** gestures are set from the rest pose by `b` (`vrm.js:102-124`), so every gesture change goes through the rest pose first, which is exactly the R1 "snap-back" problem again. **`talkAmp` is never updated** in the clip path (`updateTalk` is skipped), so `actor.talkAmp || 0.3` is a constant. Expressions are set instantly (`setValue(…,0)` then new weights), so emotions pop. `dispose()` is empty and the VRM isn't deep-disposed on swap (GPU leak). No costume. |

**Costumes are the biggest cross-cutting loss.** `docs/ACTOR_MODELS.md` says "every costume color is just a material", which is only true for the three rig-based styles. For `paper`, `gltf` and `vrm`, the director's `costume` field, which the whole casting story depends on, does nothing. That also means the ghost (transparent, glowing) costume is not a ghost in half the styles.

**Do the styles differ meaningfully?** Visually: `procedural`, `toon`, `ik` look alike; `paper`, `gltf`, `vrm` are distinct. In *motion*, only `paper` and `gltf` differ much from the baseline. So the honest count is about three real alternatives, not five. The `ik` one is also the only style whose point is to look different *in motion*, and it is currently the one with the blending bug.

**License hygiene: good, with two notes.**
- The CC0 claim holds, because every asset is generated by `tools/make-actor-assets.mjs` and the decision not to vendor Mixamo, VRoid or Quaternius is the right one. The write-up of what was searched and why each was skipped is honest and useful.
- Note 1: `@pixiv/three-vrm` is loaded from esm.sh with no integrity pin. A version in the URL is not a hash, and esm.sh rebuilds. If a "public" deploy is ever considered, vendor it or drop VRM.
- Note 2: `retarget.js` maps Mixamo names that the shipped clips don't use. That is harmless but dead code that invites someone to drop a Mixamo clip in later. It should say "unused" in a comment.

**Default = procedural: agree.** It is the only style where face, costumes, gestures and IK-free blending all work together, and it needs no network. But the docs' rationale ("fastest first line") undersells the real reason: it is the only complete one. The doc's Stiffness column ("Medium") is also generous given point 1 and 2 above.

## 3. Remaining risks in the stream, live and directing path

1. **Style swap mid-show pops.** `Actor`'s constructor (`actor.js:118`) calls `applyStyle` asynchronously when `live.actorStyle` differs, so a new actor added by `cast.add` during a stream is visible with the procedural body first and swaps to gltf/vrm after the fetch. For `vrm` that's an esm.sh round trip, possibly mid-line. Either delay `setVisible(true)` until the body is ready, or preload in `loadPartial`.
2. **Offline or CDN failure is silent for VRM.** The fallback to procedural (`actor.js:174-176`) works, but the panel still says "vrm", and `getState().actorStyle` stays `vrm`. Surface the failure.
3. **Premise sketch is still meta, just quieter.** `premise.js` no longer says "we are a sketch", but the lines are "You handed me this: <premise>" and "we follow the sentence, and see where it leads". That is still characters addressing the audience's prompt as a prompt. The same three beats are used for every input, so the show is not about the premise at all. If the premise ends in a period, the text reads "…premise.. I will…" (`${premise}.` after a clipped string). Chinese premises are inserted verbatim, which can look odd.
4. **Beats with no `gesture` keep the last gesture.** `setGesture(beat.gesture || 'talk'|'idle')` is fine for the speaker, but see §1.1 for everyone else.
5. **`holdForCue` timeout (20 s of scaled time).** It sets the stream as ended with a warning. If an LLM stalls, the show silently ends. Reasonable, but the audience sees nothing and only the warnings list records it. A visible "the actors wait" cue exists (`setHolding`), but a timeout looks like a normal ending.
6. **`appendBeat` renormalizes the whole scene on every beat** (`stream.js:106-111`), which is O(n²) over a scene. Fine for tens of beats, not for long streams.
7. **`voice.js:180-183`** `/male/` also matches "female", so the gender scoring partly cancels itself. Low priority, but it affects casting of voices.
8. **`liveStart` swallows parse errors into `ai-fallback-error`** and then `end`, which is good for not hanging, but it does so for every exception, including bugs in the code. Log it.
9. **Disposal on style swap leaks geometry.** `disposeTree` only disposes geometries marked `userData.owned`, but `dress()` and `limbGeo()` in `rig.js` create new unmarked geometries per actor, so each swap or sync leaks them. Minor for a local experiment.

On the "first beat in ~6 ms in Playwright" claim: believable, since local premise and sample paths run synchronously. It says nothing about a real LLM path, which hasn't been measured here.

## 4. Next experiments (short, prioritized, mutually different)

1. **Listening pose + gesture reset (an hour, biggest effect on feel).** After a line, speaker goes to `idle` unless the beat says otherwise; other actors drop to `idle` when someone else starts speaking. Fix `blendTargets` in `ik.js` to weight a prev-only target by `(1-w)`. Check it by watching a two-hander for 30 seconds.
2. **A screenshot check of every style from the seats.** Capture `compare.html` at the default camera and fix what you find, starting with the toon face (move features outward by the scale factor, or don't scale the skull). This is the cheapest way to turn my arithmetic into a fact.
3. **One dramatically stronger canned scene instead of the 3-beat sketch.** Authored subtext, one reversal, a silence of a few seconds, and one entrance and one exit. It tests whether the *writing* is what's dead, which is probably the next bottleneck after #1.
4. **Camera that earns its keep.** Make `cinematic` the default for the first 3–4 beats, or cut to a two-shot on a reaction. Drift of 1–2 cm should be replaced by something readable (a slow 20–30 cm push on an emotional beat), or removed.
5. **Costume carry-over to `paper` and `gltf` (or relabel them).** Either add crown and skirt attachments keyed off `costume`, or mark those two as "comparison only" in the panel so the owner doesn't judge the show by them.
6. **Sound.** Room tone, footsteps tied to `walkPhase`, and soft applause on `sceneBreak`. This is a different axis from visuals and likely to change the "dead" feeling more than any rig change, since silence between TTS lines is currently literal silence.

## 5. Verdict

Yes: this is decent enough to show the owner as a **local, playable experiment** (not a public deploy). The pipeline is solid. The stream path starts fast, the director handles interruptions and holds without hanging, there are six selectable bodies behind one JSON format, and the asset licensing is cleaner than most prototypes manage. What the owner will notice in the first two minutes is not the style count but the people on stage: the listener frozen in the last gesture, the half-raised talking arm in pauses, and the generic premise lines. Fix those three (§4.1, §3.3, and the toon face check) before the demo, say plainly that `toon`, `vrm` and `ik` are experiments with known gaps, and don't oversell the style switcher as the feature; the quality of the acting is.
