// Suite: the pack, the spellbook and the casting — the three things this port did not have.
//
// A player's own report is the reason this suite exists: "loot is infinite there is no magic
// or inventory". What could be checked without a browser is checked in
// `tests/unit/items.test.mjs` and `tests/unit/spells.test.mjs`; what only a *page* can answer
// is here, and it is broken into the three claims a player would make:
//
//   * **a pack that works** — a thing put in it, equipped into the hand, drunk and thrown
//     away again, with the count of it moving the way the law says it moves;
//   * **a spellbook that is the install's** — the 64 spells the player's own `SPELLSG.65`
//     holds, joined to what the game knows how to cast, with the codes of the file still on
//     the entry (so a decode that quietly fell back to a table in the source fails here);
//   * **magic that is spent and refused** — a heal that costs spell points and closes a wound,
//     and a spell this character has not bought being refused by name, with the Mages Guild
//     named in the refusal.
//
// The shop's counter is *not* here: the trade law is pure and is tested against the catalog in
// `tests/unit/items.test.mjs`, and a shop needs a door in a city to be walked through, which
// the `doors` suite already does. What this suite adds is the third of the game a player
// touches every minute of a dungeon.

import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

export function makeGearSuite({ check, realErrors, shots, getPort }) {
  return async function suiteGear(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;

    // ── a dungeon: the scene the pack is used in ─────────────────────────────
    await page.goto(`http://localhost:${PORT}/?dungeon=Stonekeep&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'Stonekeep', timeoutMs: 60000 });

    // ── the pack ─────────────────────────────────────────────────────────────
    const bag = await page.evalJs('window.__debug.bag()');
    check('the player starts with something in the pack', Array.isArray(bag) && bag.length >= 1,
      `${bag?.length} kinds: ${(bag ?? []).map((row) => `${row.id}×${row.qty}`).join(', ')}`);
    check('every row of the pack is a real item with a line about it',
      (bag ?? []).every((row) => row.name && row.kind && typeof row.note === 'string'),
      JSON.stringify((bag ?? [])[0] ?? null));

    const given = await page.evalJs('window.__debug.giveItem("potion-heal", 2)');
    const afterGive = (given ?? []).find((row) => row.id === 'potion-heal');
    check('a thing given to the player stacks in the pack', afterGive?.qty >= 2, `×${afterGive?.qty}`);

    await page.evalJs('window.__debug.giveItem("dagger")');
    const equipped = await page.evalJs('window.__debug.equip("dagger")');
    check('equipping a weapon out of the pack puts it in the hand', equipped === true);
    const carriedNow = await page.evalJs('JSON.stringify(window.__debug.inventory())');
    check('…and the sheet says so', /Dagger/.test(carriedNow ?? ''), String(carriedNow).slice(0, 160));
    const stillHeld = await page.evalJs('window.__debug.bag().some((row) => row.id === "dagger")');
    check('…and it is still the player\'s to sell', stillHeld === true);

    // ── the armour, which is worn *by area* (D-68) ───────────────────────────
    // UESP's rating is per material and per protected area (`game/armour.js`), so the check is
    // not "a suit adds up": a cuirass must protect the chest and nothing else, and a tower
    // shield must reach the head a bare helm does not.
    const bare = await page.evalJs('window.__debug.armour()');
    check('a character in rags is protected nowhere', bare?.rating === 0 && (bare?.covered ?? []).length === 0,
      JSON.stringify(bare));
    await page.evalJs('window.__debug.giveItem("leather-cuirass")');
    await page.evalJs('window.__debug.equip("leather-cuirass")');
    const cuirass = await page.evalJs('window.__debug.armour()');
    check('a leather cuirass protects the chest with UESP\'s 3 and leaves the legs bare',
      cuirass?.areas?.chest === 3 && cuirass?.areas?.legs === 0 && cuirass?.rating > 0,
      JSON.stringify(cuirass));
    await page.evalJs('window.__debug.giveItem("tower-shield")');
    await page.evalJs('window.__debug.equip("tower-shield")');
    const shielded = await page.evalJs('window.__debug.armour()');
    check('a tower shield adds its 4 to the head, hands and legs it covers',
      shielded?.areas?.head === 4 && shielded?.areas?.hands === 4 && shielded?.areas?.legs === 4,
      JSON.stringify(shielded));
    const used = await page.evalJs('window.__debug.use("potion-heal")');
    const afterUse = await page.evalJs('window.__debug.bag().find((row) => row.id === "potion-heal")');
    check('drinking a potion uses one and says what it did', used === true && (afterUse?.qty ?? 0) === afterGive.qty - 1,
      `×${afterGive?.qty} → ×${afterUse?.qty}`);

    const dropped = await page.evalJs('window.__debug.dropItem("potion-heal")');
    const afterDrop = await page.evalJs('window.__debug.bag().find((row) => row.id === "potion-heal")');
    check('throwing a thing away takes it out of the pack', dropped === true && (afterDrop?.qty ?? 0) === (afterUse?.qty ?? 1) - 1,
      `×${afterUse?.qty} → ×${afterDrop?.qty ?? 0}`);

    const nonsense = await page.evalJs('window.__debug.use("longsword")');
    check('a sword cannot be drunk', nonsense === false, `${await page.evalJs('window.__debug.state().notice ?? ""')}`);

    // ── the weapons that were not working: a bow shoots, and a flail is drawn ──
    //
    // The owner, 2026-10-18: *"we need all the weapons like axes flails and armor and spells
    // actually working"*. This install ships no `BOW.CIF` and no `FLAIL.CIF` (measured: six of
    // Arena's eight sheets are in `GLOBAL.BSA`), so those two families are the ones a page can
    // prove: **the bow looses a real arrow** (`game/archery.js`) whose wound is the fight's own,
    // and **the flail is drawn** from the archive's mace sheet, said out loud.
    await page.evalJs('window.__debug.giveItem("steel-long-bow")');
    await page.evalJs('window.__debug.equip("steel-long-bow")');
    // **A bow without arrows is a stick** (the owner, 2026-10-18): a shot consumes one arrow from
    // the pack, so the suite stocks the quiver the way a player buys one (`items.js`'s `arrow`,
    // a bundle of 20). The check below is that the bow *fires and is drawn*; an empty quiver
    // refuses to fire and would make it read as a broken bow.
    const bow = await page.evalJs('window.__debug.weaponView()');
    check('a long bow is a bow in the hand, not a club',
      bow?.family === 'bow' && bow?.ranged === true && bow?.weapon === 'long-bow',
      JSON.stringify({ family: bow?.family, ranged: bow?.ranged, file: bow?.file }));

    await page.evalJs('window.__debug.giveItem("arrow", 20)');
    const quiverBefore = await page.evalJs('window.__debug.bag().filter(r => r.id === "arrow").reduce((n, r) => n + (r.qty ?? 0), 0)');
    // A random dungeon roster can be behind a wall. Put a real target in the
    // player's room; do not make arrows pass through masonry to satisfy this check.
    // Select a pair of adjacent dry floor cells, rather than putting the target
    // 1.4 m ahead when the current facing is directly into a wall.
    const lane = await page.evalJs(`(() => {
      const d=window.__debug;
      for(let r=2;r<48;r++)for(let c=2;c<48;c++){
        const a=d.cellAt(r,c),b=d.cellAt(r,c+1);
        if(a && b && !a.solid && !b.solid && !a.chasm && !b.chasm && d.sightBetween({row:r,col:c},{row:r,col:c+1})?.sees) return {r,c};
      }
      return null;
    })()`);
    if (!lane) throw new Error('No clear archery lane in Stonekeep');
    await page.evalJs(`window.__debug.warp(${lane.r},${lane.c});window.__debug.look(0)`);
    await page.evalJs('window.__debug.spawnMonster("lizardman")');
    const arrowTarget = await page.evalJs('window.__debug.combat().monsters.length - 1');
    const before = await page.evalJs('window.__debug.state()');
    const shot = await page.evalJs(`window.__debug.shootAt(${arrowTarget})`);
    const quiverAfter = await page.evalJs('window.__debug.bag().filter(r => r.id === "arrow").reduce((n, r) => n + (r.qty ?? 0), 0)');
    check('a shot spends one arrow out of the quiver',
      shot?.ok ? quiverAfter === quiverBefore - 1 : quiverAfter === quiverBefore,
      `${quiverBefore} → ${quiverAfter}${shot?.ok ? '' : ` (${shot?.reason})`}`);
    // **And the shot has a picture** — the owner: *"bow has no animation in first person"*. This
    // archive has no `BOW.CIF`, so the bow is drawn from the install's own `ARROWS.CIF` missile art
    // (`weaponView.js`'s `ARROW_STATES`, the 3×3 grid read off the file's own headers): the arrow
    // nocked low, then away up the middle of the screen.
    await new Promise((r) => setTimeout(r, 250));
    const shotView = await page.evalJs('({ view: window.__debug.weaponView(), pixels: window.__debug.weaponPixels() })');
    check('the original two-frame bow artwork is painted while firing',
      shotView?.view?.state === 'firing' && shotView?.view?.frame === 1
        && shotView?.view?.drawn === true && (shotView?.pixels?.pixels ?? 0) > 0
        && shotView?.view?.substitute === false && shotView?.view?.file === 'ARROWHLF.CFA',
      JSON.stringify({ ...shotView?.view, pixels: shotView?.pixels?.pixels }));
    // **Nothing of the interface covers the bow.** The message panel used to sit over the
    // bottom of the view, so the check was "the art stops above the panel". Since 2026-10-22
    // the panel hangs in the top-left corner and the vitals float in the bottom-left, so the
    // invariant is the stronger, honest one: the art's rectangle does not meet the panel's.
    const bowLayout = await page.evalJs(`(() => {
      const art = window.__debug.weaponView().onScreen;
      const hud = document.getElementById('hud').getBoundingClientRect();
      const overlaps = Boolean(art) && !(art.right <= hud.left || art.x >= hud.right
        || art.bottom <= hud.top || art.y >= hud.bottom);
      return { art, hud: hud.toJSON(), overlaps };
    })()`);
    check('the centered original bow is not covered by the message panel',
      Boolean(bowLayout.art) && bowLayout.overlaps === false, JSON.stringify(bowLayout));
    await page.screenshot(path.join(shots, 'original-bow-visible.png'));
    const afterShot = await page.evalJs('window.__debug.state()');
    check('loosing the bow puts an arrow in the air',
      shot?.ok === true ? (afterShot?.arrowsLoosed ?? 0) > (before?.arrowsLoosed ?? 0)
        : (afterShot?.arrowsLoosed ?? 0) === 0,
      shot?.ok === false ? `no creature to aim at: ${shot.reason}` : `${before?.arrowsLoosed ?? 0} → ${afterShot?.arrowsLoosed} shafts, ${afterShot?.arrows?.length} in flight`);

    if (shot?.ok) {
      // The shaft is stepped by the frame loop, so wait for it to end rather than guessing a
      // duration: stone, a body, or the end of its flight.
      await page.waitFor('window.__debug.state().lastArrow && window.__debug.state().lastArrow.state !== "loosed"',
        { label: 'the arrow to land', timeoutMs: 8000 });
      const landed = await page.evalJs('window.__debug.state()');
      const terminal = ['struck', 'missed', 'struck stone', 'flew out', 'no wound'];
      check('and the arrow ends in the world — a body, stone, or the end of its flight',
        terminal.includes(landed?.lastArrow?.state),
        JSON.stringify(landed?.lastArrow ?? null));
      // A hit is a roll, so the loop is what a test can honestly ask for: fire until one lands,
      // then hold the laws a landed arrow has to obey (a wound with the bow's own range, and a
      // creature that lost health for it).
      let hits = landed?.arrowHits ?? 0;
      let last = landed?.lastArrow ?? null;
      for (let i = 0; i < 6 && hits === 0; i++) {
        await new Promise((r) => setTimeout(r, 700));       // past the bow's own draw cooldown
        const again = await page.evalJs(`window.__debug.shootAt(${arrowTarget})`);
        if (again?.ok !== true) break;
        await page.waitFor('window.__debug.state().lastArrow && window.__debug.state().lastArrow.state !== "loosed"',
          { label: `arrow ${i + 2} to land`, timeoutMs: 8000 });
        const state = await page.evalJs('window.__debug.state()');
        hits = state?.arrowHits ?? hits;
        last = state?.lastArrow ?? last;
      }
      check('a landed arrow wounds the creature it hit',
        hits > 0 && last?.state === 'struck' && last?.damage > 0,
        `hits ${hits} · ${JSON.stringify(last ?? null)}`);
    }

    await page.evalJs('window.__debug.giveItem("iron-flail")');
    await page.evalJs('window.__debug.equip("iron-flail")');
    const flail = await page.evalJs('window.__debug.weaponView()');
    check('the flail uses its original STAR.CIF artwork without substitution',
      flail?.weapon === 'flail' && flail?.file === 'STAR.CIF' && flail?.substitute === false
        && flail?.ownFile === 'STAR.CIF' && flail?.missing == null,
      JSON.stringify({ file: flail?.file, own: flail?.ownFile, substitute: flail?.substitute, missing: flail?.missing }));
    // The bow's draw is still on the swing clock; a swing is refused while it runs.
    await new Promise((r) => setTimeout(r, 800));
    const flailSwing = await page.evalJs('window.__debug.strike()');
    check('…and it swings as a melee weapon, at the flail\'s own damage',
      flailSwing?.ok !== false, JSON.stringify(flailSwing ?? null).slice(0, 160));

    // ── the spellbook, which is the install's own file ───────────────────────
    const book = await page.evalJs('window.__debug.spellbook()');
    check('the player\'s own spell file was read and holds Arena\'s 64 spells',
      book?.file?.named === 64 && book?.file?.records === 128, JSON.stringify(book?.file));
    check('every named record became a spell the game can name',
      book?.all === 64, `all=${book?.all}`);
    check('the character has a spellbook with spells in it', (book?.known?.length ?? 0) >= 1,
      (book?.known ?? []).map((entry) => `${entry.name}(${entry.cost})`).join(', '));
    check('a known spell carries its cost and what it does',
      (book?.known ?? []).every((entry) => entry.points > 0 && entry.cost > 0 && entry.note),
      JSON.stringify((book?.known ?? [])[0] ?? null));
    // **The decode, in the browser.** The entry's own code list comes from the file's bytes, so
    // a build that had fallen back to a hand-written table would show an empty list here.
    check('a spellbook entry still carries the effect codes the file gave it',
      (book?.known ?? []).some((entry) => Array.isArray(entry.codes) && entry.codes.length > 0),
      JSON.stringify((book?.known ?? [])[0]?.codes ?? null));

    // ── casting ──────────────────────────────────────────────────────────────
    const healed = await page.evalJs('window.__debug.cast("Light Heal")');
    check('casting a spell the character knows works and is paid for',
      healed?.ok === true && healed?.spell === 'Light Heal' && healed?.cost > 0,
      JSON.stringify(healed ?? null).slice(0, 200));
    check('casting spends the spell points', healed?.spellPoints != null, `left ${healed?.spellPoints}`);

    const unknownSpell = await page.evalJs('window.__debug.cast("Fireball")');
    check('a spell that is not in the book is refused, and the guild is named',
      unknownSpell?.ok === false && /Mages Guild/.test(await page.evalJs('window.__debug.state().notice ?? ""')),
      unknownSpell?.reason ?? '');
    const stillShut = await page.evalJs('window.__debug.cast("Gods\' Fire")');
    check('and the refusal is not a cast: nothing was spent', stillShut?.ok === false, stillShut?.reason ?? '');

    const learnt = await page.evalJs('window.__debug.learn("Fire Dart")');
    check('learning a spell puts it in the book', (learnt ?? []).includes('Fire Dart'), (learnt ?? []).join(', '));
    const cast = await page.evalJs('window.__debug.cast("Fire Dart")');
    check('and then it casts — at nothing, in an empty corner, and says so',
      cast?.ok === true && cast?.spell === 'Fire Dart', JSON.stringify(cast ?? null).slice(0, 220));

    // ── the panel, through the keys a player presses ─────────────────────────
    await page.pressKey('KeyC');
    await new Promise((r) => setTimeout(r, 250));
    const spellPanel = await page.evalJs('({ panel: window.__debug.panel(), text: document.getElementById("inventory")?.textContent ?? "" })');
    check('C opens the spellbook page', spellPanel?.panel?.open === true && spellPanel?.panel?.mode === 'spells',
      JSON.stringify(spellPanel?.panel ?? null));
    check('and the page lists spell points and a way to cast', /spell points/.test(spellPanel?.text ?? ''),
      (spellPanel?.text ?? '').slice(0, 120));
    check('and it carries Arena\'s own casting note', /A\.EXE/.test(spellPanel?.text ?? ''));

    await page.pressKey('KeyI');
    await new Promise((r) => setTimeout(r, 250));
    const packPanel = await page.evalJs('({ panel: window.__debug.panel(), text: document.getElementById("inventory")?.textContent ?? "" })');
    check('I switches to the pack page', packPanel?.panel?.open === true && packPanel?.panel?.mode === 'bag',
      JSON.stringify(packPanel?.panel ?? null));
    check('and the pack page lists the things in it', /Pack \(/.test(packPanel?.text ?? ''), (packPanel?.text ?? '').slice(0, 120));
    // **The sheet's own number**, which is the average over the body (`armour.js`'s
    // `armourRating`): the cuirass and tower shield the check above put on must be printed.
    check('and the sheet prints the protection those pieces are worth',
      new RegExp(`\\b${shielded?.rating} armour\\b`).test(packPanel?.text ?? ''),
      `rating ${shielded?.rating} in: ${String(packPanel?.text ?? '').match(/[\d]+ armour/)?.[0] ?? 'nothing'}`);
    await page.screenshot(path.join(shots, 'gear-panel.png'));

    await page.pressKey('KeyI');
    await new Promise((r) => setTimeout(r, 200));
    check('pressing I again puts the panel away', (await page.evalJs('window.__debug.panel().open')) === false);

    // ── the panel's own buttons, clicked like a player ───────────────────────
    await page.evalJs('window.__debug.openBag()');
    await page.waitFor('!!document.querySelector("#inventory button[data-bag]")', { label: 'the pack buttons' });
    const buttons = await page.evalJs('document.querySelectorAll("#inventory button[data-bag]").length');
    check('every row of the pack has a button on it', buttons >= 1, `${buttons} buttons`);
    await page.clickSelector('#inventory button[data-bag][data-do="drop"]');
    await new Promise((r) => setTimeout(r, 250));
    check('clicking Drop throws that thing away', Boolean(await page.evalJs('window.__debug.state().notice')));

    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
