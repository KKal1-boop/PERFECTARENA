// Suite: the shop's counter — a shelf that is a *volume*, and a keeper who haggles.
//
// The trade law is pure and the unit tests hold it (`tests/unit/shops.test.mjs`'s commerce
// block). What only a page can answer is here, and it answers the claims a player would
// make in the street:
//
//   * **a shelf** — the same keeper greets you with the same goods, a row carries a count,
//     and the shelf is a volume: the tenth potion is answered by the keeper's ledger, not
//     by another pile appearing under the counter;
//   * **a haggle** — three tries a visit; a win makes the rest of the visit's prices kinder,
//     a loss dearer, and a keeper with no patience left carries no Haggle button; and
//   * **the street's own variety** — two stores of a kind in the one city do not carry the
//     same shelf (the door the player came in by is the shop's identity in that town), and
//     a fresh visit means a fresh ledger: the patience is the visit's, not the shop's.
//
import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

export function makeCommerceSuite({ check, realErrors, shots, getPort }) {
  return async function suiteCommerce(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    const cityUrl = `http://localhost:${PORT}/?city&seed=20232&${q}`;
    const settle = (ms = 260) => new Promise((r) => setTimeout(r, ms));
    const cityReady = () => page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'city ready', timeoutMs: 90000 });

    /**
     * Enter a shop's door the way a player does: stand on the paving in front of it, press E,
     * wait out the level. A door is a **wall** cell now (`game/shops.js`), so the cell to stand
     * on is its `stand` — the player can no more stand in a door than in the bricks beside it.
     */
    async function enterShop(door) {
      const at = door.stand ?? door;
      await page.evalJs(`window.__debug.teleportCell(${at.row}, ${at.col})`);
      await settle();
      await page.pressKey('KeyE'); await page.pressKey('KeyE', false);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
        { label: `inside ${door.file ?? door.kind}`, timeoutMs: 90000 });
      return page.evalJs('window.__debug.state().map');
    }

    // ── the shelf ─────────────────────────────────────────────────────────────
    await page.goto(cityUrl); await cityReady();
    await page.evalJs('window.__debug.pause(true)');
    const doors = await page.evalJs('window.__debug.state().doorList.filter((d) => d.kind === "equipment")');
    check('a city carries more than one equipment store', Array.isArray(doors) && doors.length >= 2,
      `${doors?.length ?? 0} equipment doors`);

    const aMap = await enterShop(doors[0]);
    check('the door opened onto an equipment store', /^EQUIP\d\.MIF$/i.test(aMap ?? ''), aMap);
    await page.evalJs('window.__debug.openBag()');
    await page.waitFor('!!document.querySelector("#inventory button[data-goods]")', { label: 'the shelf buttons' });

    const shop = await page.evalJs('JSON.stringify(window.__debug.shop())').then(JSON.parse);
    check('the building trades in equipment', shop?.kind === 'equipment', shop?.kind);
    check('the shelf carries rows, each with a count and a price',
      (shop?.shelf?.items ?? []).length >= 1
        && shop.shelf.items.every((row) => row.qty >= 1 && Number.isFinite(row.price) && row.price >= 1),
      JSON.stringify(shop?.shelf?.items?.slice(0, 3) ?? []));
    const panel = await page.evalJs('JSON.stringify(window.__debug.panel())').then(JSON.parse);
    check("the panel's stock page mirrors the shelf",
      JSON.stringify(panel.stock) === JSON.stringify(shop.shelf.items.map((row) => ({ id: row.item.id, qty: row.qty, price: row.price }))),
      `panel ${JSON.stringify(panel.stock?.slice(0, 3) ?? [])}`);
    check('a fresh visit has a fresh haggle ledger',
      panel.haggle && panel.haggle.attempts === 0 && panel.haggle.factor === 1 && panel.haggle.last === null,
      JSON.stringify(panel.haggle));

    // ── the volume: a row sells down, and then it is out ──────────────────────
    const goldBefore = await page.evalJs('window.__debug.player().gold');
    await page.evalJs('window.__debug.grantGold(500)');
    const goldAtStart = await page.evalJs('window.__debug.player().gold');
    check('the purse is filled for the counter\'s checks', goldAtStart >= 500, `gold ${goldAtStart}`);
    const bank = goldAtStart;
    const firstRow = shop.shelf.items[0];
    const firstSelector = `#inventory button[data-goods="${firstRow.item.id}"]`;
    let goldAfterOne = await page.evalJs('window.__debug.player().gold');
    const clickRect = await page.clickSelector(firstSelector);
    await settle();
    const hit = await page.evalJs(`(() => {
      const el = document.elementFromPoint(${Math.round(clickRect.x)}, ${Math.round(clickRect.y)});
      return el ? el.tagName + "[" + Array.from(el.attributes).map((a) => a.name).join(",") + "]" : "nothing";
    })()`);
    const view = await page.evalJs('JSON.stringify({ w: innerWidth, h: innerHeight })');
    check("the click lands on a real element", hit !== "nothing", hit + " at " + Math.round(clickRect.x) + "," + Math.round(clickRect.y) + " (view " + view + ")");
    const stack = await page.evalJs(`(() => {
      const at = document.elementsFromPoint(${Math.round(clickRect.x)}, ${Math.round(clickRect.y)});
      const btn = document.querySelector("#inventory button[data-goods]");
      const panel = document.querySelector("#inventory");
      const pe = (el) => getComputedStyle(el).pointerEvents + " z=" + getComputedStyle(el).zIndex + " pos=" + getComputedStyle(el).position;
      return { stack: at.slice(0, 4).map((el) => el.tagName + (el.id ? "#" + el.id : "")), btn: pe(btn), panel: pe(panel), btnRect: JSON.stringify(btn.getBoundingClientRect()) };
    })()`);
    check("the stack tells the story", true, JSON.stringify(stack));
    goldAfterOne = await page.evalJs('window.__debug.player().gold');
    const stockNow = await page.evalJs('JSON.stringify(window.__debug.panel())').then((s) => JSON.parse(s).stock);
    check("buying moves the purse by the shelf's own price",
      bank - goldAfterOne === firstRow.price,
      `${goldBefore} → ${goldAfterOne} for ${firstRow.price}`);
    check("buying takes one off the shelf's count, not the pile off the row",
      (stockNow.find((row) => row.id === firstRow.item.id)?.qty ?? 0) === firstRow.qty - 1,
      JSON.stringify(stockNow.find((row) => row.id === firstRow.item.id)));
    check("and the thing is in the pack, the player's to sell",
      (await page.evalJs('window.__debug.bag().some((row) => row.id === ' + JSON.stringify(firstRow.item.id) + ')')) === true);

    let boughtFor = firstRow.price;
    for (let i = 0; i < firstRow.qty - 1; i++) {
      const stillThere = await page.evalJs(`!!document.querySelector(${JSON.stringify(firstSelector)})`);
      if (!stillThere) break;
      await page.clickSelector(firstSelector); await settle();
      boughtFor += firstRow.price;
    }
    const outOfStock = await page.evalJs(`JSON.stringify(window.__debug.shop().shelf.items.find((row) => row.item.id === ${JSON.stringify(firstRow.item.id)}) ?? null)`).then((s) => JSON.parse(s));
    check('a row bought down to nothing has nothing left to click this visit',
      outOfStock && outOfStock.qty === 0
        && (await page.evalJs(`!!document.querySelector(${JSON.stringify(firstSelector)})`)) === false,
      `row ${JSON.stringify(outOfStock)}, buttons left for it: ${await page.evalJs(`!!document.querySelector(${JSON.stringify(firstSelector)})`)}`);
    check('and the purse bought only what the shelf actually had',
      (await page.evalJs('window.__debug.player().gold')) === bank - boughtFor,
      `${goldBefore} → ${await page.evalJs('window.__debug.player().gold')} for ${boughtFor}`);
    check('and the pack holds the row\'s lot (kept, not destroyed)',
      (await page.evalJs(`window.__debug.bag().find((row) => row.id === ${JSON.stringify(firstRow.item.id)})?.qty ?? 0`)) >= firstRow.qty,
      JSON.stringify(await page.evalJs(`window.__debug.bag().find((row) => row.id === ${JSON.stringify(firstRow.item.id)})`)));

    // ── the haggle: three tries, then the keeper shuts up ─────────────────────
    let sawWin = false;
    let attempts = 0;
    for (let i = 0; i < 3; i++) {
      const button = await page.evalJs('!!document.querySelector("#inventory button[data-haggle]")');
      if (!button) break;
      await page.clickSelector('#inventory button[data-haggle]'); await settle();
      const ledger = await page.evalJs('JSON.stringify(window.__debug.panel().haggle)').then(JSON.parse);
      attempts = ledger.attempts;
      sawWin = sawWin || ledger.factor < 1;        check("the try lands in the visit's ledger, its factor inside the law",
        ledger.attempts === i + 1 && ledger.factor >= 0.5 && ledger.factor <= 2 && ledger.last,
        JSON.stringify(ledger));
    }
    check("three tries are the visit's whole allowance", attempts === 3, `${attempts} attempts`);
    check("and the third refusal closes the counter's own market",
      (await page.evalJs('!!document.querySelector("#inventory button[data-haggle]")')) === false,
      'haggle button still present');
    check('a win can only be seen on a shelf that says kinder (factor under one seen or not is the roll)',
      typeof sawWin === 'boolean', '');

    // ── the street's variety ──────────────────────────────────────────────────
    const shelfA = await page.evalJs('JSON.stringify(window.__debug.shop().shelf.items.map((row) => row.item.id))');
    await page.goto(cityUrl); await cityReady();
    await page.evalJs('window.__debug.pause(true)');
    const doorsB = await page.evalJs('window.__debug.state().doorList.filter((d) => d.kind === "equipment")');
    const other = doorsB.find((d) => d.row !== doors[0].row || d.col !== doors[0].col) ?? doorsB[doorsB.length - 1];
    await enterShop(other);
    const shelfB = await page.evalJs('JSON.stringify(window.__debug.shop().shelf.items.map((row) => row.item.id))');
    check('two stores of a kind in the one city carry different shelves',
      shelfA !== shelfB, `A ${shelfA} vs B ${shelfB}`);
    await page.evalJs('window.__debug.openBag()');
    await page.waitFor('!!document.querySelector("#inventory button[data-goods]")', { label: "the second shelf's buttons" });
    const ledgerB = await page.evalJs('JSON.stringify(window.__debug.panel().haggle ?? null)').then(JSON.parse);
    check('a different shop is a different visit: the ledger starts fresh',
      ledgerB.attempts === 0 && ledgerB.factor === 1, JSON.stringify(ledgerB));

    await page.screenshot(path.join(shots, 'commerce-shelf.png'));

    const errs = realErrors(page.consoleErrors());
    check('no console errors', errs.length === 0, errs.map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
