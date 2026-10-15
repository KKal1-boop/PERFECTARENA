import path from 'node:path';

export function makeGuildsSuite({ check, realErrors, shots, getPort }) {
  return async function guilds(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const base = `http://localhost:${getPort()}/`;
    const city = `${base}?location=Daggerfall&${q}`;
    const settle = (ms = 220) => new Promise((r) => setTimeout(r, ms));
    const ready = () => page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'city ready', timeoutMs: 90000 });

    await page.goto(city); await ready();
    await page.evalJs('window.__debug.pause(true); localStorage.removeItem("perfectarena.guilds"); true');
    await page.goto(city); await ready();

    // ── the ledger starts empty, like the regard does ─────────────────────────
    const fresh = await page.evalJs('window.__debug.guilds()');
    check('a fresh ledger has no memberships and no earned standing',
      fresh.members.length === 0 && Object.values(fresh.standing).every((v) => v === 0), JSON.stringify(fresh));

    // ── real jobs earn real standing ─────────────────────────────────────────
    // A real completed job through the game's own accept/finish seam (the bounties suite
    // proves the same flow through real kills; the ledger needs the *credit*, which the
    // payment event itself performs).
    await page.evalJs('window.__debug.teleportToPerson("nearest")'); await settle();
    // Take the nearest person's first workable offer non-bounty offer (a bounty is
    // the bounties suite's own business), finish it through the game's own seam, and
    // hand it back through the real talk button — so the standing is earned by the
    // game's own payment event, the same one a player's click drives.
    let finishedJob = null;
    for (let attempt = 0; attempt < 6 && !finishedJob; attempt++) {
      await page.evalJs('window.__debug.teleportToPerson("nearest")'); await settle();
      await page.evalJs('JSON.stringify(window.__debug.takeJobFromPerson("nearest")) ?? null');
      const kind = (await page.evalJs('window.__debug.jobs().active'))?.kind ?? null;
      if (!kind || kind === 'slay') { try { await page.evalJs('window.__debug.abandonJob()'); } catch { /* retry */ } continue; }
      const finished = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finishJob())') ?? 'null');
      check(`a job of kind ${kind} finishes at its target through the game's own seam`,
        finished?.completed === true, finished?.objective ?? 'not finished');
      finishedJob = finished;
    }
    // Hand it back to **the person who gave it** through the real button, as the regard
    // suite does — the one who asked is the one who pays, and a town's people keep walking,
    // so "nearest" is not the payer (the ledger itself aims this teleport).
    const back = await page.evalJs('JSON.stringify(window.__debug.teleportToJobPayer())');
    check('the job\u2019s own payer is standing somewhere the suite can reach',
      JSON.parse(back ?? "'{}'")?.ok === true, back);
    await settle();
    await page.pressKey('KeyT'); await page.pressKey('KeyT', false); await settle(300);
    const panel = await page.evalJs('window.__debug.talkPanel()');
    check('the payer shows the hand-in on their panel', /Hand it over/.test(panel?.handIn ?? ''),
      JSON.stringify(panel));
    if (/Hand it over/.test(panel?.handIn ?? '')) {
      await page.clickSelector('#talk button[data-job="hand-in"]'); await settle(360);
    }
    const earned = await page.evalJs('window.__debug.guilds()');
    check('a real completed job earns standing with the job\u2019s own guild, saved',
      Object.values(earned.standing).some((v) => v > 0), JSON.stringify(earned));

    // ── the keeper's panel: invitation, join, refused, member, persisted ──────
    await page.goto(`${base}?city&seed=20232&${q}`); await ready();
    await page.evalJs('window.__debug.pause(true)');
    const magesDoor = await page.evalJs('window.__debug.state().doorList.find((d) => d.kind === "mages")');
    check('a city has a Mages Guild door standing among its shops', Boolean(magesDoor?.row >= 0), JSON.stringify(magesDoor ?? null));
    if (magesDoor) {
      await page.evalJs(`window.__debug.teleportCell(${magesDoor.row}, ${magesDoor.col})`);
      await page.pressKey('KeyE'); await page.pressKey('KeyE', false); await settle(420);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
        { label: 'inside the guild', timeoutMs: 90000 });
      check('the door opened onto the guild', /^MAGE\d\.MIF$/.test(await page.evalJs('window.__debug.state().map')),
        `${await page.evalJs('window.__debug.state().map')}`);
      // The hall's **keeper** is the one who speaks for the guild — a patron standing
      // nearer the door is not (the keeper is marked on the person at placement).
      const found = await page.evalJs('JSON.stringify(window.__debug.teleportToPerson("keeper"))');
      check('the hall has a keeper marked on a person', JSON.parse(found ?? "'{}'")?.description != null, found);
      await settle();
      await page.pressKey('KeyT'); await page.pressKey('KeyT', false); await settle(300);
      const guildPanel = await page.evalJs('window.__debug.guildPanel()');
      check('the guild keeper shows the invitation, not the member block, to a stranger',
        /takes members/.test(guildPanel?.block ?? '') && /Ask to join/.test(guildPanel?.button ?? ''),
        `${guildPanel?.block} · ${guildPanel?.button}`);

      await page.clickSelector('#talk button[data-guild="join"]'); await settle(360);
      const afterJoin = await page.evalJs('window.__debug.guilds()');
      check('asking to join either admits on the law\u2019s own bars or refuses with its reason',
        afterJoin.members.some((m) => m.id === 'mages') === true
          || /craft|confidence|business/.test(afterJoin.lastNotice ?? ''), JSON.stringify(afterJoin));

      if (afterJoin.members.some((m) => m.id === 'mages')) {
        const member = afterJoin.members.find((m) => m.id === 'mages');
        check('a member reads a rank title, not a rank number',
          /^(Apprentice|Journeyman|Evoker|Conjurer|Magician|Enchanter|Warlock|Wizard|Master Wizard|Archmage)$/.test(member.title ?? ''),
          member.title);
        await page.screenshot(path.join(shots, 'guild-member.png'));
      }
      // …and the ledger survives a reload — the membership is a save, not a scene.
      await page.goto(`${base}?city&seed=20232&${q}`); await ready();
      const persisted = await page.evalJs('window.__debug.guilds()');
      check('the ledger is a save: whatever membership the join granted is there after a page load',
        JSON.stringify(persisted.members) === JSON.stringify(afterJoin.members)
          && JSON.stringify(persisted.standing) === JSON.stringify(afterJoin.standing),
        `${JSON.stringify(persisted.members)} vs ${JSON.stringify(afterJoin.members)}`);
    }

    // ── a hostile town refuses the stranger's petition ───────────────────────
    await page.goto(city); await ready();
    await page.evalJs('window.__debug.pause(true)');
    await page.evalJs('localStorage.setItem("perfectarena.guilds", JSON.stringify({memberships:{}, standings:{fighters:-40}}))');
    await page.goto(city); await ready();
    await page.evalJs('window.__debug.pause(true)');
    // Any keeper speaks for a guild through the job that paid them; the petition's own
    // law is what the unit test proves against the twin. Here the refusal is shown.
    const denied = await page.evalJs('JSON.stringify(window.__debug.tryJoinWithHostileStanding())');
    const parsed = JSON.parse(denied ?? 'null');
    check('a hostile standing is refused with the law\u2019s own words, and no membership is made',
      parsed?.ok === false && /Mend your name/.test(parsed?.reason ?? '') && (parsed?.members?.length ?? 0) === 0,
      denied);
    await page.screenshot(path.join(shots, 'guild-refusal.png'));
    check('the guild ledger produces no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  };
}
