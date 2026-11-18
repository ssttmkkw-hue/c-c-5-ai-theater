# Actor assets / 演员素材

Everything under `assets/actors/` was drawn or generated for this repository.
No downloaded character, texture, or motion clip is included.

`assets/actors/` 里的东西都是为本仓库画的或生成的。没有下载的角色、贴图或动作片段。

## glTF / `assets/actors/gltf/`

| | |
| --- | --- |
| Files | `theater-figure.gltf`, `theater-figure.bin` |
| Author | AI Theater / 演戏 |
| Source | `tools/make-actor-assets.mjs` (original boxes, skin, and clips) |
| License | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Date | 2026-11-19 |
| Changes | Created here. Not a conversion of Mixamo, Kenney, or Quaternius data. |

The figure is a low-poly skinned humanoid (hips, spine, chest, neck, head, arms, legs).
Clips: `idle`, `walk`, `talk`, `point`, `handsOnChest`, `raiseArm`, `kneel`, `bow`, `give`, `weep`.
`src/actors/styles/retarget.js` can rename Mixamo-style tracks onto these bones. No Mixamo file is shipped.

## VRM / `assets/actors/vrm/`

| | |
| --- | --- |
| File | `theater-cc0.vrm` |
| Author | AI Theater / 演戏 |
| Source | `tools/make-actor-assets.mjs` |
| License | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Date | 2026-11-19 |
| Changes | Original T-pose mannequin with `VRMC_vrm` 1.0 humanoid bones, seven expression morphs, and bone look-at. |

The VRM meta `licenseUrl` is the CC0 deed. The loader is told to accept that URL.
This is not a VRoid Hub model and not a pixiv sample avatar.

## Not vendored / 没有放进仓库的

Searched 2026-11-19 and left out on purpose:

- **Quaternius Universal Base Characters** — the pack page says CC0, and the free zip is large (~122MB). A secondary note said the publisher site license text changed in 2026. The enclosed `License.txt` was not downloaded and checked here, so the mesh was not copied.
- **Kenney** Animated Characters, Blocky Characters, Mini Characters — CC0 on the author pages. Several packs are FBX-first. Left out so the default page does not depend on someone else's rig names, and so costumes stay tinted from the Performance JSON color.
- **Poly Haven** — HDRIs, textures, and models, not a humanoid we could drop on this stage with a clear actor license in one small file.
- **Khronos glTF-Sample-Models** — sample rigs exist; they are not a cast of actors and were not copied.
- **Mixamo** — clips are not redistributable with this public repo. The retarget map is code only.
- **VRoid Hub / VRoid presets** — Hub cannot set CC0, and enabling third-party use overwrites the license. AvatarSample A–Z is explicitly not CC0 and forbids redistributing the file as CC0. The older beta samples are described as CC0 on a pixiv help page, but there was no stable raw file to vendor without pulling a full VRoid mesh, so they were not added.

## Code that is not vendored / 未打包进仓库的代码

`@pixiv/three-vrm@2.1.0` is loaded from `https://esm.sh/@pixiv/three-vrm@2.1.0?external=three` only when the VRM style is selected.
It is MIT, and it is pinned to a release whose peer dependency is Three `^0.160.0`, the same import map as the rest of the page.
Three itself stays on the existing `three@0.160.0` import map.
