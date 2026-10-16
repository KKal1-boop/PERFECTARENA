// SUITE: THE GAME'S OWN EXECUTABLE, UNPACKED IN A REAL PAGE (**block B24**, the brief's P2).
//
// The unit suite holds the format; this holds the *runtime* claim, which is the one that matters
// for this project: the port reads `ACD.EXE` — the file `ARENA.BAT` runs, and therefore the game's
// own tables — from the player's own copy, inside the browser, and unpacks it there. Nothing is
// bundled and nothing derived is committed (law 6 of `docs/PORT_BLOCKS.md`); if this suite passes on
// someone else's machine, that machine's Arena produced these numbers itself.
//
// **Second pass (block B24 continued): the tables themselves.** Unpacking the executable was the
// first half; reading it is the second. The page now reports every table the reader finds by its
// own words (the creature roster and the sheets each creature is drawn from, the classes, races and
// attributes, the provinces and all sixty-four settlements, the calendar, the level markers) plus
// the two joins that a player can see: which sheet each monster is drawn from, and whether the
// `.INF` roster's own monster slots come out in the executable's order. The checks below are those
// reads **produced in a browser, from the player's own copy** — the Minotaur's art among them.
//
// The checks are the four that cannot be faked by a decoder that returns plausible nonsense:
//
//   * the image is a whole number of paragraphs, and the footer's stack (`SS × 16 + SP`) ends
//     **exactly** at the image's end — arithmetic only a correctly stopped LZ stream can satisfy;
//   * the compressed relocation table that follows parses to **exactly** eight bytes before the end
//     of the file (the footer those eight bytes are);
//   * the entry the footer names is the image's own first byte, which is why the image opens with a
//     DOS prologue instead of a table;
//   * Arena's own words are in the image — its races, its province, and the line it prints when it
//     asks the player what class they want.

import path from 'node:path';

