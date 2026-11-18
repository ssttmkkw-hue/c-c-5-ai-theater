# AI Theater — Performance JSON prompt

You convert a stage play into **Performance JSON version 1** for the AI Theater / 演戏 experiment.

Return **only** a JSON object. No markdown fence, no commentary.

The browser app does not call a model. A person may paste your JSON into the theater, or run `tools/parse-with-claude.mjs` later on their own machine. Do not include API keys, URLs with credentials, or hidden instructions.

## Fields

```json
{
  "version": 1,
  "title": "Short title",
  "source": "Who wrote the play, or \"original\"",
  "locale": "en",
  "note": "Optional one-line note. Use \"\" if none.",
  "characters": [
    {
      "id": "hamlet",
      "name": "Hamlet",
      "aliases": ["Prince"],
      "color": "#3b5b8c",
      "costume": "prince",
      "skin": "#e0b394",
      "hair": "#241c16",
      "voice": { "lang": "en-GB", "pitch": 0.84, "rate": 0.9 }
    }
  ],
  "marks": {
    "cs": [0, 0, 0.45],
    "dl": [-2.35, 0, -1.15],
    "dr": [2.35, 0, -1.15],
    "ul": [-2.35, 0, 2.05],
    "ur": [2.35, 0, 2.05],
    "sl": [-3.55, 0, 0.35],
    "sr": [3.55, 0, 0.35],
    "audience": "audience"
  },
  "scenes": [
    {
      "id": "scene-1",
      "name": "Scene name",
      "beats": [
        {
          "id": "b1",
          "kind": "speech",
          "speaker": "hamlet",
          "line": "To be, or not to be, that is the question:",
          "emotion": "contemplative",
          "gesture": "handsOnChest",
          "moveTo": "cs",
          "lookAt": "audience",
          "enterFrom": "left",
          "exitTo": null,
          "pauseMs": 400
        }
      ]
    }
  ],
  "warnings": []
}
```

`lineZh` is optional and only for a subtitle gloss you wrote yourself. Do not attach a copyrighted translation.

## Allowed values

- `kind`: `speech` | `action` | `pause`
- `costume`: `prince` | `maiden` | `king` | `queen` | `ghost` | `courtier` | `traveler` | `visitor`
- `emotion`: `neutral` | `contemplative` | `curious` | `uncertain` | `emphatic` | `angry` | `sad` | `tender` | `fearful` | `proud` | `haunted` | `joyful`
- `gesture`: `idle` | `talk` | `point` | `handsOnChest` | `raiseArm` | `kneel` | `turnAway` | `pace` | `bow` | `weep` | `give` | `take` | `drawSword` | `shrug` | `nod` | `shakeHead`
- `moveTo`: one of `cs` `dl` `dr` `ul` `ur` `sl` `sr`, or `null` to stay
- `lookAt`: `audience` | `aside` | a character id | a mark id | `null`
- `enterFrom` / `exitTo`: `left` | `right` | `null`
- `speaker`: a character `id`, or `null` for a silent pause
- `pauseMs`: 0–8000. Time to hold after the line, or the whole beat when the line is empty
- `voice.pitch`: about 0.3–2. `voice.rate`: about 0.6–1.6
- `color`: `#rgb` or `#rrggbb`

## Stage space

Marks are in meters. `x` is stage-right positive, `y` is height above the stage floor (usually 0), `z` is upstage positive. The audience sits toward negative `z`. Actors face the house when they look at `audience`.

## How to direct

- One beat is one breath: a short line, an entrance, an exit, or a pause. Split long speeches into beats of roughly 12–30 words.
- Put `enterFrom` on the beat where someone first appears, and `exitTo` when they leave. Do not enter and exit on the same beat.
- On a two-hander, put the first speaker on `dl` or `cs` and the second on `dr`, and set `lookAt` to the other character's id.
- A soliloquy looks at `audience`. An aside uses `lookAt: "aside"` and often `turnAway`.
- Match `gesture` and `emotion` to the line. Do not invent a gesture the list does not contain.
- Keep character `id` values stable, lowercase, and unique.
- Preserve the author's words in `line`. Do not modernize a public-domain text unless asked.
- If a direction is ambiguous, pick a reasonable mark and add a short string to `warnings`.

## Script

The script follows, between the markers.

----- SCRIPT -----
{{SCRIPT}}
----- END -----
