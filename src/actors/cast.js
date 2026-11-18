import * as THREE from 'three';
import { Actor } from './actor.js';
import { AUDIENCE_LOOK, MARKS, STAGE_Y, WINGS, markWorld } from '../stage/layout.js';
import { live } from '../runtime/live.js';

const _head = new THREE.Vector3();
const _other = new THREE.Vector3();
const _aside = new THREE.Vector3();
const _mark = new THREE.Vector3();

export class Cast {
  constructor(scene) {
    this.scene = scene;
    this.actors = new Map();
  }

  sync(characters) {
    for (const actor of this.actors.values()) actor.dispose();
    this.actors.clear();
    (characters || []).forEach((character, index) => {
      const actor = new Actor(character);
      const wing = index % 2 === 0 ? WINGS.left : WINGS.right;
      actor.snap(wing.x, wing.z);
      actor.setVisible(false);
      this.scene.add(actor.root);
      this.actors.set(character.id, actor);
    });
  }

  get(id) {
    return this.actors.get(id) || null;
  }

  add(character) {
    if (!character?.id) return null;
    if (this.actors.has(character.id)) return this.actors.get(character.id);
    const actor = new Actor(character);
    const wing = this.actors.size % 2 === 0 ? WINGS.left : WINGS.right;
    actor.snap(wing.x, wing.z);
    actor.setVisible(false);
    this.scene.add(actor.root);
    this.actors.set(character.id, actor);
    return actor;
  }

  replace(character) {
    const prev = this.actors.get(character.id);
    if (!prev) return this.add(character);
    if (prev.visible) return prev;
    const { x, z } = prev;
    prev.dispose();
    this.actors.delete(character.id);
    const actor = new Actor(character);
    actor.snap(x, z);
    actor.setVisible(false);
    this.scene.add(actor.root);
    this.actors.set(character.id, actor);
    return actor;
  }

  visibleList() {
    return [...this.actors.values()].filter((a) => a.visible);
  }

  reset() {
    let i = 0;
    for (const actor of this.actors.values()) {
      const wing = i % 2 === 0 ? WINGS.left : WINGS.right;
      i += 1;
      actor.setTalking(false);
      actor.setGesture('idle');
      actor.setEmotion('neutral');
      actor.snap(wing.x, wing.z);
      actor.setVisible(false);
      actor.lookRef = 'audience';
      actor.holdingCue = false;
    }
    live.speakerId = null;
    live.soliloquy = false;
    live.clapping = false;
  }

  async applyStyle(style) {
    await Promise.all([...this.actors.values()].map((actor) => actor.applyStyle(style)));
  }

  update(dt) {
    const speaker = live.speakerId ? this.actors.get(live.speakerId) : null;
    if (speaker && speaker.visible) {
      speaker.headWorld(_head);
      live.speakerHead.x = _head.x;
      live.speakerHead.y = _head.y;
      live.speakerHead.z = _head.z;
    }
    for (const actor of this.actors.values()) {
      if (!actor.visible) continue;
      actor.setLook(this.resolveLook(actor, speaker));
      actor.update(dt);
    }
  }

  resolveLook(actor, speaker) {
    const ref = actor.lookRef;
    if (ref === 'speaker' && speaker && speaker !== actor) {
      return live.speakerHead;
    }
    if (ref && ref !== 'audience' && ref !== 'aside' && this.actors.has(ref)) {
      const other = this.actors.get(ref);
      if (other.visible && other !== actor) {
        other.headWorld(_other);
        return _other;
      }
    }
    if (ref === 'aside') {
      _aside.set(actor.x + (actor.x >= 0 ? -1.8 : 1.8), STAGE_Y + 1.35, actor.z - 0.3);
      return _aside;
    }
    if (ref && MARKS[ref]) {
      const m = markWorld(ref);
      _mark.set(m.x, STAGE_Y + 1.45, m.z);
      return _mark;
    }
    return AUDIENCE_LOOK;
  }
}
