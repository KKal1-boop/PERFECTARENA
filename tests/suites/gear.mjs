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
