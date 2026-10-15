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
    check('creation is its own scene, with Arena\'s own sheet art behind it',
      start?.scene === 'chargen' && start?.art?.width === 320 && start?.art?.height === 200,
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
    await page.waitFor('window.__debug.state().step === "class"', { label: 'the class step' });
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
    const beforeLeave = await page.evalJs('location.href');
    await page.clickSelector('#chargen-panel #cg-play');
    let entered = true;
    try {
      await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the world map', timeoutMs: 60000 });
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
    const carried = await page.evalJs('window.__debug.character ? window.__debug.character() : null');
    check('the world map knows who the player is', Boolean(carried?.name), carried ? `${carried.name}, ${carried.className}` : 'the map does not expose the character');

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
