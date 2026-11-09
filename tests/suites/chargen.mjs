// SUITE: CHARACTER CREATION, THROUGH REAL INPUT.
//
// Creation is the one flow a player cannot skip, so it is driven the way a player
// drives it: a real click on each of the ten scenarios' answers, real typing into
// the name field, real clicks on the class and the attribute points, and a real
// click on the button that enters Tamriel. The debug seam is used only to *observe*
// (`state()`), never to take a step — a suite that answered the questionnaire through
// `__debug.answerAll()` would prove the state machine and not the panel.
//
// The numbers are checked against the sources rather than against a snapshot: each
// attribute must lie in its race's `base + d20 + 1` range, the tally must count the
// ten answers, the class must be one of the eighteen, and the derived health must
// match 25 + the class die + the Endurance bonus.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots  where screenshots go
 * @param {() => number} helpers.getPort  the runner's static server, which is only
 *   known once it has started — asking the *page* for `location.port` reads
 *   `about:blank`'s empty port and navigates to port 80, which is how this suite
 *   first failed.
 * @returns {(page: object) => Promise<void>}
 */
export function makeChargenSuite({ check, realErrors, shots, getPort }) {
  return async function suiteChargen(page) {
    const path = await import('node:path');
    const port = getPort();
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;

    await page.goto(`http://localhost:${port}/?chargen&${q}`);
    await page.waitFor('window.__debug?.scene === "chargen" || !!window.__bootError', { label: 'the creation screen', timeoutMs: 60000 });
    const bootError = await page.evalJs('window.__bootError || null');
    check('character creation boots without a boot error', !bootError, bootError ? String(bootError).slice(0, 300) : '');

    const start = await page.evalJs('window.__debug.state()');
    // The room hangs the race's own sheet, **cut to the body the artist painted**: the 320×200
    // `CHARBK0x.IMG` is a character sheet with the figure standing in its right-hand part, and
    // the whole sheet stretched over a window is a poster. `tests/suites/gui.mjs` holds the
    // crop and the frame; here the check is that the painting is the install's own and that it
    // is the *cropped* one — a folder with no art is allowed to hang nothing, so this suite
    // reads the crop only when the install answered with a painting.
    check('creation is its own scene, with Arena\'s own sheet art behind it',
      start?.scene === 'chargen'
        && (start?.art === null || (start.art.file === 'CHARBK00.IMG'
          && start.art.width > 0 && start.art.crop?.w === start.art.width
          && start.art.crop.w < 320 && start.art.crop.h <= 200)),
      JSON.stringify(start?.art));
    check('the questionnaire came from question.txt', start?.questions?.length === 10, `${start?.questions?.length} scenarios drawn`);
    check('no character exists before creation', start?.saved === false && start?.character === null);
    check('the page is on the first step', start?.step === 'intro', start?.step);

    // ── the questionnaire, by clicking ────────────────────────────────────────
    await page.clickSelector('#chargen-panel #cg-begin');
    await page.waitFor('window.__debug.state().step === "questions"', { label: 'the first question' });
    const first = await page.evalJs('window.__debug.question()');
    check('Arena\'s own scenario text is on screen', Boolean(first && first.text.length > 60), first ? first.text.replace(/\n/g, ' ').slice(0, 80) : 'none');
    check('each scenario offers its three tagged answers',
      first?.answers?.length === 3 && first.answers.every((a) => 'abc'.includes(a.key) && 'clv'.includes(a.letter)),
      first?.answers?.map((a) => `${a.key}:${a.letter}`).join(' '));
    check('the answer buttons are real buttons a player can hit',
      (await page.evalJs('document.querySelectorAll("#chargen-panel button[data-answer]").length')) === 3);

    const letters = [];
    for (let i = 0; i < 10; i++) {
      const question = await page.evalJs('window.__debug.question()');
      letters.push(question.answers[i % 3].letter);
      // Click the answer whose letter we recorded, by its own key.
      await page.clickSelector(`#chargen-panel button[data-answer="${question.answers[i % 3].key}"]`);
      await new Promise((r) => setTimeout(r, 60));
    }
    const afterQuestions = await page.evalJs('window.__debug.state()');
    check('ten answered scenarios move the panel on to identity', afterQuestions?.step === 'identity', afterQuestions?.step);
    check('the tally counts exactly the ten answers',
      afterQuestions?.counts?.total === 10, JSON.stringify(afterQuestions?.counts));
    const expected = {
      thief: letters.filter((l) => l === 'c').length,
      mage: letters.filter((l) => l === 'l').length,
      warrior: letters.filter((l) => l === 'v').length,
    };
    check('the tally matches the letters actually clicked',
      afterQuestions?.counts.thief === expected.thief && afterQuestions?.counts.mage === expected.mage && afterQuestions?.counts.warrior === expected.warrior,
      `clicked ${expected.thief}/${expected.mage}/${expected.warrior}, counted ${afterQuestions?.counts.thief}/${afterQuestions?.counts.mage}/${afterQuestions?.counts.warrior}`);
    check('the answers suggest one of the eighteen classes', typeof afterQuestions?.suggested === 'string' && afterQuestions.suggested.length > 2, afterQuestions?.suggested);

    // ── identity, typed ──────────────────────────────────────────────────────
    await page.previewType?.('#cg-name', 'Testament');
    await page.evalJs('(() => { const el = document.querySelector("#cg-name"); el.value = "Testament"; return el.value; })()');
    const choseRace = await page.evalJs('(() => { const el = document.querySelector("#cg-race"); el.value = "redguard"; return el.value; })()');
    check('the race list offers Arena\'s eight races', (await page.evalJs('document.querySelectorAll("#cg-race option").length')) === 8, choseRace);
    check('a name too short is refused',
      (await page.evalJs('JSON.stringify(window.__debug.describe({ name: "A", raceId: "redguard" }))')).includes('at least two letters'));

    await page.clickSelector('#chargen-panel #cg-next');

    // ── the mirror: a body, a skin and a head of hair ────────────────────────
    //
    // The owner asked for a **visual** creator: pick any of the walking people Arena drew,
    // recolour skin and hair, and watch the chosen body turn, walk and strike before taking
    // it into Tamriel. This drives the real controls rather than the debug seam.
    await page.waitFor('window.__debug.state().step === "appearance"', { label: 'the visual creator' });
    const offered = await page.evalJs('window.__debug.appearanceOptions()');
    check('the creator offers every walking body in the catalogue',
      Array.isArray(offered) && offered.length >= 20
        && new Set(offered.map((s) => s.id)).size === offered.length
        && offered.every((s) => s.walk && s.attack),
      `${offered?.length} bodies`);
    check('the lizard-folk and the orange wolf are playable bodies, and the white wolf is not',
      ['lizard-man', 'cat-folk'].every((id) => offered.some((s) => s.id === id))
        && !offered.some((s) => s.id === 'wolf-snow'),
      offered.map((s) => s.id).filter((id) => /lizard|wolf|cat/.test(id)).join(', ') || 'none');
    const visibleBodies = await page.evalJs('document.querySelectorAll("#cg-sprites button[data-sprite]:not([hidden])").length');
    check('the body grid draws the ones this install really ships', visibleBodies >= 6, `${visibleBodies} visible`);
    // The cat is the wolf repainted: choosing it must arrive tawny and must not carry a human
    // skin or hair over the fur. The lizard keeps Arena's scales, so it carries neither.
    await page.clickSelector('#cg-sprites button[data-sprite="cat-folk"]');
    const cat = await page.evalJs('window.__debug.state().appearance');
    check('the orange cat arrives with a tawny coat and no human skin over it',
      cat?.fur === 'tawny' && cat?.skin == null && cat?.hair == null, JSON.stringify(cat));
    await page.clickSelector('#cg-fur button[data-look-fur="black"]');
    check('the cat can wear another of Elsweyr\u2019s coats',
      (await page.evalJs('window.__debug.state().appearance.fur')) === 'black');
    await page.clickSelector('#cg-sprites button[data-sprite="lizard-man"]');
    const lizard = await page.evalJs('window.__debug.state().appearance');
    check('the Lizard Man keeps his own scales rather than a painted skin',
      lizard?.spriteId === 'lizard-man' && lizard?.skin == null && lizard?.hair == null && lizard?.fur == null,
      JSON.stringify(lizard));
    // The stage paints after the grid's own thumbnails resolve, so wait for the drawing
    // rather than sampling the canvas on the frame the panel appears.
    const stagePainted = '(() => { const c = document.getElementById("cg-look"); return Boolean(c) && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0); })()';
    let stageOk = true;
    try { await page.waitFor(stagePainted, { label: 'the live stage painted', timeoutMs: 10000 }); } catch { stageOk = false; }
    const stage = await page.evalJs(`(() => { const c = document.getElementById("cg-look"); return c ? { w: c.width, h: c.height, painted: ${stagePainted} } : null; })()`);
    check('the chosen body is drawn on the live stage', stageOk && stage?.painted === true, JSON.stringify(stage));
    await page.clickSelector('#cg-sprites button[data-sprite="woman-dress"]');
    await page.clickSelector('#cg-skin button[data-look-skin="darkElf"]');
    await page.clickSelector('#cg-hair button[data-look-hair="blonde"]');
    const chosenLook = await page.evalJs('window.__debug.state().appearance');
    check('the skin and hair swatches recolour the same body',
      chosenLook?.spriteId === 'woman-dress' && chosenLook?.skin === 'darkElf' && chosenLook?.hair === 'blonde',
      JSON.stringify(chosenLook));
    await page.clickSelector('#chargen-panel button[data-look-mode="attack"]');
    check('the stage can play the body\u2019s attack frames',
      (await page.evalJs('document.querySelector("#chargen-panel button[data-look-mode=\\"attack\\"]").classList.contains("on")')) === true);
    await page.screenshot(path.join(shots, 'm4-chargen-look.png'));
    await page.clickSelector('#chargen-panel #cg-look-next');
    await page.waitFor('window.__debug.state().step === "class"', { label: 'the class step after the mirror' });
    const rolled = await page.evalJs('window.__debug.state()');
    check('the class step shows all eighteen classes', (await page.evalJs('document.querySelectorAll("#chargen-panel button[data-class]").length')) === 18);
    check('the questionnaire\'s suggestion is marked on its own class button',
      (await page.evalJs('document.querySelectorAll("#chargen-panel button.class-choice.on").length')) === 1);

    // The attributes are rolled when identity is confirmed; check the ranges.
    const attrs = await page.evalJs('window.__debug.describe({ name: "Testament", raceId: "redguard", gender: "female" }).attributes');
    // UESP, *Arena: Character Creation*: "the base racial & gender modifier + d20 + 1",
    // and Arena's own d20 rolls **0…20** (its "Dice Rolling" section), so the added
    // amount is 1…21 and a base-30 attribute can be 31 or 51. The female Redguard
    // bases are 30/30/30/50/50/50/40/40 — that 31 is why the floor is +1 and not +2.
    const bases = [30, 30, 30, 50, 50, 50, 40, 40];
    check('every attribute is its race\'s base plus Arena\'s d20 (0–20) plus 1',
      Array.isArray(attrs) && attrs.length === 8 && attrs.every((v, i) => v >= bases[i] + 1 && v <= bases[i] + 21),
      `${attrs?.join(' ')} against bases ${bases.join(' ')}`);
    // ── the points, by clicking ──────────────────────────────────────────────
    await page.clickSelector('#chargen-panel #cg-attr');
    await page.waitFor('window.__debug.state().step === "attributes"', { label: 'the attribute step' });
    // The panel must say where its numbers came from, not merely show them.
    const note = await page.evalJs('document.querySelector("#chargen-panel .steps")?.textContent ?? ""');
    check('the attribute step states the dice it was rolled from', /d20/.test(note) && /d6/.test(note), note);
    const pool = await page.evalJs('(() => { const m = /You have <b>(\\d+)<\\/b> points/.exec(document.querySelector("#chargen-panel p.sub").innerHTML); return m ? Number(m[1]) : null; })()');
    const dice = await page.evalJs('window.__debug.rolls()');
    check('the discretionary pool is 4d6, between 4 and 24', pool >= 4 && pool <= 24, `${pool} points`);
    check('the pool is the sum of the four dice on screen, 1–6 each',
      Array.isArray(dice) && dice.length === 4 && dice.every((d) => d >= 1 && d <= 6) && dice.reduce((a, b) => a + b, 0) === pool,
      `${dice?.join('+')} = ${pool}`);

    // Spend everything on Strength, one point at a time, with real clicks.
    const plusButtons = await page.evalJs('document.querySelectorAll("#chargen-panel button[data-spend=\\"0\\"][data-delta=\\"1\\"]").length');
    check('each attribute has + and − buttons', plusButtons === 1);
    for (let i = 0; i < pool; i++) {
      await page.clickSelector('#chargen-panel button[data-spend="0"][data-delta="1"]');
      await new Promise((r) => setTimeout(r, 20));
    }
    const spent = await page.evalJs('window.__debug.state()');
    check('spending the whole pool leaves none', spent?.progress?.done === true);
    const after = await page.evalJs('(() => { const cells = [...document.querySelectorAll("#chargen-panel table.attrs .val")].map((c) => Number(c.textContent)); return cells; })()');
    check('the sheet shows the spent values', after[0] === attrs[0] + pool, `${attrs[0]} + ${pool} = ${after[0]}`);
    // One more click must be refused rather than silently granted.
    const beforeRefusal = await page.evalJs('JSON.stringify([...document.querySelectorAll("#chargen-panel table.attrs .val")].map((c) => c.textContent))');
    await page.clickSelector('#chargen-panel button[data-spend="1"][data-delta="1"]');
    await new Promise((r) => setTimeout(r, 60));
    const refused = await page.evalJs('document.querySelector("#chargen-panel p.sub .warn") ? document.querySelector("#chargen-panel p.sub").textContent : null');
    check('an over-spend is refused with a reason', Boolean(refused), refused ?? 'no refusal shown');

    await page.screenshot(path.join(shots, 'm4-chargen-attrs.png'));

    // ── finish, and enter Tamriel ────────────────────────────────────────────
    await page.clickSelector('#chargen-panel #cg-finish');
    await page.waitFor('window.__debug.state().step === "done"', { label: 'the finished character' });
    const done = await page.evalJs('window.__debug.state()');
    const character = done?.character;
    check('creation produces a character', Boolean(character?.name), character ? character.name : 'none');
    check('the character is saved before the page changes', done?.saved === true);
    check('the character is one of the eighteen classes', character && character.className.length > 2, character?.className);
    check('the character keeps the attributes that were spent',
      character?.attributes?.[0] === attrs[0] + pool, `${character?.attributes?.[0]}`);
    check('the character is saved with the body, skin and hair the player chose',
      character?.appearance?.spriteId === 'woman-dress'
        && character?.appearance?.skin === 'darkElf' && character?.appearance?.hair === 'blonde',
      JSON.stringify(character?.appearance ?? null));
    // Health = 25 + the class die + the Endurance bonus, per UESP.
    const endurance = character?.attributes?.[5] ?? 0;
    const endBonus = endurance >= 94 ? 5 : Math.max(0, Math.floor((endurance - 40) / 11));
    check('health is 25 + the class die + the endurance bonus',
      character?.health === 25 + character?.hitDieRoll + endBonus,
      `${character?.health} = 25 + ${character?.hitDieRoll} + ${endBonus}`);
    // Spell points are the class multiplier times Intelligence — null for the
    // classes Arena gives no spells, which is what "no spells" means here. Checked
    // against the class table rather than against nothing.
    const klass = await page.evalJs(`window.__debug.classOf(${JSON.stringify(character?.classId)})`);
    const expectSp = klass && klass.spellPoints > 0
      ? Math.round(klass.spellPoints * (character?.attributes?.[1] ?? 0))
      : null;
    check('spell points follow the class multiplier and Intelligence, and are absent for a fighter',
      Boolean(klass) && character?.spellPoints === expectSp,
      `${character?.className} (multiplier ${klass?.spellPoints}): ${character?.spellPoints} vs ${expectSp}`);
    await page.screenshot(path.join(shots, 'm4-chargen-done.png'));

    // ── and creation hands the player on ─────────────────────────────────────
    //
    // **Where it hands them on is Arena's own first step**: a locked cell in the Imperial
    // Dungeons (`game/startFlow.js`), not the world map. The owner, playing both games side by
    // side (2026-10-16): "after character creation a cutscene missing in perfectarena you
    // start in the imperial dungeon". A `?chargen` URL is a dev door (this suite is one), so
    // the opening movie is not played in front of it — that half of the law is the menu
    // suite's, which starts a game the way a player does.
    const beforeLeave = await page.evalJs('location.href');
    await page.clickSelector('#chargen-panel #cg-play');
    let entered = true;
    try {
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
        { label: 'the Imperial Dungeons', timeoutMs: 120000 });
    } catch {
      entered = false;
    }
    // The hand-off must not be a navigation: a picked Arena folder is a live
    // FileList and a new page would have to ask for it all over again.
    const afterLeave = await page.evalJs('location.href');
    check('creation hands the player on without reloading the page', beforeLeave === afterLeave, `${beforeLeave} → ${afterLeave}`);
    check('the creation panel is gone from the screen',
      (await page.evalJs('!document.getElementById("chargen") || !document.getElementById("chargen").classList.contains("on")')) === true);
    // Report *why* it did not arrive rather than only that it did not.
    check('finishing creation enters the world', entered, entered ? '' : await page.evalJs('JSON.stringify({ href: location.href, scene: window.__debug?.scene ?? null, boot: window.__bootError ? String(window.__bootError) : null, errs: window.__debug?.pageErrors ?? [] })'));
    const standing = await page.evalJs('window.__debug.state()');
    check('and the world it enters is the Imperial Dungeons, the quest\'s first step',
      standing?.map === 'START.MIF' && /Escape Imperial Dungeons/i.test(String((await page.evalJs('window.__debug.quest()'))?.objective ?? '')),
      `${standing?.map} · ${(await page.evalJs('window.__debug.quest()'))?.objective}`);
    // The sheet creation made is read **from where the player is standing** (`interior.js`'s
    // `player()`), which is the same object the HUD and the fight read.
    const carried = await page.evalJs('window.__debug.player ? window.__debug.player() : null');
    check('the dungeon knows who walked in', Boolean(carried?.name), carried ? `${carried.name}, ${carried.className}` : 'the scene does not expose the character');

    // ── what the new character carries into the dungeon, and what is in hand ─────────────────
    //
    // The owner, playing this port beside the original: "in normal arena your attack animation is
    // fists and then when you equip different weapons it moves and from fists becomes dagger then
    // sword … instead in perfectarena is always the dagger animation". Arena gives a new prisoner
    // their **class's** weapon — UESP's table: a Warrior a broadsword, a Thief a shortsword, a Mage
    // a dagger — **in the pack**, and the walkthrough tells the player to go and equip it. This
    // port handed every class a wielded dagger, so the first thing a new character ever saw was a
    // blade. Checked where the player sees it: the first person, after a real creation, in a real
    // dungeon.
    await page.goto(`http://localhost:${port}/?interior=START.MIF&${q}`);
    await page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3', { label: 'the dungeon after creation', timeoutMs: 90000 });
    const hands = await page.evalJs('window.__debug.weaponView()');
    check('a newly created character stands in the dungeon with empty hands',
      /^HAND\.CIF$/.test(String(hands?.file ?? '')), JSON.stringify({ file: hands?.file, family: hands?.family }));
    const UESP_WEAPON = {
      broadsword: ['archer', 'barbarian', 'knight', 'monk', 'ranger', 'warrior'],
      shortsword: ['acrobat', 'assassin', 'bard', 'burglar', 'rogue', 'thief'],
      dagger: ['battlemage', 'healer', 'mage', 'nightblade', 'sorceror', 'spellsword'],
    };
    const want = Object.entries(UESP_WEAPON).find(([, ids]) => ids.includes(carried?.classId))?.[0];
    // The pack is materialised by asking for it (`interior.js`'s `bagOf` mints a starting kit for
    // a character that has never opened one): `__debug.bag()` is the seam that does it.
    const pack = await page.evalJs('window.__debug.bag().map((row) => row.id ?? row.item?.id ?? null)');
    check('and the pack holds the weapon their class begins with',
      Boolean(want) && pack.includes(want), `${carried?.className} (${carried?.classId}) expects a ${want}: [${pack.join(', ')}]`);
    check('and no weapon is in hand until they equip one',
      !(await page.evalJs('window.__debug.player().weapon ?? null')), await page.evalJs('String(window.__debug.player().weapon ?? "(none)")'));
    const fists = await page.evalJs('window.__debug.combat().player');
    check('and the fight reads those empty hands as fists, not a sword',
      String(fists?.weapon ?? '') === '' || fists?.weapon == null, JSON.stringify({ weapon: fists?.weapon ?? null }));
    await page.screenshot(path.join(shots, 'm4-chargen-first-person.png'));

    // ── the chosen body is the one walking in the world ──────────────────────
    //
    // The creator's choice has to reach the third person, or the mirror was decoration.
    // The body is chosen at creation, the save is read by the dungeon, and the third person
    // loads all five shipped angles of **that** sprite plus its strike sheet.
    await page.evalJs('window.__debug.setView("third")');
    let viewsUp = true;
    try {
      await page.waitFor('window.__debug.state().playerViews?.length === 5', { label: 'the five angles of the chosen body', timeoutMs: 30000 });
    } catch { viewsUp = false; }
    const third = await page.evalJs('window.__debug.state()');
    check('the third person draws all five angles of the body the player chose',
      viewsUp && third?.appearance?.spriteId === 'woman-dress',
      `${third?.appearance?.spriteId}: views ${third?.playerViews?.join(',')}`);
    check('and its walk and strike are the chosen family\u2019s own sheets, in the chosen palette',
      String(third?.playerSprite).startsWith('BABE05.CFA#darkElf+blonde')
        && String(third?.attackSprite).startsWith('BABE01.CFA#darkElf+blonde'),
      `${third?.playerSprite} / ${third?.attackSprite}`);
    await page.screenshot(path.join(shots, 'm4-chargen-third-person.png'));

    // The two beast bodies are the same law, and the world must draw them as what they are:
    // the cat is the wolf under `khajiitFur` (tawny stripes) and the lizard is its own scales
    // with no race ramp over them. The save is rewritten and the dungeon reloaded, which is
    // exactly how a returning player's look reaches the scene.
    const wear = async (appearance) => {
      await page.evalJs(`(() => { const key = 'perfectarena.character'; const ch = JSON.parse(localStorage.getItem(key)); ch.appearance = ${JSON.stringify(appearance)}; localStorage.setItem(key, JSON.stringify(ch)); return ch.appearance; })()`);
      await page.goto(`http://localhost:${port}/?interior=START.MIF&${q}`);
      await page.waitFor('window.__debug?.combat && window.__debug.state().painted > 3', { label: 'the dungeon with the beast body', timeoutMs: 90000 });
      await page.evalJs('window.__debug.setView("third")');
      await page.waitFor('window.__debug.state().playerViews?.length === 5', { label: 'the beast\u2019s five angles', timeoutMs: 30000 });
      return page.evalJs('window.__debug.state()');
    };
    const catWorld = await wear({ spriteId: 'cat-folk', skin: null, hair: null, fur: 'tawny' });
    check('a Khajiit is the orange wolf in the world, under the fur palette',
      String(catWorld?.playerSprite).startsWith('SWOLF05.CFA#khajiitFur')
        && String(catWorld?.attackSprite).startsWith('SWOLF01.CFA#khajiitFur')
        && catWorld?.appearance?.fur === 'tawny',
      `${catWorld?.playerSprite} / ${catWorld?.attackSprite}`);
    const lizardWorld = await wear({ spriteId: 'lizard-man', skin: null, hair: null, fur: null });
    check('an Argonian is the Lizard Man, with the scales Arena drew and no palette over them',
      String(lizardWorld?.playerSprite).startsWith('LIZARD5.CFA')
        && !String(lizardWorld?.playerSprite).includes('#')
        && String(lizardWorld?.attackSprite).startsWith('LIZARD1.CFA')
        && !String(lizardWorld?.attackSprite).includes('#'),
      `${lizardWorld?.playerSprite} / ${lizardWorld?.attackSprite}`);
    await page.screenshot(path.join(shots, 'm4-chargen-lizard.png'));

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
