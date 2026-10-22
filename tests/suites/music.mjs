// SUITE: THE SOUNDTRACK — which song a place hears, and that only one plays at a time.
//
// The owner, 2026-10-19: *"town music is not correct ... all musics are not the correct ones"*
// and *"they overlap"*. The law is `game/arenaMusic.js`, read against the reference's own
// `MusicDefinitions.txt`: a settlement's ambience is its **weather** (`SUNNYDAY`, `OVERCAST`,
// `RAINING`, `SNOWING`/`OVERSNOW`), its arrival is the `[Jingle]` (`CITY`/`TOWN`/`VILLAGE`, the
// `ARAB*` in a desert), the night is `NIGHT` from 17:40 to 06:19, and a building is its trade.
//
// The scene exposes `__debug.music()`: the player's state (`song`, `jingle`, `volume`) plus the
// place's own reading (`place.song`). This suite holds a village, a town in rain, a dungeon at
// night and a city at night to it, and then drags the settings slider to silence.

export function makeMusicSuite({ check, realErrors, getPort }) {
  return async function musicSuite(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const url = (rest) => `http://localhost:${getPort()}/?${rest}&${q}`;
    const settle = (ms = 160) => new Promise((r) => setTimeout(r, ms));
    /** Open a page and wait for its level, not merely for the document. */
    const enter = async (rest) => {
      await page.goto(url(rest));
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
        { label: rest, timeoutMs: 120000 });
      // The browser's autoplay law: the page's `AudioContext` starts suspended, and a jingle
      // waits for the first gesture (`musicPlayer.unlock`). A real player touches the page; the
      // suite gives it a harmless key so the cue actually starts.
      await page.pressKey('ShiftLeft');
      await page.pressKey('ShiftLeft', false);
      await settle(500);
      // A second gesture: the jingle's own `unlock` is registered only when its song has
      // arrived, which can be after the first key.
      await page.pressKey('ShiftLeft');
      await page.pressKey('ShiftLeft', false);
      await settle(250);
    };
    const music = () => page.evalJs('window.__debug.music()');

    // ── a village: VILLAGE greets, then clear weather keeps the street ──────────
    await enter('city=village&seed=7&clock=720');
    const village = await music();
    check('a village asks for its own jingle, VILLAGE',
      village.jingle === 'VILLAGE.XMI' || village.jingleRequested === 'VILLAGE.XMI',
      JSON.stringify({ jingle: village.jingle, requested: village.jingleRequested, place: village.place?.song }));
    check('and the village street’s ambience is the clear weather’s song, not another jingle',
      village.place?.song === 'SUNNYDAY.XFM', JSON.stringify(village.place));
    check('SUNNYDAY loops at the official 0:48, not the file’s 2:12 with its silent tail',
      village.seconds === 48, `${village.seconds} s`);
    // The jingle is 2.4 s; after it, the ambience is the only thing left playing.
    await page.waitFor('window.__debug.music().jingle == null', { label: 'the jingle ends', timeoutMs: 15000 });
    const afterVillage = await music();
    check('the jingle ends by itself and leaves the weather song alone, with no second song under it',
      afterVillage.jingle == null && afterVillage.place?.song === 'SUNNYDAY.XFM',
      JSON.stringify({ jingle: afterVillage.jingle, place: afterVillage.place?.song }));

    // ── a town in rain: TOWN, then RAINING ─────────────────────────────────────
    await enter('city=town&seed=11&weather=rain&clock=720');
    const town = await music();
    check('a town asks for TOWN, and its rain is RAINING — the `.INF` letter read as weather',
      (town.jingle === 'TOWN.XMI' || town.jingleRequested === 'TOWN.XMI') && town.place?.song === 'RAINING.XMI',
      JSON.stringify({ jingle: town.jingle, requested: town.jingleRequested, place: town.place?.song }));

    // ── a city at night: NIGHT from 17:40, not from the daylight shader's dusk ──
    await enter('city=city&seed=3&clock=1080');   // 18:00
    const nightCity = await music();
    check('at 18:00 a city hears NIGHT (the music clock switches at 17:40)',
      nightCity.place?.song === 'NIGHT.XMI', JSON.stringify(nightCity.place));
    await enter('city=city&seed=3&clock=1050');   // 17:30, before the switch
    const duskCity = await music();
    check('and at 17:30 it still hears the weather, because the switch is 17:40',
      duskCity.place?.song === 'SUNNYDAY.XFM', JSON.stringify(duskCity.place));

    // ── a dungeon: its own stone, and no jingle ────────────────────────────────
    await enter('interior=START.MIF&clock=720');
    const dungeon = await music();
    check('a dungeon hears one of DUNGEON1…5 and is never greeted with a town jingle',
      /^DUNGEON[1-5]\.XFM?$/.test(dungeon.place?.song ?? '') && dungeon.jingleRequested == null,
      JSON.stringify({ place: dungeon.place?.song, jingle: dungeon.jingle }));

    // ── a tavern: TAVERN, and its percussion channel really plays ─────────────
    // The corrected XMIDI reader gives a note-on its own length and sends channel 10 to the
    // drum synth; the old reader read the next status as a velocity and made pitched noise
    // out of every snare. A tavern is the shortest song with a drum channel (158 hits).
    await enter('interior=TAVERN1.MIF&clock=720');
    const tavern = await music();
    check('a tavern hears TAVERN, the install’s own 0:29 tune, with its drum channel loaded',
      tavern.place?.song === 'TAVERN.XMI' && Number(tavern.notes) > 400,
      JSON.stringify({ song: tavern.place?.song, notes: tavern.notes, seconds: tavern.seconds }));

    // ── fast travel, in place: the dungeon's song stops, the city's starts ─────
    //
    // `M` opens the world map as a layer over this scene, and a marker hands the location
    // back to it without a page load. The old scene is disposed (`stopMusic`) and the new one
    // asks for its own place; this is the "changed scenario" handoff the owner reported.
    await page.pressKey('KeyM');
    await page.waitFor('Boolean(window.__debug.worldMap)', { label: 'the world map layer', timeoutMs: 120000 });
    await page.evalJs('window.__debug.worldMap.travelTo("Imperial City")');
    await page.waitFor('window.__debug.state().mapOpen === false && window.__debug.music().place?.context?.city === true',
      { label: 'the fast travel landing', timeoutMs: 120000 });
    const travelled = await music();
    check('fast travel stops the building’s song and starts the city’s place music',
      !/^DUNGEON/.test(travelled.place?.song ?? '') && /^(?:SUNNYDAY|NIGHT|OVERCAST|RAINING|SNOWING|OVERSNOW)/.test(travelled.place?.song ?? '')
        && travelled.jingleRequested === 'CITY.XMI',
      JSON.stringify({ song: travelled.song, requested: travelled.jingleRequested, place: travelled.place?.song }));

    // ── the settings slider: 0 is off, and it is remembered ────────────────────
    await page.pressKey('Escape');
    await page.waitFor('document.getElementById("menu")?.classList.contains("on") === true',
      { label: 'the menu', timeoutMs: 10000 });
    const slider = await page.evalJs('Boolean(document.getElementById("music-volume"))');
    check('the pause menu carries a music slider', slider === true);
    await page.evalJs(`(() => {
      const input = document.getElementById('music-volume');
      input.value = '0';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const muted = await music();
    check('dragging it to 0 silences the soundtrack and says so',
      muted.volume === 0, JSON.stringify({ volume: muted.volume }));
    const stored = await page.evalJs('localStorage.getItem("pa.music.volume")');
    check('and the level is remembered for the next page', stored === '0', stored);
    await page.evalJs(`(() => {
      const input = document.getElementById('music-volume');
      input.value = '80';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    check('back at 80 the music is audible again', (await music()).volume === 0.8);

    check('the soundtrack leaves no console error behind',
      realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  };
}
