// Suite: the living world — the town's clock, the hours its trades keep, and the watch.
//
// This is the twin's living world (`daggerfall/src/systems/livingWorld/*`) tailored to Arena
// and wired into the town (`game/livingWorld.js` + `scenes/interior.js`), and the claims a
// player would make about it are the ones checked here:
//
//   * **the town has a time of day**, and it is the same clock the HUD prints and the doors
//     obey — not three clocks that happen to agree;
//   * **its trades keep hours**. A smith shuts at eighteen and a tavern pours until two, so a
//     door the player walks up to after closing is *shut*, says so, and does not open a shop
//     that is bright and busy at three in the morning;
//   * **its people are doing something** — a trade, an hour and a plan (`dayPlanFor`) — which
//     the HUD reads out for whoever is standing nearest;
//   * **a crime brings the watch**, and a crime nobody saw brings nobody — the twin's own law,
//     with the squad capped so a street cannot grow a fresh one every time one falls.
//
// The clock is driven through the game's own door (`?clock=<minutes>` on the way in, and
// `setClock` afterwards) rather than by waiting twenty-four minutes for a day to pass, and the
// watch is driven through `callWatch`, which is the very function a blow at a townsperson
// calls. Everything else is the real page: the real city, the real door, the real `E`.

import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

export function makeLivingSuite({ check, realErrors, shots, getPort, decodePng, brightness }) {
  /**
   * A frame's mean brightness, 0..255 — the only way to check a *sky*.
   *
   * Every other claim in this suite is a number the page was asked for. This one is not: "is the
   * town darker at night" is about what a player sees, so the answer comes out of the pixels,
   * through the harness's own PNG reader (`brightness`) rather than one re-implemented here.
   */
  return async function suiteLiving(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const hud = () => page.evalJs('document.getElementById("hud")?.textContent ?? ""');
    const city = (extra = '') => `http://localhost:${PORT}/?location=Daggerfall&${q}${extra}`;
    const ready = (label = 'Daggerfall') => page.waitFor(
      'window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label, timeoutMs: 120000 },
    );

    // ── ten in the morning, and everything open ──────────────────────────────
    //
    // **The arrival hour is the scene's own choice**, and this is why: a player who travels
    // from the world map to a town walks up to a smith whose hours are 08:00–18:00, and an
    // arrival at the module's own default of six in the morning would greet them with a shut
    // door. Ten has every trade in the game open, and the evening comes later in a session —
    // `livingWorld.GAME_MINUTES_PER_REAL_MINUTE` is the twin's own `TimeScale 12`, a game minute
    // every five real seconds, so a town's whole twelve-hour day of business is an hour of play.
    //
    // **Which is why the minute is a window and not `0`.** The clock is running while the city
    // builds itself: a page that takes half a minute to load arrives a few game minutes after
    // ten, exactly as a player who walked in would. Asserting `minute === 0` was asserting that
    // the clock is stopped, and it held only while the rate was one game minute a real minute.
    await page.goto(city());
    await ready();
    const arrived = await page.evalJs('window.__debug.living()');
    check('a town has a time of day, and the player arrives at ten in the morning',
      arrived?.clock?.hour === 10 && arrived?.clock?.minute < 30 && arrived?.clock?.phase === 'morning',
      JSON.stringify(arrived?.clock ?? null));
    const arrivingHud = await hud();
    check('the HUD prints the same hour the clock reads',
      new RegExp(`It is 10:${String(arrived?.clock?.minute ?? -1).padStart(2, '0')} in the morning`).test(arrivingHud),
      arrivingHud.split('\n').filter((line) => /^It is /.test(line))[0]);
    // **And the HUD's own line really is in the band it lives in.** The panel is bottom-anchored
    // in the status band (below the original's 147th row); a line that only exists under the fold
    // is text a player never reads, which is what this measures rather than assumes.
    const band = await page.evalJs(`(() => {
      const rt = (id) => document.getElementById(id).getBoundingClientRect();
      const box = rt('hud');
      const line = document.getElementById('hud').textContent.split(String.fromCharCode(10))[0];
      return JSON.stringify({ top: Math.round(box.top), bottom: Math.round(box.bottom), status: Math.round(window.innerHeight * 0.735), visibleLines: Math.floor((box.height - 8) / 15.6), line });
    })()`);
    const bandBox = JSON.parse(band ?? 'null');
    check('and the HUD sits below the status line rather than over the world above it',
      (bandBox?.top ?? 0) >= (bandBox?.status ?? 1) - 1 && (bandBox?.bottom ?? 0) <= await page.evalJs('window.innerHeight'),
      `HUD ${bandBox?.top}…${bandBox?.bottom}, status line ${bandBox?.status}`);
    check('every trade the town keeps is open at that hour',
      Object.values(arrived?.open ?? {}).every(Boolean) && (arrived?.trades?.length ?? 0) >= 3,
      `${(arrived?.trades ?? []).join(', ')} → ${JSON.stringify(arrived?.open ?? null)}`);
    // The HUD is read once and held: `await` cannot go inside the `.every` callback below, and
    // a regex over a stale line is worse than one read taken just before the check.
    //
    // **One line for every trade** (the HUD lives in the status band and four trades cannot have
    // four lines of it), so the claim is that each open trade is named on the line that says
    // what is open — not that each has a sentence of its own.
    const morningHud = await hud();
    const tradeLine = morningHud.split('\n').find((line) => /^(Open:|Every trade here is shut)/.test(line)) ?? '';
    check('and the HUD says which of them the street holds',
      (arrived?.trades ?? []).every((kind) => {
        const name = kind === 'mages' ? 'Mages Guild' : kind === 'equipment' ? 'equipment store' : kind;
        return new RegExp(name, 'i').test(tradeLine);
      }),
      tradeLine);

    // ── its people have a day ────────────────────────────────────────────────
    const people = arrived?.people ?? [];
    check('the street is inhabited, and every person has a trade and something to be doing',
      people.length > 0 && people.every((person) => person.role && person.activity?.activity && person.word),
      `${people.length} people: ${people.slice(0, 4).map((p) => `${p.role} ${p.activity.activity}`).join(', ')}`);
    check('what they are doing is drawn from the plan\'s own vocabulary',
      people.every((person) => ['sleep', 'openShop', 'work', 'eat', 'drink', 'worship', 'wander', 'goHome']
        .includes(person.activity.activity)),
      JSON.stringify(people[0]?.activity ?? null));
    check('the HUD names the nearest person and their business',
      /is (working|opening up|drinking|eating|praying|walking|sleeping|going home|at work)/.test(await hud()),
      (await hud()).split('\n').filter((line) => / is /.test(line))[0]);
    await page.screenshot(path.join(shots, 'living-street.png'));

    // ── the shutters: the same clock, obeyed by a door ───────────────────────
    //
    // Twenty-three hundred (`?clock=1380`). The smith has gone home and the tavern is pouring;
    // standing in the smith's doorway and pressing `E` must be a *refusal* — the shop is shut —
    // and the player must still be on the street afterwards, which is the part that makes the
    // refusal real rather than a line of prose over a shop that opened anyway.
    await page.goto(city('&clock=1380'));
    await ready('Daggerfall, late');
    const late = await page.evalJs('window.__debug.living()');
    check('the hours pass: at twenty-three hundred the smith is shut and the tavern is not',
      late?.open?.equipment === false && late?.open?.tavern === true && late?.clock?.phase === 'night',
      `${JSON.stringify(late?.open ?? null)} at ${late?.word}`);
    await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("equipment"))');
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await settle(420);
    const refused = await page.evalJs('JSON.stringify({ shut: window.__debug.living().shutDoor, notice: window.__debug.state().notice ?? "", inside: window.__debug.state().inside ?? null, map: window.__debug.state().map })');
    const shut = JSON.parse(refused ?? 'null');
    check('a shut door is refused, and the game says why and when',
      shut?.shut?.kind === 'equipment' && /shut/.test(shut?.notice ?? '') && /come back in the morning/i.test(shut?.notice ?? ''),
      shut?.notice ?? '(nothing said)');
    check('and the player is still standing on the street, not in a shop that opened anyway',
      shut?.inside === null && /^CITY/.test(shut?.map ?? ''),
      `inside=${JSON.stringify(shut?.inside)} map=${shut?.map}`);

    // ── the clock can be moved, and the doors move with it ───────────────────
    await page.evalJs('window.__debug.setClock(600)');
    await settle();
    const morning = await page.evalJs('window.__debug.living()');
    check('putting the clock back to ten in the morning opens the smith again',
      morning?.open?.equipment === true && morning?.clock?.hour === 10,
      `${JSON.stringify(morning?.open ?? null)} at ${morning?.word}`);

    // ── the sun obeys the same clock ─────────────────────────────────────────
    //
    // The light is the twin's own day/night law (`game/daylight.js`, DFU's `SunlightManager` arc
    // and `PlayerAmbientLight`), and the claim a player would make about it is that the sky and
    // the doors are the *same* hour: a shut smith at 23:00 under a noon sky was the defect this
    // half of the suite exists for.
    const dayLight = await page.evalJs('window.__debug.light()');
    check('at ten in the morning the sun is up, high, and the frame is lit by the day\'s own light',
      dayLight?.night === false && dayLight?.elevation > 0.5 && dayLight?.sunScale > 0.8 && dayLight?.skyMix < 0.15,
      JSON.stringify(dayLight ?? null).slice(0, 220));
    check('…and the sun is not straight overhead, which is what a fixed light looked like',
      dayLight?.sunDir?.[0] < 0.95 && dayLight?.sunDir?.[1] > 0.5,
      `sun ${JSON.stringify(dayLight?.sunDir ?? null)} at ${dayLight?.hour}:00`);
    const beforeDark = dayLight?.ambient?.[0] ?? 0;
    // What a player actually sees at ten in the morning, in pixels, before the sun moves.
    const dayFrame = await brightness(page, 'living-day.png');
    check('and the daytime frame is a lit picture rather than a blank one',
      dayFrame.mean > 24 && dayFrame.stats.distinctColors > 24,
      `${dayFrame.mean.toFixed(1)} of 255, ${dayFrame.stats.distinctColors} colours`);

    await page.evalJs('window.__debug.setClock(1380)');
    await settle(600);
    const nightLight = await page.evalJs('window.__debug.light()');
    check('at twenty-three hundred the sun has gone down and the frame knows it',
      nightLight?.night === true && nightLight?.sunScale === 0 && Math.abs(nightLight?.elevation ?? 1) < 1e-9,
      JSON.stringify(nightLight ?? null).slice(0, 220));
    check('and the town is genuinely darker — the ambient, the sun and the sky all move',
      (nightLight?.ambient?.[0] ?? 1) < beforeDark * 0.6 && nightLight?.skyMix > 0.5,
      `ambient ${beforeDark} → ${nightLight?.ambient?.[0]}, sky mixed ${nightLight?.skyMix}`);
    // **The same street, at night, in pixels.** The numbers above are the light the renderer was
    // handed; this is the claim that the renderer did something with it — the defect a reader of
    // `__debug` alone could never catch is a pass that is computed every frame and drawn with
    // none of it.
    const nightFrame = await brightness(page, 'living-night.png');
    check('and the same street, photographed, really is darker than it was at ten',
      nightFrame.mean < dayFrame.mean * 0.8,
      `${dayFrame.mean.toFixed(1)} → ${nightFrame.mean.toFixed(1)} of 255`);

    // ── and the dawn on the other side of it ─────────────────────────────────
    //
    // **On the same page and at the same pose as the night frame**, deliberately: the two
    // pictures are being compared, so a fresh page load (a different spawn, a different camera)
    // would compare two *scenes* rather than two hours. It caught exactly that when this block
    // was written below a `goto`.
    await page.evalJs('window.__debug.setClock(360)');
    await settle(600);
    const dawnLight = await page.evalJs('window.__debug.light()');
    check('and at dawn the sun is coming up in the east, low, and warm',
      dawnLight?.night === false && dawnLight?.sunDir?.[0] > 0.9 && dawnLight?.elevation < 0.2,
      `sun ${JSON.stringify(dawnLight?.sunDir ?? null)} elevation ${dawnLight?.elevation}`);
    const dawnFrame = await brightness(page, 'living-dawn.png');
    check('and the dawn frame is brighter than the midnight one, which the picture has to show',
      dawnFrame.mean > nightFrame.mean,
      `night ${nightFrame.mean.toFixed(1)} → dawn ${dawnFrame.mean.toFixed(1)} of 255`);

    await page.evalJs('window.__debug.setClock(600)');
    await settle(400);

    // ── the tuning door still pins the light ────────────────────────────────
    //
    // `?ambient=` and `?sun=` are what a probe uses to compare two builds under the same light
    // (they are where `docs/PROGRESS.md`'s measured numbers came from), so the hour must **stand
    // down** when either is given — a number a caller pinned and the clock then overrode every
    // frame would be worse than no door at all. This loads its own page, so it comes last.
    await page.goto(city('&ambient=0.9&sun=1.1'));
    await ready('Daggerfall, pinned');
    const pinned = await page.evalJs('window.__debug.light()');
    check('a pinned light stays pinned, whatever the hour does to it',
      pinned?.forced === true && Math.abs((pinned?.ambient?.[0] ?? 0) - 0.9) < 0.01
      && Math.abs((pinned?.sunScale ?? 0) - 1.1) < 0.01 && pinned?.skyMix === null,
      JSON.stringify(pinned ?? null).slice(0, 220));
    check('…and the clock is still the clock, even under a pinned light',
      pinned?.hour === 10 && pinned?.night === false,
      `${pinned?.hour}:00, night=${pinned?.night}`);
    const sameDoor = await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("equipment"))');
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug.state().inside !== null', { label: 'inside at ten', timeoutMs: 90000 });
    const inside = await page.evalJs('window.__debug.state()');
    check('and the very same door lets the player in during its own hours',
      inside?.inside?.kind === 'equipment' && JSON.parse(sameDoor ?? 'null')?.kind === 'equipment',
      `${inside?.map} · ${inside?.inside?.name}`);

    // ── the watch ────────────────────────────────────────────────────────────
    //
    // Back out on the street, at an hour the watch is about. A murder seen by the street brings
    // armed men; a murder seen by nobody brings nobody; and the squad is capped, so the street
    // cannot keep producing them.
    await page.goto(city('&clock=1200'));
    await ready('Daggerfall, midday');
    const nobody = await page.evalJs('JSON.stringify(window.__debug.callWatch("murder", 0))');
    const unseen = JSON.parse(nobody ?? 'null');
    check('a crime nobody saw is nobody\'s business: the watch does not come',
      unseen?.action === 'none' && unseen?.count === 0 && /nobody saw it/.test(unseen?.reason ?? ''),
      JSON.stringify(unseen));

    const seen = await page.evalJs('JSON.stringify(window.__debug.callWatch("murder", 4))');
    const squad = JSON.parse(seen ?? 'null');
    check('a murder the street saw brings the watch, armed',
      squad?.action === 'attack' && squad?.count >= 1,
      `${squad?.count} of the watch: ${squad?.note}`);
    // **The crowd is the roster.** `count` is what this crime brought; `guards` is everybody
    // sworn in, which is the number a view of the street can show — the difference matters
    // because the squad is drawn from the people present rather than minted.
    const sworn = await page.evalJs('window.__debug.living().people.filter((p) => p.watch).length');
    check('and they are the people standing there, sworn in — the count is the module\'s own cap',
      sworn === squad?.guards && squad?.count >= 1 && squad?.count <= 5,
      `${squad?.count} of a possible ${await page.evalJs('window.__debug.living().people.length')}, ${sworn} sworn`);

    const again = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.callWatch("murder", 4))') ?? 'null');
    const total = await page.evalJs('window.__debug.living().people.filter((p) => p.watch).length');
    check('and the street does not grow a second squad out of the same crowd',
      total <= 5 && (again?.count ?? 0) <= 5,
      `${squad?.count} → ${total} of the watch after a second murder`);

    const assault = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.callWatch("assault", 2))') ?? 'null');
    check('the crime\'s own strength decides the answer, as the module\'s table says',
      assault?.action === 'attack' && assault?.crime === 'assault',
      JSON.stringify(assault));
    await page.screenshot(path.join(shots, 'living-watch.png'));

    // ── the town goes about its day ──────────────────────────────────────────
    //
    // The second half of "npcs dont move around": the first fix gave every person a random
    // step, and this is the walk their *plan* names — the door of their trade, their temple, the
    // tavern, their own home cell — found over the level's own streets
    // (`game/townPaths.js`, the twin's `livingWorld/townPaths.js`). The block above ends at
    // eleven at night, when the street has gone to bed, so the clock goes back to ten in the
    // morning first: the hour when a town's own business is on the pavement.
    await page.evalJs('window.__debug.setClock(600)');
    await settle(400);
    const walksAtFirst = await page.evalJs('window.__debug.townWalks()');
    check('a town has streets to walk on, and the path book knows them',
      (walksAtFirst?.grid?.walkable ?? 0) > 500 && (walksAtFirst?.people ?? 0) > 0,
      `${walksAtFirst?.grid?.walkable} walkable cells for ${walksAtFirst?.people} people, ${walksAtFirst?.keepers} keepers`);
    check('somebody has set off somewhere', (walksAtFirst?.departures ?? 0) > 0,
      `${walksAtFirst?.departures} departures, ${walksAtFirst?.moving} on their way`);
    check('and what they are on their way to is a place their own day named',
      (walksAtFirst?.goals ?? []).length > 0
      && (walksAtFirst?.goals ?? []).every((g) => /home|shop|work|eat|drink|pray|wander|street/.test(g.reason ?? '')),
      JSON.stringify((walksAtFirst?.goals ?? []).slice(0, 3)));
    const crossing = await page.evalJs(`(() => {
      const goals = window.__debug.townWalks().goals;
      const long = goals.filter((g) => Math.abs(g.goal.row - g.from.row) + Math.abs(g.goal.col - g.from.col) > 1);
      return { of: goals.length, long: long.length, sample: long[0] ?? null };
    })()`);
    check('a walk is more than one cell: somebody is crossing the town',
      (crossing?.long ?? 0) > 0, JSON.stringify(crossing?.sample ?? null));

    // …and they get there, which is the only proof that a route was walked rather than aimed.
    let walked = null;
    // **The most a frame ever spent**, not the number the last read happened to catch: the
    // budget is a claim about every frame of a town's morning, and a single sample of an idle
    // frame would prove nothing at all (it is zero).
    let busiest = 0;
    // Sampled every 60 ms: a search happens in a few frames at a time, and a 700 ms sampler
    // missed every one of them on some runs. The window is the same length (about 36 s).
    for (let i = 0; i < 600; i++) {
      await settle(60);
      walked = await page.evalJs('window.__debug.townWalks()');
      busiest = Math.max(busiest, walked?.book?.spent ?? 0);
      if ((walked?.arrivals ?? 0) > 0) break;
    }
    check('and somebody arrives: a route is walked to its end, not merely aimed',
      (walked?.arrivals ?? 0) > 0 && (walked?.departures ?? 0) >= (walked?.arrivals ?? 0),
      `${walked?.departures} departures, ${walked?.arrivals} arrivals, ${walked?.moving} still walking`);
    check('the walking costs a frame a bounded amount of searching, not an unbounded one',
      busiest > 0 && busiest <= 6000 && (walked?.book?.known ?? 0) > 0,
      `book: ${walked?.book?.known} walks known, ${walked?.book?.waiting} waiting, ${busiest} cells spent in the busiest frame`);
    // A person who walked is *somewhere else* than the cell they were placed on — the homes the
    // regard ledger and every offer are keyed by do not move, so this is the difference between
    // a town that moves and a town whose records moved with it.
    const displaced = await page.evalJs(`(() => {
      const people = window.__debug.people() ?? [];
      const moved = people.filter((p) => p.home && (p.place.row !== p.home.row || p.place.col !== p.home.col));
      return { moved: moved.length, of: people.length, sample: moved[0] ?? null };
    })()`);
    check('and the town\'s records stayed where they belong: people move, their homes do not',
      (displaced?.moved ?? 0) > 0 && Boolean(displaced?.sample?.home),
      `${displaced?.moved} of ${displaced?.of} away from home, e.g. ${JSON.stringify(displaced?.sample?.place ?? null)} from home ${JSON.stringify(displaced?.sample?.home ?? null)}`);

    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