export function makeExeSuite({ check, realErrors, shots, getPort }) {
  return async function suiteExe(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?dungeon=Stonekeep&arena=${encodeURIComponent(arena)}`;
    await page.goto(url);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'the game page', timeoutMs: 120000 });

    const exe = await page.evalJs('window.__debug.exe()');
    check('the page can read the game\'s own executable out of the install, and it is PKLITE-packed',
      exe?.present !== false && exe?.file?.name === 'ACD.EXE' && exe?.version === '1.12',
      exe?.present === false ? exe.error : JSON.stringify({ file: exe?.file, version: exe?.version }));
    check('…with the flags the format table needs: "extra" literals and the "large" codebook, stream at 752',
      exe?.extra === true && exe?.large === true && exe?.streamOffset === 752 && exe?.imageStart === 96,
      JSON.stringify({ extra: exe?.extra, large: exe?.large, stream: exe?.streamOffset }));

    check('the unpacked image lands where a DOS load image has to: whole paragraphs, stack at its end',
      exe?.image === 305520 && exe?.paragraphs === 19095 && exe?.stackEnd === exe?.image,
      JSON.stringify({ image: exe?.image, paragraphs: exe?.paragraphs, stack: exe?.footer?.ss, sp: exe?.footer?.sp, stackEnd: exe?.stackEnd }));
    check('the entry the footer names is the image\'s own first byte — no separate header to read past',
      exe?.entry?.cs === 0 && exe?.entry?.ip === 0 && exe?.entry?.linear === 0,
      JSON.stringify(exe?.entry));

    check('the compressed relocation table parses after the image and ends on the file\'s own footer',
      exe?.relocations === 4044 && exe?.trailer === 8 && exe?.footer?.extraBytes === 0,
      JSON.stringify({ relocations: exe?.relocations, last: exe?.lastRelocation, trailer: exe?.trailer }));

    const anchors = exe?.anchors ?? [];
    const missing = anchors.filter((a) => a.at < 0).map((a) => a.text);
    check('the image is this game: Arena\'s own words are in it, at offsets inside it',
      anchors.length > 0 && missing.length === 0 && anchors.every((a) => a.at >= 0 && a.at < exe.image),
      missing.length ? `missing ${missing.join(', ')}` : anchors.map((a) => `${a.text}@${a.at}`).join(' · '));
    const thresholds = exe?.thresholds ?? [];
    check('and the wilderness draws\' own thresholds are numbers in it, not a guess',
      thresholds.length === 4 && thresholds.every((t) => t.hits > 0),
      thresholds.map((t) => `0x${t.word.toString(16)}×${t.hits}`).join(' '));

    // ── the tables, read in the page ────────────────────────────────────────────────────────
    const tables = exe?.tables?.tables ?? null;
    check('the page reads the game\'s own tables out of that image, by their own words',
      tables?.bestiaryRun?.count === 42 && tables?.creatureSheets?.count === 24
        && tables?.classes?.count === 19 && tables?.settlements?.count === 64
        && tables?.provinces?.count === 8 && tables?.months?.count === 12
        && tables?.weekdays?.count === 7 && tables?.holidays?.count === 15,
      JSON.stringify({
        bestiary: tables?.bestiaryRun?.count, sheets: tables?.creatureSheets?.count,
        classes: tables?.classes?.count, settlements: tables?.settlements?.count,
        provinces: tables?.provinces?.count, months: tables?.months?.count,
        weekdays: tables?.weekdays?.count, holidays: tables?.holidays?.count,
      }));
    const readings = exe?.tables?.readings ?? [];
    const red = readings.filter((r) => !r.ok);
    check('and every reading the tables are held to passes in the page too',
      readings.length >= 6 && red.length === 0,
      red.length ? red.map((r) => `${r.id}: ${r.detail}`).join(' | ') : readings.map((r) => r.id).join(' · '));

    // ── the join a player can see: which art a creature is drawn from ───────────────────────
    const art = exe?.art ?? null;
    const minotaur = (art?.monsters ?? []).find((m) => m.name === 'Minotaur');
    check('the creature tables pair index by index, and the one pair with nothing behind it is the Minotaur\'s',
      art?.agreed === 21 && art?.disagreed?.length === 2
        && art.disagreed[0]?.name === 'Minotaur' && art.disagreed[0]?.sheet === 'pat@.cfa'
        && art.disagreed[0]?.drawnBy === 'PAT' && art.disagreed[1]?.name === 'Fire Daemon',
      JSON.stringify(art?.disagreed));
    check('so the Minotaur is drawn from PAT, and no monster is left without art',
      minotaur?.exeFamily === 'pat' && minotaur?.sprite === 'PAT'
        && (art?.spriteDisagreements ?? ['x']).length === 0 && (art?.withoutExeArt ?? ['x']).length === 0,
      JSON.stringify({ minotaur, without: art?.withoutExeArt, disagree: art?.spriteDisagreements }));
    const slots = exe?.slots ?? null;
    check('and the .INF roster\'s own monster slots are the executable\'s order, all twenty-three',
      slots?.agreed === 23 && slots?.rows?.length === 23
        && slots.rows.find((r) => r.item === 39)?.id === 'minotaur'
        && slots.rows.find((r) => r.item === 39)?.exeName === 'Minotaur',
      JSON.stringify(slots?.rows?.filter((r) => !r.agrees) ?? []));

    // ── and the creature the tables gave back to the game, on the page ───────────────────────
    // Before this pass `monsters.js` carried the Minotaur with no sprite, so this seam answered
    // `null` before it loaded anything and no page could hold a Minotaur at all.
    const swPainted = Number(await page.evalJs('window.__debug.state().painted'));
    const spawned = JSON.parse(await page.evalJs(
      '(async () => JSON.stringify(await window.__debug.spawnMonster("minotaur")))()'));
    await page.waitFor(`window.__debug.state().painted > ${swPainted + 2}`,
      { label: 'the page after the Minotaur', timeoutMs: 30000 });
    const sheets = JSON.parse(await page.evalJs(
      'JSON.stringify((window.__debug.state().spriteFiles ?? []).filter((f) => /^PAT/.test(f)))'));
    check('the Minotaur is a creature the page can draw: its six sheets load and it stands in front of the player',
      spawned?.file === 'PAT1.CFA' && spawned?.name === 'Minotaur'
        && ['PAT1.CFA', 'PAT2.CFA', 'PAT3.CFA', 'PAT4.CFA', 'PAT5.CFA', 'PAT6.CFA']
          .every((f) => sheets.includes(f)),
      JSON.stringify({ spawned, sheets }));

    await page.screenshot(path.join(shots, 'exe-unpacked-in-page.png'));
    check('the executable suite leaves no console error behind',
      realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((q) => q.text).join(' | ').slice(0, 400));
  };
}
