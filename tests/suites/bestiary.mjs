// Suite: what a creature is besides its hit points — on a real page.
//
// The laws are pure and are checked in `tests/unit/bestiary.test.mjs`; what only a page can
// answer is that they reach the player: a steel blade that says *why* it cannot bite a fire
// daemon, a mithril one that can, a ward's points eaten before health, a fire resistance that
// halves a burn and leaves a cold blow whole, invisibility that a rat believes and a wraith
// does not, and a troll that closes its own wound while the player watches.
//
// Everything here is UESP's `Arena:Monsters` abilities lines, read 2026-10-17 and kept in
// `game/bestiary.js`. The page is a dungeon (`?dungeon=Stonekeep`) because a dungeon is where
// the bestiary lives.

import path from 'node:path';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

export function makeBestiarySuite({ check, realErrors, shots, getPort }) {
  return async function suiteBestiary(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;

    await page.goto(`http://localhost:${PORT}/?dungeon=Stonekeep&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'Stonekeep', timeoutMs: 60000 });
    await page.evalJs('window.__debug.pause(true)');
    await page.evalJs('window.__debug.heal()');

    // ── the level's own field, before any probe touches it ────────────────────
    // **Human Enemies** are UESP's second bestiary section (D-67): a dungeon fields them at
    // the player's own level, in any class and race. Read off the spawn rather than the table,
    // because the table is exactly what a caller can get wrong.
    const locals = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.combat().monsters.filter((m) => m.kind === "human"))'));
    const playerLevel = await page.evalJs('window.__debug.combat().player.level');
    check('the dungeon fields Human Enemies, of a real class and race, at the player\'s level',
      locals.length >= 1
        && locals.every((m) => m.human?.className && m.human?.raceName && m.human?.ability)
        && locals.every((m) => Math.abs(m.level - playerLevel) <= 1),
      `${locals.length} of the level's foes: ${locals.map((m) => `${m.name} (${m.level})`).join(', ')}`);

    // ── a metal under the floor says so ────────────────────────────────────────
    await page.evalJs('window.__debug.giveItem("steel-longsword")');
    await page.evalJs('window.__debug.equip("steel-longsword")');
    const daemon = await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("firedaemon")))()');
    const daemonSpawn = JSON.parse(daemon);
    const daemonIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${daemonIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    const steelBlow = await page.evalJs('JSON.stringify(window.__debug.strike())');
    const refused = JSON.parse(steelBlow);
    const daemonHealth = await page.evalJs(`window.__debug.combat().monsters[${daemonIndex}].health`);
    check('a steel blade cannot bite a fire daemon, and the fight says which metal it needs',
      refused?.immune === true && /mithril/i.test(refused?.reason ?? '') && daemonHealth === daemonSpawn?.maxHealth,
      `${daemonSpawn?.name} ${daemonHealth}/${daemonSpawn?.maxHealth} · ${refused?.reason}`);

    // ── and a mithril one can ───────────────────────────────────────────────────
    await page.evalJs('window.__debug.giveItem("mithril-longsword")');
    await page.evalJs('window.__debug.equip("mithril-longsword")');
    let landed = null;
    for (let i = 0; i < 24 && !landed; i++) {
      await page.evalJs('window.__debug.advance(0.6)');
      const blow = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.strike())'));
      if (blow?.hit) landed = blow;
    }
    const hurtHealth = await page.evalJs(`window.__debug.combat().monsters[${daemonIndex}].health`);
    check('a mithril blade does bite it, and the wound lands',
      Boolean(landed) && hurtHealth < daemonSpawn?.maxHealth,
      `${daemonSpawn?.maxHealth} → ${hurtHealth} · ${landed ? `${landed.damage} damage` : 'no blow landed'}`);
    await page.evalJs(`window.__debug.damageEnemy(${daemonIndex}, 10000)`);

    // ── a ward is points, spent before health ──────────────────────────────────
    await page.evalJs('window.__debug.heal()');
    await page.evalJs('window.__debug.giveItem("scroll-shield")');
    await page.evalJs('(async () => window.__debug.use("scroll-shield"))()');
    const warded = await page.evalJs('JSON.stringify(window.__debug.state().magic)');
    const wardState = JSON.parse(warded);
    const before = await page.evalJs('window.__debug.player().health');
    const through = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.hurt(20, "a test blow"))'));
    check('Shield raises a ward, and the ward eats the blow before the body does',
      wardState?.ward >= 15 && through.health === before - (20 - wardState.ward) && through.magic.ward === 0,
      `ward ${wardState?.ward} · health ${before} → ${through.health} · ward now ${through.magic?.ward}`);

    // ── a resistance is the element's own ──────────────────────────────────────
    await page.evalJs('window.__debug.heal()');
    await page.evalJs('window.__debug.giveItem("potion-resist-fire")');
    await page.evalJs('(async () => window.__debug.use("potion-resist-fire"))()');
    const fireBefore = await page.evalJs('window.__debug.player().health');
    const burned = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.hurt(20, "a burn", { element: "fire" }))'));
    const frozen = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.hurt(20, "a freeze", { element: "cold" }))'));
    check('Resist Fire takes a third off a fire blow and nothing off a cold one',
      burned.health === fireBefore - 14 && frozen.health === burned.health - 20,
      `fire ${fireBefore} → ${burned.health} (${fireBefore - burned.health} through) · cold → ${frozen.health}`);

    // ── invisibility: what believes it, and what does not ─────────────────────
    await page.evalJs('window.__debug.heal()');
    await page.evalJs('window.__debug.giveItem("potion-invisibility")');
    await page.evalJs('(async () => window.__debug.use("potion-invisibility"))()');
    const hidden = await page.evalJs('window.__debug.state().magic.invisible');
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("rat")))()');
    const ratIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${ratIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    await page.evalJs('window.__debug.advance(0.2)');
    const ratSees = await page.evalJs(`window.__debug.combat().monsters[${ratIndex}].sees`);
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("wraith")))()');
    const wraithIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${wraithIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    await page.evalJs('window.__debug.advance(0.2)');
    const wraithSees = await page.evalJs(`window.__debug.combat().monsters[${wraithIndex}].sees`);
    check('invisibility hides the player from a rat and not from a wraith',
      hidden === true && ratSees === false && wraithSees === true,
      `rat sees ${ratSees} · wraith sees ${wraithSees}`);

    // ── a troll closes its own wound ──────────────────────────────────────────
    await page.evalJs('window.__debug.pause(true)');
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("troll")))()');
    const trollIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${trollIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    const trollFull = await page.evalJs(`window.__debug.combat().monsters[${trollIndex}].maxHealth`);
    await page.evalJs(`window.__debug.damageEnemy(${trollIndex}, Math.floor(${trollFull} / 2))`);
    const wounded = await page.evalJs(`window.__debug.combat().monsters[${trollIndex}].health`);
    for (let i = 0; i < 6; i++) await page.evalJs('window.__debug.advance(1)');
    const healed = await page.evalJs(`window.__debug.combat().monsters[${trollIndex}].health`);
    check('a troll regenerates in front of the player', healed > wounded,
      `wounded ${wounded} → healed ${healed} of ${trollFull}`);

    // ── Silence stops a caster, fear makes it run ─────────────────────────────
    // A **scroll** is how a fighter works magic (`game/items.js`): Silence and Witch's Curse
    // are the two control spells this check needs, and the character is not a mage.
    // **The field is cleared first.** `spellTarget` answers the nearest creature, and the
    // invisibility check left a rat standing at the same 1.4 m the new body is spawned at —
    // the spell would land on the rat and the wraith would keep casting, which is the
    // probe's own lesson rather than the spell's.
    const field = await page.evalJs('window.__debug.combat().monsters.length');
    for (let i = 0; i < field; i++) await page.evalJs(`window.__debug.damageEnemy(${i}, 99999)`);
    await page.evalJs('window.__debug.giveItem("scroll-silence")');
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("wraith")))()');
    const silenceIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${silenceIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    const silenceCast = await page.evalJs('(async () => window.__debug.use("scroll-silence"))()');
    await page.evalJs('window.__debug.advance(0.1)');
    const silenced = await page.evalJs(`window.__debug.combat().monsters[${silenceIndex}].caster`);
    check('Silence turns a caster into a creature that must close', silenced === false, `caster ${silenced} · ${JSON.stringify(silenceCast)}`);

    const field2 = await page.evalJs('window.__debug.combat().monsters.length');
    for (let i = 0; i < field2; i++) await page.evalJs(`window.__debug.damageEnemy(${i}, 99999)`);
    await page.evalJs('window.__debug.giveItem("scroll-witchs-curse")');
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("orc")))()');
    const fearIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${fearIndex}, { charge: false, begin: false, nextAttack: 100, health: 200 })`);
    const fearCast = await page.evalJs('(async () => window.__debug.use("scroll-witchs-curse"))()');
    await page.evalJs('window.__debug.advance(0.2)');
    const afraid = await page.evalJs(`window.__debug.combat().monsters[${fearIndex}].fleeing`);
    check('fear sends a creature running from the player', afraid === true, `fleeing ${afraid} · ${JSON.stringify(fearCast)}`);

    // ── Human Enemies: UESP's second section (D-67) ──────────────────────────
    // The page's four exact rules — any class, any race, a quest dungeon's level, and
    // `25×(level−1)²` — plus the loot line, on a live page rather than in the module.
    const field3 = await page.evalJs('window.__debug.combat().monsters.length');
    for (let i = 0; i < field3; i++) await page.evalJs(`window.__debug.damageEnemy(${i}, 99999)`);
    await page.evalJs('window.__debug.heal()');
    const goldBefore = await page.evalJs('window.__debug.combat().player.gold');
    const human = JSON.parse(await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnHuman({ classId: "warrior", raceId: "nord", level: 5 })))()'));
    // Its place in the field, read now: the beast-folk fixtures below are spawned after it,
    // and a later `length - 1` would point the strike and loot checks at the Khajiit.
    const humanIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    check('a human enemy is a real class and race, at the level asked for',
      human?.classId === 'warrior' && human?.raceId === 'nord' && human?.level === 5,
      JSON.stringify(human));
    check('and it is worth UESP\'s 25 × (level − 1)², which is 400 at level 5', human?.xp === 400, `${human?.xp} experience`);
    // `spriteFiles` names a *sheet*, and a race-tinted one is keyed `file#skin` — so the
    // presence test is the file prefix, not string equality.
    check('and it is drawn with the install\'s pale human combat set',
      human?.file === 'GUARD01.CFA'
        && await page.evalJs('window.__debug.combat().spriteFiles.some((f) => f.startsWith("GUARD01.CFA"))') === true,
      `${human?.file} · ${JSON.stringify(await page.evalJs('window.__debug.combat().spriteFiles.filter((f) => f.startsWith("GUARD01"))'))}`);
    // ── the beast-folk (2026-10-19) ──────────────────────────────────────────
    // *"argonian and khajeet human enemies should use the same edited sprites that their npcs
    // conterpart use so lizardman and colored wolves"*: the crowd's own stand-ins, not a human
    // body with a green or tawny palette.
    const lizard = JSON.parse(await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnHuman({ classId: "warrior", raceId: "argonian", level: 5 })))()'));
    check('an Argonian human enemy is the Lizard Man, as the marsh’s npcs are',
      lizard?.file === 'LIZARD1.CFA' && lizard?.skin === null
        && await page.evalJs('window.__debug.combat().spriteFiles.some((f) => f.startsWith("LIZARD1.CFA"))'),
      JSON.stringify(lizard && { file: lizard.file, skin: lizard.skin }));
    const cat = JSON.parse(await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnHuman({ classId: "thief", raceId: "khajiit", level: 5 })))()'));
    check('and a Khajiit one is the coloured snow wolf, coat and all',
      cat?.file === 'SWOLF01.CFA' && /^khajiitFur/.test(String(cat?.skin ?? ''))
        && await page.evalJs('window.__debug.combat().spriteFiles.some((f) => f.startsWith("SWOLF01.CFA"))'),
      JSON.stringify(cat && { file: cat.file, skin: cat.skin }));
    await page.evalJs(`window.__debug.prepareCombat(${humanIndex}, { charge: false, begin: false, nextAttack: 100 })`);
    let humanBlow = null;
    for (let i = 0; i < 24 && !humanBlow?.hit; i++) {
      await page.evalJs('window.__debug.advance(0.6)');
      humanBlow = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.strike())'));
    }
    // A warrior's plate is UESP's −9, read as a guard on the blow (`humans.js`).
    check('a human\'s armour is a guard on the player\'s blow — plate is 9',
      humanBlow?.hit === true && humanBlow?.guard === 9, JSON.stringify(humanBlow ?? null));
    await page.evalJs(`window.__debug.damageEnemy(${humanIndex}, 99999)`);
    // The loot is on the body until a player searches it (`E`), and the purse and pieces
    // reach the pack only through the panel's own Take all — the reported flow, not a seam.
    await page.evalJs('window.__debug.interact()');
    // The fixture has killed a lot; a pending level-up panel shares the pack's corner and
    // sits above it. Dismiss that panel the way `Escape` does (its points are postponed,
    // not lost) so the corpse's own button is the thing under the pointer.
    await page.evalJs("document.getElementById('levelup')?.classList.remove('on')");
    await page.waitFor('document.querySelector("button[data-corpse=\\"all\\"]") !== null',
      { label: 'the corpse panel', timeoutMs: 4000 });
    await page.clickSelector('button[data-corpse="all"]');
    const corpse = await page.evalJs('window.__debug.state().humanLoot');
    const goldAfter = await page.evalJs('window.__debug.combat().player.gold');
    await page.clickSelector('button[data-corpse-close="true"]');
    check('a dead human pays 1–50 gold, the four-piece set and a weapon UESP lists',
      corpse?.gold >= 1 && corpse?.gold <= 50 && goldAfter === goldBefore + corpse.gold
        // A fifth-level warrior: the four pieces and a broadsword — the pauldrons wait for
        // level 7 and 12, the helm for 17, and a two-handed sword carries no shield.
        && (corpse?.items?.length ?? 0) >= 5,
      `${corpse?.gold} gold, ${corpse?.items?.length} pieces: ${(corpse?.items ?? []).join(', ')}`);
    check('and the gear really reached the pack',
      (await page.evalJs('window.__debug.bag().length')) > 0
        && (corpse?.items ?? []).every((id) => id && typeof id === 'string'),
      `${(corpse?.items ?? []).join(', ')}`);

    // ── the beast-folk fall on their own death sheets ─────────────────────────
    // The owner, 2026-10-19: *"argonian and khajeet human enemies dont have a proper die
    // animation"*. A spawn owns the base name of the figure it is drawn from
    // (`spawn.sprite`), so `6.CFA` must be LIZARD6 or SWOLF06 — never the human GUARD set
    // the race's stand-in replaced. A fixture spawned fresh here keeps it out of the
    // strike and loot checks above (they hold the last spawn's index).
    for (const [race, sheet] of [['argonian', 'LIZARD6.CFA'], ['khajiit', 'SWOLF06.CFA']]) {
      // A spawn is async (it loads the figure's sheets), so the index is read only after
      // the promise settles — the async IIFE is the awaited form `spawnHuman`'s doc gives.
      await page.evalJs(`(async () => { await window.__debug.spawnHuman({ raceId: "${race}", level: 5 }); })()`);
      const index = await page.evalJs('window.__debug.combat().monsters.length - 1');
      await page.evalJs(`window.__debug.prepareCombat(${index}, { charge: false, begin: false, nextAttack: 100 })`);
      await page.evalJs(`window.__debug.damageEnemy(${index}, 99999)`);
      // The scene is paused, so the sim only moves when `advance` says so; the *picture*
      // is still painted by the page's own loop, and `frame` is the last painted sheet.
      await page.waitFor(`String(window.__debug.combat().monsters[${index}]?.frame).startsWith("${sheet}")`,
        { label: `${race} death sheet`, timeoutMs: 4000 });
      const first = await page.evalJs(`window.__debug.combat().monsters[${index}]`);
      await page.evalJs('window.__debug.advance(0.6)');
      await page.waitFor(`window.__debug.combat().monsters[${index}]?.frame !== "${first.frame}"`,
        { label: `${race} death frame advances`, timeoutMs: 4000 });
      const later = await page.evalJs(`window.__debug.combat().monsters[${index}]`);
      check(`a dead ${race} runs its own 6.CFA die sheet`,
        first?.dying === true && String(first?.frame).startsWith(sheet)
          && String(later?.frame).startsWith(sheet) && later.frame !== first.frame,
        `${first?.frame} → ${later?.frame} · dying ${first?.dying}/${later?.dying}`);
    }

    // ── a human foe may throw a spell, very rarely ────────────────────────────
    // The owner, 2026-10-19: *"all human enemies should sometimes be able to once every
    // very rarely cast a spell against the player"*. The fixture arms the rare clock
    // (`spellClock`) rather than hoping a random spawn rolls a caster, and leaves `caster`
    // false: the bolt must come from the human's own rationed clock, not the roster
    // caster's band. The spawn stands 1.4 m ahead and in sight, so the first step casts.
    // The invisibility check above leaves the player unseen, and a human foe without the
    // wraith's own sight would rightly ignore them; drop the lasting magic first.
    await page.evalJs('window.__debug.clearMagic()');
    const spellCastsBefore = await page.evalJs('window.__debug.combat().casts');
    // Let the player settle first: a fixture dropped mid-fall would put the foe at the
    // player's airborne height, an eye above the room's floor and blind to it.
    await page.evalJs('window.__debug.advance(0.6)');
    // Stand the foe on an **open cell** near the player rather than a step ahead, which
    // can be inside the wall the player is facing; a body in stone never has sight.
    const spellCell = await page.evalJs(`(() => {
      const feet = window.__debug.state().feet;
      const row = Math.floor(feet[0] / 2.5), col = Math.floor(feet[2] / 2.5);
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cell = window.__debug.cellAt(row + dr, col + dc);
        if (cell && !cell.solid && !cell.chasm) return { row: row + dr, col: col + dc };
      }
      return null;
    })()`);
    check('the fixture found an open cell for the human foe', Boolean(spellCell), JSON.stringify(spellCell));
    // Both bodies on the **same settled cell**, so the spell is the only thing this check
    // measures: the clock's own condition (`sees`) cannot be defeated by the wall the player
    // happened to be facing, and the level's floor geometry cannot put one eye under it.
    await page.evalJs(`window.__debug.teleportCell(${spellCell.row}, ${spellCell.col})`);
    await page.evalJs('window.__debug.advance(0.8)');
    await page.evalJs(`(async () => { await window.__debug.spawnHuman({ raceId: "argonian", level: 5, cell: ${JSON.stringify(spellCell)} }); })()`);
    const spellIndex = await page.evalJs('window.__debug.combat().monsters.length - 1');
    await page.evalJs(`window.__debug.prepareCombat(${spellIndex}, { caster: false, spellClock: 0, nextAttack: 100, begin: false })`);
    let spellCasts = spellCastsBefore;
    for (let read = 0; read < 12 && spellCasts === spellCastsBefore; read++) {
      await page.evalJs('window.__debug.advance(0.1)');
      spellCasts = await page.evalJs('window.__debug.combat().casts');
    }
    const spellRead = await page.evalJs(`(() => {
      const c = window.__debug.combat(); const s = c.monsters[${spellIndex}]; const f = window.__debug.state().feet;
      return { casts: c.casts, sees: s?.sees, distance: s?.distance, caster: s?.caster, awake: s?.awake,
        human: s?.world, feet: f, probe: s ? window.__debug.losProbe([s.world.x, s.world.y + 1.5, s.world.z], [f[0], f[1] + 1.5, f[2]]) : null };
    })()`);
    check('a human foe rations one spell and casts it on the rare clock',
      spellCasts > spellCastsBefore, `${spellCastsBefore} → ${spellCasts} casts · ${JSON.stringify(spellRead)}`);
    await page.evalJs(`window.__debug.damageEnemy(${spellIndex}, 99999)`);
    // Restore the unseen state whose HUD line the next check reads.
    await page.evalJs('window.__debug.giveItem("potion-invisibility")');
    await page.evalJs('(async () => window.__debug.use("potion-invisibility"))()');

    // ── the HUD says what is running ──────────────────────────────────────────
    const hud = await page.evalJs('document.getElementById("hud").textContent');
    check('the fight band carries the lasting magic — unseen, and the ward when it is up',
      /unseen/.test(hud ?? ''), String(hud).slice(-220));

    await page.screenshot(path.join(shots, 'bestiary.png'));
    check('the bestiary page produced no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  };
}
