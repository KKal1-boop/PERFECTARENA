// THE LEVEL HOST — WALK A REAL ARENA INTERIOR, A WHOLE ASSEMBLED CITY, OR THE
// WILDERNESS AROUND ONE.
//
// Everything on screen comes from the player's own Arena folder: the `.MIF` grid
// is decompressed and decoded by `src/game/mifLevel.js`, meshed by
// `src/game/mifMesh.js`, and textured with the `.INF`'s texture list through
// `src/arena/arenaData.js`. Nothing is bundled and nothing is hand-authored —
// contrast `scenes/testmap.js`, which is the scaffolding this replaced.
//
// A **city** runs through the same three stages, but its level does not exist in
// any file: `src/game/cityPlan.js` stamps a seeded grid of block `.MIF`s into a
// skeleton, and the textures come from the *location's* INF (`TCN.INF`, …) because
// a skeleton has no `INFO` chunk of its own. That is the whole difference, and it
// is why a city needed no new renderer, mesher or collider.
//
// The **wilderness** is the third kind of level and the same three stages again: a
// 2×2-block window of the 64×64-block country around the settlement
// (`src/game/wilderness.js`) assembled out of `.RMD` records, decoded with the
// wilderness INF (`TWN.INF`, …) and meshed by the same mesher. Its scenery — the
// trees, rocks, ruins and bushes — are the level's *entity flats*, drawn as
// billboards (`src/game/flats.js`). Standing in a settlement's wall ring puts the
// player in a **gate**, and `E` in one crosses between the two.
//
// Usage:
//   ?location=Daggerfall          a *named* location, with the game's own seed
//   ?dungeon=Fang%20Lair          a named dungeon, loaded by its seed's .MIF
//   ?interior=START.MIF           the Imperial Dungeons
//   ?interior=CAS.MIF&level=1     a specific level of the file
//   ?city                          a generated city-state (temperate, clear)
//   ?city=town&seed=7             a generated town
//   ?city&mif=CITYW1.MIF          a specific skeleton
//   ?location=Daggerfall&wild      the country outside that settlement
//   ?wild=2048,2048                the wilderness at that cell (default: the gate)
//   ?arena=<folder>               serve Arena's data from the dev server
//
// `?location=` is the one that matters: it resolves the name against
// `CITYDATA.64`, and everything else follows from the data — the settlement kind,
// whether it is coastal, which skeleton template it uses, the climate that picks
// its INF, and above all its **city seed**, which is the location's own
// coordinates. That is what makes `?location=Daggerfall` Daggerfall.

// Debug seam (see docs/ARCHITECTURE.md §6): `state()`, `teleport`, `look`,
// `input`, `advance`, `levels()`, `loadLevel(i)`, `spawnPoint()`, `shotPose()`.

import {
  Renderer, WORLD_FRAME, SKY_CLEAR, groundSamplerFor, groundSharpnessTier,
} from '../engine/render/renderer.js';
import { SkyRenderer, buildFallbackSkyPanorama } from '../engine/render/skyRenderer.js';
// The rain and the snow, ported from the twin project (`daggerfall/src/render/precipitation.js`,
// copied verbatim into `src/engine/render/`): one shader-animated volume that wraps around
// the camera, so a whole storm costs one draw call and no per-frame CPU. Arena has always
// had the four weather states — they are in the `.INF` *filename* — and until now a rainy
// city was drawn under a clear sky because nothing in the scene read the letter.
import { PRECIP_MAX_PARTICLES, PrecipitationRenderer } from '../engine/render/precipitation.js';
import { buildArenaSky, precipitationMode, skyClimateOf } from '../game/arenaSky.js';
// The sun over Tamriel: the twin's own day/night law (`game/daylight.js`, DFU's
// `SunlightManager`/`PlayerAmbientLight` carried 1:1). A town's clock was already here
// (`game/livingWorld.js`) and its light was not — the same noon poured over a street at
// midnight and `beginFrame` held the sun straight overhead for the whole of a session.
import { isNight, lightInto, skyInto } from '../game/daylight.js';
import { identity, lookAt, perspective, mirrorProjectionX, UP_Y } from '../engine/world/mat4.js';
import { Collider } from '../engine/player/collider.js';
import { PlayerMotor, MAX_FRAME_DT } from '../engine/player/motor.js';
import { requestLook } from '../engine/player/pointerLock.js';
import { LookFilter } from '../engine/player/lookFilter.js';
import { PITCH_LIMIT } from '../engine/player/mwCamera.js';
import { escapeHtml } from '../engine/ui/escape.js';
import { fieldOfView } from '../engine/ui/viewSettings.js';
import { lookScale, lookInvert } from '../engine/ui/lookSettings.js';
import { ArenaData } from '../arena/arenaData.js';
import { ARENA_TEXTURE_ARCHIVE, CELL_SIZE, buildLevelMesh } from '../game/mifMesh.js';
import { decodeLevel } from '../game/mifLevel.js';
import { buildCityLevel } from '../game/cityPlan.js';
import { CITY_BLOCKS_PER_SIDE, cityInfName, cityTemplateName } from '../game/tables/cityBlocks.js';
import { cityTypeOf } from '../arena/cityDataFile.js';
import { cityTemplateVariant, wildernessSeed } from '../arena/cityDataSeeds.js';
import { blockIdsFromListing, rmdName } from '../arena/rmdFile.js';
import { collectFlats, flatBaseY, flatRecordNames, isTreeArt } from '../game/flats.js';
import {
  CITY_ORIGIN, CITY_RING, WILD_WINDOW, buildWildernessWindow, generateWildernessIndices,
  isCityCell, wildernessBlockLists, wildernessInfName, wildernessWindowOrigin,
  readWildRequest,
} from '../game/wilderness.js';
import { loadWorldMap } from '../game/worldMap.js';
import {    LAST_LOCATION_KEY, loadCharacter, loadQuestState, saveCharacter, saveQuestState,
    loadRadiantState, saveRadiantState, lootStillEmpty, markLootTaken, loadRegard, saveRegard,
    loadGuildState, saveGuildState,
    loadWorldState, saveWorldState,
  } from '../game/save.js';
import { doorStateAt, noteKill, setDoorState, visitPlace, worldSummary } from '../game/worldState.js';
import { parseDfa } from '../arena/dfa.js';
import { parseCfa } from '../arena/cfa.js';
import { parseCif } from '../arena/cifFile.js';
import { LAVA_FIELD, WATER_FIELD, parseRci, rciReport, rciTile } from '../arena/rciFile.js';
import { surfaceKind, surfaceLabel, surfacePlanes, surfaceScroll } from '../game/chasmSurface.js';
import { imageToUpload, toRgba } from '../arena/palette.js';
import { dangerOf, monsterCountFor, spawnEncounter } from '../game/encounters.js';
import {
  VIEWS as PEOPLE_VIEWS, fillTalkLine, folkCountFor, folkFromListing, greetingFor, personFighter,
  placeTownsfolk, talkCorpus, topicsFor, viewFacing, viewFileFor,
} from '../game/townsfolk.js';
import {
  cityDoors, serviceGreeting, serviceGreetings, shopForInteriorFile, shopSignKinds,
} from '../game/shops.js';
import { MONSTERS, monsterById } from '../game/monsters.js';
import { actorFrame, actorMirrored, stepActorAnimation } from '../game/actorAnimation.js';
import { CombatFx, fitAttackToGround, insideAttack } from '../game/combatFx.js';
import { nearestSceneLights, SceneAtmosphere, sceneLightSources } from '../game/sceneLighting.js';
import { CombatFxPass } from '../engine/render/combatFxPass.js';
import {
  DUNGEON_MONSTERS, goldFor, monsterRosterFromInf, pickupNote, pickupKinds, roleOfArt,
  spawnsFromFlats,
} from '../game/dungeonItems.js';
import {
  DOOR_CLOSE_SECONDS, DOOR_OPEN_SECONDS, FORCE_FAILED, HAND_FORCE_MAX, NEEDS_KEY,
  doorLine, doorMatrix, forceChance, keyOpens, lockAt, lockTable, openReason, placeKeys,
} from '../game/doors.js';
import { rollMonster } from '../game/combat.js';import { attackPhase, attackProfile, DODGE, PARRY, HEAVY, chargeScale, resolveDefence, spendStamina, stepStamina,
  payMonsterAttack, stepMonsterStamina, stepGuardStamina, wantsToFlee, staminaMax,
  STAGGER_SECONDS, poiseMax, poiseCost, applyPoise, foeReadsGuard, BAIT_PATIENCE,
} from '../game/combatStyle.js';
import { furnishRoom } from '../game/furnish.js';
import { RANGED_IDS, boltAtPlayer, castFootwork, fireBolt, resolveBolt, stepBolt } from '../game/ranged.js';
import {
  ATTRIBUTE_MAX, ATTRIBUTE_MAX_SOURCE, ATTRIBUTE_POINTS_SOURCE, HEALTH_GAIN_SOURCE, XP_SOURCE,
  applyLevel, pendingLevels, progressOf, rollAttributePoints,
} from '../game/progression.js';
import { ATTRIBUTES, classById as classOf } from '../game/character.js';
import { HIT_FORMULA_NOTE, attackInterval, monsterAttack, monsterXp, resolveAttack } from '../game/combat.js';
import { BLOCK_NOTE, carried, guardDamage, weaponCarried } from '../game/inventory.js';
import {
  addToBag, armourRating, bagRows, createBag, dropFromBag, equipFromBag, itemById, itemNote,
  itemsOfKind, priceOf, startingKit, useFromBag, weaponHeld,
} from '../game/items.js';
import {
  CASTING_NOTE, applySpell, buildSpellLibrary, canCast, costOf, knownSpellsOf, learnSpell,
  spellFromLibrary, startingSpellsFor,
} from '../game/spells.js';
import { SPELL_FILES, parseSpellsFile } from '../arena/spellsFile.js';
import {
  SERVICE_KINDS, buys, buyItem, buySpell, rest, sellItem, shelfFor, templeService,
  HAGGLE_MAX, haggleRoll, stockFor,
} from '../game/services.js';
import {
  SHOP_HOURS, activityWord, currentActivity, isOpen, roleOf, secondsForMinutes, streetGoal,
  timeOfDay, watchDecision, watchSpawn,
} from '../game/livingWorld.js';
import { createPathBook, pathLine, pointOnLine, townGrid } from '../game/townPaths.js';
import { ArenaRandom } from '../game/arenaRandom.js';
import { playerSpriteFile } from '../game/playerSprite.js';
// The archive's other people families (`game/peopleKinds.js`), read off the same listing
// the armoured roster comes from: the town's men and women, and the watch.
import { peopleKindsFromListing } from '../game/peopleKinds.js';
import { ART_BASELINE, SCREEN, createWeaponRig, placeWeapon, swingDirection, weaponName } from '../game/weaponView.js';
import { DUNGEON_BLOCKS_INF, DUNGEON_BLOCKS_MIF, assembleDungeon, spawnCellFor } from '../game/dungeonPlan.js';
import { loadArenaText, cityTextKey, wrapText } from '../arena/arenaText.js';
import { buildQuestChain, stageMif } from '../game/questData.js';
import { applyQuestEvent, currentObjective } from '../game/questState.js';
import { beginNewGame } from './newGame.js';
import {
  advanceDays, applyRadiantEvent, discoverLooseMifs, enterableDungeons, enterableFromListing,
  handInAtPlace, handInWith, personOffer, radiantObjective, slayProgress,
} from '../game/radiantQuests.js';
import { noteRegard, peopleKnown, personId, regardOf, regardTally, standingOf, standingWord } from '../game/regard.js';
// The corpus the sibling install carries and this one does not (S30): Daggerfall's own
// `NAMEGEN.DAT`, whose fragments build every race's names — a driver for the whole port's
// "people have names" claim, degraded to no-name runs exactly as before without it.
import { personName, parseNamegen } from '../game/names.js';
// The install's own sound, finally: the greeting fanfare decoded and played once,
// waiting for the page's autoplay law's first gesture if the browser refuses it cold.
import { playFanfare, fanfareState } from '../game/fanfare.js';
// The level's own `*TRIG` cells, resolved against the level's `.INF` (`game/levelTriggers.js`):
// prose and a `@SOUND` clip, played when their cell is walked onto.
import { triggerTable, triggerEvent } from '../game/levelTriggers.js';
import { playVocFile, trigSoundState } from '../game/trigSound.js';
import {
  GUILDS as GUILD_ROSTER, earnStanding, isMember as guildMemberOf,
  joinGuild, standingOf as guildStandingOf, titleOf as guildTitleOf, updateRank as guildReview,
} from '../game/guilds.js';

/**
 * Interior lighting.
 *
 * Arena's `PAL.COL` is a *dim* palette — the original brightens it per map with
 * light tables, which this milestone does not reproduce — so the whole interior is
 * lit by a single ambient term with no sun, and the number has to compensate.
 * Measured on `tests/shots/m3-start.png`: at 0.26 the frame had 13 hard edges and
 * a peak luminance of 66 of 255 (legible to the eye only because it is a
 * dungeon); at the value below it has an order of magnitude more.
 *
 * Overridable from the URL for tuning: `?ambient=0.9&fog=0.01`.
 */
const INTERIOR_AMBIENT = new Float32Array([0.86, 0.83, 0.79]);
const NO_SUN = new Float32Array([0, 0, 0]);
const FOG_COLOR = new Float32Array([0.07, 0.07, 0.09]);
/** Distance fog that reads as torchlight falloff without crushing the far end. */
const FOG_DENSITY = 0.012;

/**
 * City lighting: daylight.
 *
 * A settlement is outdoors, so unlike an interior it gets a sun. The ambient term
 * is still large — Arena's `PAL.COL` is dim (DECISIONS.md D13) and a city has to
 * read as daytime without light tables — but the sun is what makes buildings cast
 * sides differently from their roofs instead of the whole city being one flat
 * colour. Fog is thinner and tinted toward the sky, because in a city you can see
 * across it.
 *
 * Overridable like the interior's: `?ambient=0.8&fog=0.002&sun=1.2`.
 */
const CITY_AMBIENT = new Float32Array([0.60, 0.61, 0.64]);
const CITY_SUN = new Float32Array([1.0, 0.96, 0.88]);
const CITY_SUN_SCALE = 0.95;
const CITY_FOG_COLOR = new Float32Array([0.60, 0.66, 0.76]);
const CITY_FOG_DENSITY = 0.0045;

/**
 * The wilderness: the same sun as a city, but the fog is a third as thick again,
 * because a wood is not a street — the point of walking out of the gate is being
 * able to see the country you are walking into. `?fog=` still overrides both.
 */
const WILD_FOG_DENSITY = 0.0030;

/**
 * How far through a gate the player arrives, in cells.
 *
 * Far enough to be *through* the wall rather than standing in the doorway, which
 * matters because a player who arrives inside it crosses straight back on the next
 * `E`. The wall is two cells thick, so three is a step past it — and the arrival is
 * still on the gate's own line, in the opening and not in the stone beside it.
 */
const GATE_STEP = 3;

/**
 * DOM key codes the player holds, and how each of them drives the motor.
 *
 * The motor's contract is DFU's: `forward` and `strafe` are signed **axes** (−1…1), so
 * `S` has to arrive as `forward: −1`. The first version of this function passed
 * `forward: keys.has('KeyW')` and a separate `back:` boolean the motor only reads for
 * its run latch — so pressing `S` did nothing at all (`input.forward` was never
 * negative, and the movement code has no `back` arm). `crouch` is a **press edge**,
 * not a held key: the motor's `DecideHeightAction` toggles the stance every time the
 * flag is truthy, so a held `C` flipped crouch/stand every 0.10 s. Both are DFU's own
 * semantics — `InputManager` fills the axes with the held difference and the crouch
 * with `GetKeyDown` — and both were caught by playing it, not by a test.
 *
 * @param {Set<string>} keys    the held keys
 * @param {Set<string>} pressed the keys that went down since the last step
 */
function inputOf(keys, pressed) {
  return {
    forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    back: keys.has('KeyS'),
    strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    jump: keys.has('Space'),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: pressed.has('KeyC'),
    sneak: keys.has('ControlLeft'),
    autoRun: false,
  };
}

/** Creature sprites are uploaded under their own archive namespace (walls use 2). */
const CREATURE_ARCHIVE = 3;
/**
 * The animated chasm surfaces (Arena's own `WATERANI.RCI` / `LAVAANI.RCI`) get a namespace
 * of their own too, so a level's walls can never be handed a water field and the other way
 * round. Numeric like the other two, which is what the renderer reads as "this is world art
 * and gets a mip chain" — a surface seen from a hundred metres needs one.
 */
const CHASM_ARCHIVE = 4;
/** How tall a 102-pixel figure stands, in world units: a person, from `01PLTWLK.CFA`. */
const SPRITE_SCALE = 1.8 / 102;
/**
 * The **wall's own** density: a wall texture is 64×64 pixels and fills exactly one cell, so
 * 64 pixels *are* one cell. Tall flats — the trees at 132–148 px, the statues at 138, the
 * columns at 64–65 — are drawn at it, which is what makes a pine 5.2 units tall instead of
 * the 2.3 the figure's law gave it: the reported "trees are small and should be really
 * huge", and `flatSize` below is the rule that decides which law a flat gets.
 */
const SCENERY_SCALE = CELL_SIZE / 64;
/**
 * How tall a tree stands, in world units — **three storeys**, by the player's eye.
 *
 * The original's trees dwarf the visitor: an oak dwarfs the house next to it. The old
 * law (wall density) made the tallest tree 5.8 units while a wall stood 2.5 — visibly
 * "small, and should be really huge". This is the tallest art (`NOAK2.IMG`, 148 px) read
 * at **9.0 units**, three of the engine's 2.5-unit storeys, with the other trees scaled
 * by the same factor so the forest keeps the art's own proportions: a fir at 8.0, a palm
 * at 7.7, a sapling (`NPINE2`, 69 px) at 4.2. GUESS in the constant, measured in the art.
 */
const TREE_SCALE = 9.0 / 148;

/**
 * How big a flat is drawn: the tree law for the woods, the wall's law for the rest of the
 * tall art, the figure's for the small.
 *
 * The split is the art's own size distribution. Everything a **landscape** is made of —
 * every tree (132–148 px), every statue (138, 81), every column (64–65), every hedge — is
 * art at or above a wall tile's 64 pixels, and it is drawn at the wall's own density. What
 * is **smaller** than that is not landscape: a chest (27–29 px), a key (7), a treasure
 * pile (24–31), a body (34), a weed (24), a rock (6–15) — an object a person could carry,
 * drawn at the figure's density, where a chest is half a metre and a key is a hand's
 * width. Both laws are the install's art read at two documented densities; the split keeps
 * a forest tall without making a key a metre long — and the trees, named climate by
 * climate (`game/flats.js`'s `isTreeArt`), get the third law that makes them the skyline.
 *
 * @param {number} width @param {number} height  the art's own pixels
 * @param {string} [name]  the record's own name, which is what says tree or not
 * @returns {{w: number, h: number}} world units
 */
function flatSize(width, height, name = null) {
  const scale = isTreeArt(name) ? TREE_SCALE : height >= 64 ? SCENERY_SCALE : SPRITE_SCALE;
  return { w: width * scale, h: height * scale, scale };
}
/** How close a blow lands, in world units. */
const REACH = 3.0;
/** How far away a monster notices the player, in world units. */
const AGGRO = 34;
/** How fast a monster closes, in world units per second, at its own level. */
const MONSTER_SPEED = 2.6; // Ordinary pursuit is a deliberate walk; only committed charges lunge.
// A townsman coming at the player with a blade is a man running, not a monster charging: a
// walking pace with a jog in it. (They were given `MONSTER_SPEED` and crossed the street at
// a creature's sprint.)
const HOSTILE_FOLK_SPEED = 3.4;
/** A person's body, for collision: a radius in metres, and the player's own (`motor.js` capsule). */
const PERSON_RADIUS = 0.4;
const PLAYER_RADIUS = 0.35;
/** How close a standing person can be to a route's next step before a walker waits for them. */
const PERSON_CLEARANCE = 0.8;
/** Seconds between the player's own blows. */
const PLAYER_SWING = 0.55;
/**
 * How far apart the finale's two chambers must be, in cells.
 *
 * The mithril key and the Jewel of Fire are in different rooms of the palace's bottom
 * level (UESP's walkthrough), so the key is placed in the deepest cell this far — or
 * further — from the Jewel's. Twelve cells of a 50-cell dungeon is across the map, and
 * on a level too small to satisfy it the two coincide rather than one being refused.
 */
const FINALE_CHAMBER_GAP = 12;
/**
 * How close a person has to be to be spoken to, in world units.
 *
 * A shade more than `REACH`, because a conversation should not require standing inside
 * somebody — and the person nearest the player is the one who answers.
 */
const TALK_REACH = 4.0;
/**
 * Seconds a person takes to cross one cell, walking (`stepTownsfolk`).
 *
 * **1.5 s for 2.5 m is 1.67 m/s** — a person's walk. The first figure was 0.75 s, which is
 * 3.33 m/s: a town whose every resident jogged everywhere, which is exactly the reported
 * "people move hella weird and super fast". The twin's own indoor walk for a townsman is
 * `livingIndoors.INDOOR_WALK_SPEED = 1.2` m/s, and a street is walked a little quicker than a
 * room, so the number sits between the two rather than being invented twice.
 */
const TOWN_WALK_SECONDS = 1.5;

/**
 * How high a body's eyes are, for the sight test (`sightClear`).
 *
 * Roughly a person's eyes on a 1.7 m body, and well above a chasm's lip: the test walks the
 * level's own collision triangles, so it is the same geometry the player walks into.
 */
const SIGHT_EYE = 1.5;
/** How far short of each body a sight ray stops, so nobody's own volume blocks it. */
const SIGHT_MARGIN = 0.4;

/**
 * How far a figure walks in one turn of its walk cycle, in metres.
 *
 * One cell — the archive's walk sheets are five frames of one stride, and a stride of a
 * person's own is about a step and a half. This is the figure's own gait rather than the
 * scene's speed: the *frames* follow the distance travelled, so a person who walks faster
 * steps faster and a person standing still holds the standing pose (frame 0).
 */
const WALK_CYCLE_METRES = CELL_SIZE;
/**
 * How fast a person's **talk** sheet runs while the player is speaking to them.
 *
 * GUESS, and the smallest honest one: the talk sheets are nine frames of a figure
 * answering, and eight frames a second reads as speech rather than as a twitch. Arena's
 * own talk timer is in `A.EXE` (D11), so nothing here pretends to be its number.
 */
const TALK_FRAMES_PER_SECOND = 8;
/**
 * How long a fallen person lies there in their own death art before the body is cleared.
 *
 * GUESS, and derived from the sheets rather than from Arena: the die sheets run 3 frames
 * (`GUARD06`, `LGLIT06`) to 9 (`MLGEN0#D`, `FMGEND0#`), and a second covers the longest at
 * roughly the rate a walk cycle plays. The person is *gone* — out of the fight, out of the
 * crowd and off the street — from the instant they fall; this is only how long the body is
 * drawn before it is cleared.
 */
const FOLK_DIE_SECONDS = 1;
/**
 * How long the level's own trigger clips wait between one another.
 *
 * The original plays a trigger cell's `@SOUND` clip on the step that enters it, and a
 * dungeon scatters those cells along its corridors (`DRIP1/2`, `SCREAM1`, `DRUMS`…). Two
 * seconds between them keeps them what they are — the level's own far-off noises — instead
 * of a sting on every cell, which is what "I hear randomly the level up sound" was.
 */
const TRIGGER_SOUND_COOLDOWN = 2;
/** How loud those clips sit against the rest: ambience, not an event. GUESS, deliberately low. */
const TRIGGER_SOUND_VOLUME = 0.35;
/**
 * How fast a person walks a *path*, in world units a second: one cell in the same 0.75 s the
 * idle step takes to cross one. Derived rather than invented — a person who idled at one speed
 * and walked a route at another would change pace when their plan changed.
 */
const TOWN_SPEED = CELL_SIZE / TOWN_WALK_SECONDS;
// The longest distance any figure can cover in one frame: the game clamps `dt` to 0.1 s and no
// figure is faster than its own speed. A bigger step than this is a teleport, not a stride.
const MAX_STRIDE_STEP = Math.max(MONSTER_SPEED, TOWN_SPEED, HOSTILE_FOLK_SPEED) * 0.1 * 1.5;
/** How long a person stands still between steps, at least. */
const TOWN_WAIT_MIN = 1.6;
/** …and at most. */
const TOWN_WAIT_MAX = 6.5;
/**
 * How long a person who is **waiting to be given a path** stands still, and how many times they
 * will wait before giving up on it.
 *
 * The path book answers in a frame or two (a search over a city's streets is a few thousand
 * cells against a per-frame budget of six thousand), so a couple of tenths of a second is
 * enough. The patience is what keeps a *walk the search can never answer* — a person walled
 * into a courtyard, a goal whose street cell the level's own geometry does not join — from
 * freezing them mid-street: past it they fall through to the idle step, exactly as before.
 */
const TOWN_PATH_WAIT = 0.2;
const TOWN_PATH_PATIENCE = 12;

/**
 * How close a player has to be to a shop's doorway to go in, in world units.
 *
 * One cell is 2.5 units, so this is "standing in the doorway or on the step beside it".
 * The same figure leaves the doorway to leave a building (`inside.exit`).
 */
const DOOR_REACH = 2.6;

/**
 * How far below the floor plane a player's feet have to be for water to *be* water.
 *
 * The bed of a chasm is `CHASM_DEPTH` (0.45 m) down, so standing in one means being below
 * the floor plane by about that much; the slop keeps a single frame of stepping down from
 * reading as land.
 */
const WATER_ENTER_DEPTH = 0.05;

/**
 * What lava takes off a player standing in it, per second.
 *
 * `ArenaChasmUtils::isDamaging` is the rule — a lava chasm damages, a wet or dry one does
 * not — and the rate is this project's, like its other reconstructed numbers, said out loud
 * in the HUD. The archive's only lava is the Imperial Palace's lake (470 cells, all of them
 * `IMPPAL.MIF` level 4, the level the main quest ends on), so the rate is picked to make
 * crossing it a decision: about ten seconds from full health, survivable at a run, and the
 * pit's own hazard rather than a trap.
 */
const LAVA_DAMAGE_PER_SECOND = 6;

/**
 * How much of a walk a wade is: `swimSpeedScale` is the engine's own water speed modifier
 * and `_refreshWalkSpeed` multiplies it into the walk arm. A known gap: DFU keeps its
 * *running* speed in a separate list (`RefreshRunSpeed`), so a wading player who runs still
 * runs; scaling the run too would mean rewriting the motor's own stat table from the scene.
 */
const WADE_SPEED_SCALE = 0.5;

/**
 * How far a spell can be aimed, in world units (one cell is 2.5 of them).
 *
 * Arena's own spell ranges are in `A.EXE`; this is the same "six times a sword's reach"
 * shape the fight uses for a swing, and it is **AUTHORED** like the rest of the magic's
 * numbers (`game/spells.js`'s `CASTING_NOTE` says so in the game).
 */
const SPELL_RANGE = 24;

/** The shop kinds a doorway can be — `teleportToDoor('tavern')` picks one by name. */
const SHOP_KIND_NAMES = Object.freeze(['equipment', 'tavern', 'mages', 'temple', 'house', 'noble']);

/**
 * The **least company** a building of each kind holds, so no interior is an empty room.
 *
 * The install's own `.INF` says who works and who sits in a building, and where it names a
 * crowd that crowd is what the player meets: a tavern's `INF` lists its bartender *and* its
 * drinkers (`BARTEND.DFA`, `MAN01…04`, `WOMAN01…04`), so a tavern was never the empty room.
 * What the data leaves empty is the rest — a **house names nobody at all** (`BS1.MIF` is a
 * home, not a shop), a temple names one priest, a guild hall one wizard — and a house the
 * player can walk into must be somebody's home with somebody in it. These are the counts those
 * rooms are filled to, drawn from the building's own seed so the same family lives in the same
 * house on every visit.
 *
 * **Equipment stores and taverns are deliberately absent**: their own `INF` already says who
 * is inside, and adding a crowd the install did not name would be this port inventing a
 * shopkeeper's customers.
 */
const BUILDING_FOLK = Object.freeze({ house: 3, noble: 3, temple: 4, mages: 3 });

/**
 * The trades that wear the watch's own colours in a settlement's crowd.
 *
 * Arena's cities are patrolled by knights (the `.INF` tables' `KNIGHT` art), and that is who
 * `game/livingWorld.js`'s watch is: there is no separate guard record to mint, because the
 * original's own guard table is in `A.EXE` (`docs/DECISIONS.md` D11).
 */
const WATCH_ROLES = Object.freeze(['knight', 'guard', 'watchman']);

/**
 * What the watch takes off a player it arrests, in gold.
 *
 * **AUTHORED** — Arena's own fines are in `A.EXE` — and deliberately small: it is a
 * consequence a player can feel and recover from, not a wipe. A player with nothing pays
 * nothing, which is what the notice says happened.
 */
const ARREST_FINE = 25;

/**
 * A player to play if no character has been created yet.
 *
 * The dev and test doors (`?dungeon=…`) are reached without character creation, and a
 * walkthrough with no character should still be able to fight rather than divide by an
 * undefined — so a stand-in is used, and `state().combat.player.created` says so.
 *
 * @returns {object}
 */
function placeholderPlayer() {
  // The eight attributes as **both** a list and a map. The list is not decoration: every
  // `ArenaRandom`-era rule that touches a sheet works on the ordered list (`game/progression.js`
  // levels an array, `character.js` counts eight of them), and a stand-in that carried only the
  // map was a character who could fight and loot but could not gain a level at all.
  const attributes = [50, 50, 50, 50, 50, 50, 50, 50];
  return {
    name: 'Adventurer', classId: 'warrior', className: 'Warrior', race: 'Imperial', level: 1,
    health: 60, maxHealth: 60, gold: 0, critical: 0, weapon: 'longsword', material: 'steel',
    attributes,
    attributeMap: { strength: 50, intelligence: 50, willpower: 50, agility: 50, speed: 50, endurance: 50, personality: 50, luck: 50 },
    // A stand-in still **carries** and still **casts**, deliberately: the dev and test doors
    // (`?dungeon=…`) are reached without creation, and a walkthrough that could not open a
    // pack or read a spell would be a worse lie about the game than a Warrior with spell
    // points in it. A created character's own class decides what they know
    // (`game/spells.js`'s `startingSpellsFor`).
    bag: addToBag(createBag(), 'potion-heal', 1),
    shield: null, armour: {},
    spellPoints: 200, maxSpellPoints: 200,
    knownSpells: ['Light Heal', 'Fire Dart', 'Light', 'Shield'],
    created: null,
  };
}

/** @param {Set<string>} keys */
/**
 * A `row,col` cell from the URL (`?at=12,11`, `?enter=12,11`).
 *
 * @param {string|null} value
 * @returns {{row: number, col: number}|null}
 */
function parseCell(value) {
  const match = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
}

/**
 * Which way to face on arrival: the most open of the four grid directions.
 *
 * Worth doing because a spawn is not always a room. A city's start point is a
 * two-cell passage *through* the perimeter wall, so facing the default `yaw 0`
 * puts the first frame of the game against a wall — measured, and visible in
 * `tests/shots/m4-city.png` before this existed. Dungeons get the same treatment
 * for free: an arrival cell in a dead end should not stare at the corner.
 *
 * @param {import('../game/mifLevel.js').ArenaLevel} level
 * @param {number} row  the spawn's row (world X)
 * @param {number} col  the spawn's column (world Z)
 * @param {number} [reach]  how far to look ahead before giving up
 * @returns {number} yaw in radians
 */
export function openYaw(level, row, col, reach = 12) {
  const { width, depth, cells } = level;
  const walkable = (r, c) => {
    if (r < 0 || c < 0 || r >= depth || c >= width) return false;
    const cell = cells[r * width + c];
    return !cell.solid && !cell.floor.chasm;
  };
  // `row`/`col` are cell-unit coordinates, so the containing cell is `floor` — a
  // spawn sits at the *centre* of a cell (k + 0.5) and `round` would step into the
  // neighbour, which is how a gate passage reads as open when its far end is a
  // wall. Measured: with `round`, `?city` faced the wall at the end of the gate.
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  // (row step, col step, yaw) — yaw 0 faces +Z, which is the column axis.
  const directions = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]];
  let best = { score: -1, yaw: 0 };
  for (const [dRow, dCol, yaw] of directions) {
    let score = 0;
    for (let step = 1; step <= reach; step++) {
      if (!walkable(r0 + dRow * step, c0 + dCol * step)) break;
      score = step;
    }
    if (score > best.score) best = { score, yaw };
  }
  return best.yaw;
}

/**
 * Resolve `?location=` / `?dungeon=` against the world data.
 *
 * Returns the location, the world it came from, the `.MIF` to load and — for a
 * settlement — the city request the generator needs, built entirely from the
 * game's own records. This is the seam that turns a *name* into a *place*: the
 * seed, the template, the climate and the coast all come from `CITYDATA.64` and
 * `TERRAIN.IMG`, so travelling to a location is reproducible and correct rather
 * than a random town with a familiar label.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {URLSearchParams} params
 * @returns {Promise<{world: object, place: object, mapName: string, cityRequest: object|null}|null>}
 */
async function readWorldRequest(data, params) {
  // A dungeon can be asked for by name or **by seed**: the 128 dungeon records `CITYDATA`
  // leaves unnamed have no name to ask for, and their file names *are* their seeds, so the
  // world map travels to them by the number (`game/dungeonPlan.js`).
  const wantedSeed = params.get('dungeonSeed');
  const wanted = params.get('location') ?? params.get('dungeon');
  if (!wanted && !wantedSeed) return null;
  const world = await loadWorldMap(data);
  const place = wantedSeed
    ? world.locations.find((l) => String(l.dungeonSeed) === String(wantedSeed))
    : world.locations.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
  if (!place) {
    throw new Error(wantedSeed
      ? `no Arena dungeon has the seed ${wantedSeed}`
      : `no Arena location is called "${wanted}"`);
  }

  if (place.kind === 'dungeon') {
    return { world, place, mapName: place.mif, cityRequest: null };
  }

  const kind = cityTypeOf(place.index);
  const weather = 'clear';
  const request = {
    kind,
    climate: place.climate,
    weather,
    coastal: place.coastal,
    blocksPerSide: CITY_BLOCKS_PER_SIDE[kind],
    seed: place.citySeed,
    infName: cityInfName({ climate: place.climate, location: 'city', weather }),
    template: cityTemplateName({ type: kind, coastal: place.coastal, variant: cityTemplateVariant(place, place.coastal) }),
  };
  return { world, place, mapName: request.template, cityRequest: request };
}

/**
 * Read the URL's city request, if the page asked for one.
 *
 * `?city` alone means a city-state at the default seed; `?city=town` and
 * `?city=village` pick the smaller grids; `?blocks=` overrides the grid size;
 * `?inf=` overrides the location INF for a skeleton whose climate is not the one
 * you want to look at.
 *
 * @param {URLSearchParams} params
 * @returns {{kind: 'city'|'town'|'village', climate: string, weather: string, coastal: boolean, blocksPerSide: number, seed: number, infName: string, template: string}|null}
 */
export function readCityRequest(params) {
  if (!params.has('city')) return null;
  const requested = (params.get('city') || '').toLowerCase();
  const kind = requested === 'town' || requested === 'village' ? requested : 'city';
  const climate = params.get('climate') || 'temperate';
  const weather = params.get('weather') || 'clear';
  const coastal = params.has('coastal') && params.get('coastal') !== '0';
  return {
    kind,
    climate,
    weather,
    coastal,
    blocksPerSide: params.has('blocks') ? Number(params.get('blocks')) : CITY_BLOCKS_PER_SIDE[kind],
    seed: params.has('seed') ? Number(params.get('seed')) : 20232,
    infName: (params.get('inf') || cityInfName({ climate, location: 'city', weather })).toUpperCase(),
    // The settlement kind picks the skeleton template, the same way the game picks
    // it for a location: towns do not use the city's map.
    template: cityTemplateName({ type: kind, coastal }),
  };
}

/**
 * Boot an Arena interior — or, with `?city`, an assembled Arena settlement.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Renderer} renderer
 * @param {URLSearchParams} params
 * @param {(msg:string)=>void} status
 * @param {import('../arena/arenaData.js').ArenaSource|null} [source]
 *   an already-chosen source; when omitted, `?arena=` is used
 */
export async function bootInterior(canvas, renderer, params, status, source = null) {
  if (!source) throw new Error('bootInterior needs an Arena data source (a picked folder, or ?arena=…)');

  // ── this scene's life ──────────────────────────────────────────────────────
  //
  // A scene can now be *replaced in place*: the world map travels without loading a
  // page (see `openWorldMap`), so the scene that was standing has to go — its frame
  // loop, its DOM listeners — or two games would run at once and the old one would
  // keep moving a player nobody can see. `dispose()` is that exit, and every
  // listener below is registered with the same `AbortSignal`.
  window.__arenaScene?.dispose?.();
  const life = { alive: true, mapOpen: false, menuOpen: false, leaving: false, paused: false, abort: new AbortController() };
  const signal = life.abort.signal;
  window.__arenaScene = {
    dispose: () => {
      life.alive = false;
      life.abort.abort();
      // A swap frees the last level's GL payloads. Every `loadLevel` since this
      // miss leaked the previous one: mesh VAOs/buffers plus these billboard batches
      // grew monotonically while the map walked, hitting SwiftShader's software pool.
      releaseLevelPayloads(current);
    },
  };

  const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });
  const worldRequest = await readWorldRequest(data, params);
  const cityRequest = worldRequest?.cityRequest ?? readCityRequest(params);
  const place = worldRequest?.place ?? null;
  // The wilderness is a *view* of the same settlement, so a wilderness page carries
  // the location's own parameters too (`?location=Daggerfall&wild`) and only adds
  // where in the country to stand.
  //
  // **The world is persistent now.** A bare `?location=` that *doesn't* ask for `?wild`
  // still opens the country when the save's last record for this place holds a wilderness
  // cell: the last gate they walked out of is the ground under their feet, which is what
  // makes the wild a *place* rather than a scene the player has to ask for. An explicit
  // `?wild=` in the URL always wins over memory; the world map's own doors (a marker
  // click, fast travel) always arrive in the settlement itself — memory may only apply
  // when the player came here by walking into it, which is exactly the case below.
  const askedWild = readWildRequest(params);
  const rememberedWild = (() => {
    if (askedWild || !params.has('location')) return null;
    try {
      const raw = localStorage.getItem(LAST_LOCATION_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved?.wild || !Number.isFinite(saved.wild.row)) return null;
      const wanted = (params.get('location') ?? '').toLowerCase();
      if (typeof saved.name === 'string' ? saved.name.toLowerCase() === wanted : false) {
        return { row: Math.round(saved.wild.row), col: Math.round(saved.wild.col) };
      }
      return null;
    } catch { return null; }
  })();
  const wildRequest = askedWild ?? (rememberedWild ? { cell: rememberedWild, climate: null, weather: null, seed: null, infName: null } : null);
  // ── a building the player walked into ──────────────────────────────────────
  //
  // `?interior=EQUIP3.MIF&enter=12,11&back=…` is one page load of a *building*: `enter`
  // is the street cell of the doorway the player came through and `back` the city page
  // itself, so the two together are the whole round trip — the player arrives at the
  // map's own start point (the foot of the entry corridor) and `E`, standing on the cell
  // they came in by, puts them back on the street they left. Nothing else is inferred:
  // no `enter`, no exit, and the page behaves exactly as `?interior=Foo.MIF` always has.
  const entryCell = params.has('enter') ? parseCell(params.get('enter')) : null;
  const backHref = entryCell ? (params.get('back') ?? null) : null;
  // The city-state the building stands in. Read out of the page the player came *from*
  // rather than passed again, because a `?location=` on this page would also be read as a
  // request to build the city (`readWorldRequest`), and this page is inside a shop.
  const fromPlace = backHref
    ? (await readWorldRequest(data, new URLSearchParams(backHref.replace(/^\?/, ''))))?.place ?? null
    : null;
  // The world is loaded even when the page named a bare map file. A scene without
  // it cannot tell whether the dungeon it is standing in is the one the quest sent
  // the player to — and the opening dungeon, `START.MIF`, is exactly that case.
  const world = worldRequest?.world ?? await loadWorldMap(data);
  const mapName = (params.get('interior') || params.get('mif') || worldRequest?.mapName
    || (cityRequest ? cityRequest.template : 'START.MIF')).toUpperCase();
  // Tell the world map where the player is, so its travel times are measured from
  // here rather than from the middle of the continent.
  if (place) {
    try {
      // The seed comes along with the name: an unnamed dungeon has no name to look up, and
      // the map measures its travel times, and finds its way back, from the seed.
      //
      // **This write no longer erases the country.** It used to be a plain overwrite, so
      // a bare `?location=` boot tore the saved `wild` cell out of the record on its way
      // in — and the world forgot where it had left the player exactly when it was about
      // to be asked. The record is *merged* here: name, dungeon and seed refresh; the wild
      // foot is kept for a boot whose page did NOT ask for the country (the remembered
      // wild below then answers), and cleared when the page boots into the wild directly,
      // because the level that then loads writes the fresh answer anyway.
      const prior = (() => { try { return JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? 'null'); } catch { return null; } })();
      const keepWild = rememberedWild
        || (!params.has('wild') && prior && prior.name?.toLowerCase() === place.name.toLowerCase()
          ? prior.wild ?? null : null);
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
        name: place.name,
        dungeon: place.kind === 'dungeon',
        seed: place.dungeonSeed ?? null,
        wild: keepWild,
      }));
    } catch { /* storage can be refused; it is only a convenience */ }
  }

  status(`reading ${mapName}`);
  // ── a dungeon the install does not ship a map for ───────────────────────────
  //
  // Arena's 144 dungeon records are two named ones per province plus **fourteen with no
  // name at all**, and only the named sixteen are files in the folder: the rest, the
  // map's own random dungeons, are what the original generates. This page used to fall
  // through to `START.MIF` for every one of them — the reported "almost every dungeon is
  // the same" — so a dungeon whose `.MIF` is absent now loads the install's own dungeon
  // *pieces* instead (`game/dungeonPlan.js`, out of `RANDOM1.MIF`), drawn by the
  // location's own seed. Nothing is invented: the pieces are the game's, and they join at
  // the doorways they carry.
  const generated = place?.kind === 'dungeon' && !(await data.has(place.mif))
    ? { seed: (place.dungeonSeed ?? 0) >>> 0, mif: DUNGEON_BLOCKS_MIF, name: place.name || 'an unnamed dungeon' }
    : null;
  const mif = await data.mif(generated ? generated.mif : mapName);
  // A generated dungeon is one level: the install's pieces carry no stairs, and linking two
  // assembled levels is a link the original's own data does not describe (recorded as a
  // limitation in PROGRESS.md rather than guessed at). A shipped map keeps all of its own.
  const levelCount = generated ? 1 : mif.levelCount;
  const levelIndexWanted = params.has('level') ? Number(params.get('level')) : mif.startingLevelIndex;
  const startIndex = Math.max(0, Math.min(levelCount - 1, levelIndexWanted));

  /** @type {ArenaData} */ void data;

  // ── the debug seam, installed before the first frame so a boot failure is visible
  const errors = [];
  if (typeof window !== 'undefined' && !window.__debug) window.__debug = {};
  window.__debug.errors = errors;

  const sky = new SkyRenderer(renderer.gl);
  sky.setPanorama(buildFallbackSkyPanorama());

  // ── the hour's own light (`applyDaylight`) ───────────────────────────────────
  //
  // One object and five arrays, made once and written in place every painted frame, so reading
  // the sun costs no allocation (the project's PERF2 rule). The per-level values — this level's
  // noon ambient, its sun scale, its fog — are assigned when a level loads and the hour scales
  // them from there.
  const dayScratch = {
    dayFogColor: null,
    dayClearColor: SKY_CLEAR,
    sunColor: new Float32Array(3),
    sunDir: new Float32Array(3),
    fogColor: new Float32Array(3),
    clearColor: new Float32Array(4),
  };
  dayScratch.clearColor[3] = 1;
  /** This level's ambient at its own noon; the hour's weight is applied to it. */
  const dayAmbient = new Float32Array(3);
  /** The frame's ambient, written in place (`setLighting` keeps the reference). */
  const ambientNow = new Float32Array(3);
  /** Whether the level standing now has a sky and an hour at all. */
  let dayLit = false;
  /** Whether `?ambient=` / `?sun=` pinned the light, in which case the hour stands down. */
  let dayForced = false;
  /** This level's sun scale and fog density at its own noon. */
  let daySunMax = 0;
  let dayFogDensity = 0;
  /** The light and the sky the last painted frame had (the HUD, a test, `dbg.light`). */
  let dayLight = null;
  let daySky = null;
  /** What the install's own sky last gave up: `{mountains, clouds}` counts, or null. */
  let skyArt = null;
  /** The climate-and-seed the uploaded panorama belongs to (see `ensureSky`). */
  let skyKey = null;
  /** What is falling out of that sky: `'rain'`, `'snow'` or null (`game/arenaSky.js`). */
  let airWeather = null;
  /** The precipitation pass, built the first time a level actually has weather. */
  let precip = null;

  /**
   * Put the install's own horizon over an outdoor level: its mountains on the line and
   * its clouds above them, out of `GLOBAL.BSA` (`game/arenaSky.js`).
   *
   * Built on demand and cached by climate-and-seed, because it decodes 39 `.IMG` records
   * and a player walking in and out of a shop must not pay for that twice. When the
   * install ships no mountain or cloud art, or a record fails, the gradient already on
   * the renderer stays — no horizon is better than a wrong one.
   *
   * @param {string} infName   the level's own `.INF`, which names its climate and weather
   */
  async function ensureSky(infName) {
    const seed = Math.round((cityRequest?.seed ?? place?.citySeed ?? place?.dungeonSeed ?? 1) || 1);
    // The card the panorama is drawn from is the hour of the level's arrival — but the
    // clock moves on while the player is standing here, so a level that booted at ten
    // past dusk gets a **second composition** when the night arrives under it. The key
    // therefore carries the night bit, and `maybeRecomposeSky` calls this again when the
    // hour crosses the boundary.
    const night = isNight(clockNow().minutes);
    const key = `${String(infName).toUpperCase()}|${seed}|${night ? 'n' : 'd'}`;
    if (key === skyKey) return skyArt;
    skyKey = key;
    try {
      const built = await buildArenaSky(data, { infName, seed, night });
      if (built) {
        sky.setPanorama(built);
        const { climate, weather } = skyClimateOf(infName);
        skyArt = { ...built.art, climate, weather, inf: String(infName).toUpperCase(), night };
      }
    } catch (err) {
      data.warn(`sky: ${err.message}`);
    }
    return skyArt;
  }
  /**
   * A level spends its life *outliving* the hour it booted at: the sky the first `paint`
   * asked for was the arrival hour's card, and a dusk that comes four game-minutes of
   * walking later must compose a night. Once a second, ask.
   */
  function maybeRecomposeSky() {
    const through = (current?.infName && current.openSky) ? current.infName : null;
    if (!through) return;
    const night = isNight(clockNow().minutes);
    if (!skyArt || skyArt.night !== night || !skyKey) void ensureSky(through);
  }
  const lookFilter = new LookFilter();
  const keys = new Set();
  /** Keys that went down since the last step — the motor wants press edges (see `inputOf`). */
  const pressed = new Set();
  const cam = { yaw: 0, pitch: 0 };
  const identityMat = identity();
  const hud = document.getElementById('hud');

  /** Everything about the currently-loaded level. */
  let current = null;
  const dbg = { frame: 0, painted: 0, seconds: 0, shotReady: false, reloaded: 0, notice: null, figures: 0 };

  /**
   * The wilderness block grid, once per page (see `wildernessGrid`).
   * @type {{seed: number, indices: Uint8Array, counts: Record<string, number>, blocks: number}|null}
   */
  let wildGrid = null;

  /** Set while a wilderness window slide is under way, so it happens once (see `maybeSlideWilderness`). */
  let sliding = false;

  /**
   * Whether the quest chain and its state exist yet.
   *
   * `loadLevel` runs on the first line of the scene, before the world's quest chain is
   * built, and the HUD it writes wants to say whether this level is the one the player
   * is here for. Rather than move the loading of the levels behind the loading of the
   * quest, the one line that needs the quest asks this first: `chain` and `quest` are
   * `let` bindings assigned further down, and reading one before its assignment is a
   * `ReferenceError` rather than an `undefined`.
   */
  let questReady = false;

  /**
   * The cell a player who walked in through a street door leaves by, on the level they
   * arrived on (`null` when the page was not reached through a door).
   *
   * Declared with `questReady`, for the same reason: the HUD this level's loading writes
   * reads it, and a `const` further down the file is in its temporal dead zone during the
   * first `loadLevel` — a `ReferenceError` and a blank page rather than a missing line.
   *
   * @type {{row: number, col: number}|null}
   */
  let exitCell = null;

  /**
   * How long after taking a stairway the walk-into trigger stays off, in seconds.
   *
   * A stairway is one cell addressed in two levels — that is how the install's own data
   * pairs its ends (`39300577.MIF` has seven `STAIRDWN` cells at the cells its level 1 has
   * `STAIRUP` ones) — so the player arrives *beside* it, and the trigger has to be still for
   * as long as it takes them to walk clear. Without this, arriving at the foot of a stair
   * the player had just come up is a walk-into at once, and the two ends bounce them up and
   * down forever.
   */
  const STAIR_COOLDOWN = 1.6;
  /** Seconds left on that cooldown. */
  let stairCooldown = 0;
  /** The `row,col,kind` of the stair the HUD last mentioned — the panel is written on change. */
  let stairSeen = '';

  /**
   * The people of the settlement the player is standing in.
   *
   * Empty in a dungeon, in a wilderness map or in an install with no people art — and a
   * city with nobody in it is a state the shipping path can genuinely be in, which is why
   * `state().townsfolk` reports the count rather than assuming it is not zero.
   *
   * Declared up here, with `questReady`, because the HUD this level's loading writes reads
   * it: a `let` further down the file is in its temporal dead zone during the first
   * `loadLevel`, which is a `ReferenceError` and a blank page rather than a missing HUD
   * line. Caught by `townsfolk`'s first browser run.
   *
   * @type {object[]}
   */
  let townsfolk = [];
  /**
   * The `0xB` **doors of this level** — a door leaf each, with its own mesh, its own
   * slice of the collider and its own lock (`game/doors.js`).
   *
   * `current.doors` above is a different thing: those are a *city's shop entrances*, the
   * `0xA` sign edges a player walks in through. A leaf is a door in the dungeon sense. The
   * two never appear on one level.
   *
   * @type {object[]}
   */
  let leaves = [];
  /**
   * What the map's own item flats left lying about: keys, chests, treasures, corpses.
   * @type {object[]}
   */
  let loot = [];
  /** The person being spoken to, or null. */
  let talking = null;
  /**
   * The town's path book for the level currently built (`game/townPaths.js`).
   *
   * Rebuilt whenever a level is loaded, because the grid it searches *is* that level's own
   * streets: a book kept across a level change would answer with a route through walls that no
   * longer are where it thought (or through walls that are). Built lazily, on the first walk
   * asked for, so a dungeon pays nothing for it.
   */
  let townWalk = null;
  /** The walkable grid under `townWalk` (`game/townPaths.js`'s `townGrid`), torn down with it. */
  let townWalkNav = null;
  /**
   * The visit's own commerce: the *live* shop, and its fresh shelf's stock. Both live in this
   * level-change state on purpose — a haggle is money the visit made and the shelf is what
   * that visit's counter holds — and both are declared **here**, with `townsfolk`: the first
   * `loadLevel` runs before the later declarations would execute, which is the town-path
   * book's own temporal-dead-zone mistake, caught again as a blank city page.
   *
   * @type {{{attempts: number, factor: number, last: string|null}|null}}
   */
  let visitHaggle = null;
  /** The cells this visit's shelf has already sold out of. @type {Record<string, number>} */
  let stockTaken = {};
  /** The fanfare's once-per-page ask — keyed the same way the names ask is, because the
   * first `loadLevel` runs this deep block before the later declarations exist. */
  let fanfareTried = false;
  /**
   * Is one of the install's own movies on screen?
   *
   * A movie is a layer over the world like the map and the menu, and **the world's input is
   * suspended for it**: no step, no swing, no map, no menu. The movie's own skip listener is
   * the only thing listening (`cutscenePlayer.js`), so the click that skips a cutscene is not
   * also the click that swings a sword at whatever is behind it.
   */
  let moviePlaying = false;
  /** The level's trigger cells the player has already fired — once per visit each. */
  let firedTriggers = new Set();
  /** The cell the player stood in on the last trigger check, and the feet they stood there with. */
  let lastTriggerCell = null;
  let lastTriggerFeet = null;
  /** When a trigger's own clip last played (`TRIGGER_SOUND_COOLDOWN` apart). */
  let lastTriggerSoundAt = -99;
  /**
   * The player's own sheet — the character creation's, or the stand-in when this page was
   * reached through a dev door.
   *
   * Declared **here**, before the first `loadLevel`, because the HUD that level's loading
   * writes already reads it (the keys in the pack, `updateObjectiveHud`) — a `let` further
   * down the file is in its temporal dead zone and the page dies with a `ReferenceError`
   * instead of booting. This is the same trap the `townsfolk`, `exitCell` and `questReady`
   * declarations were moved up for (PROGRESS defects 7, 15, 25 and this one).
   *
   * @type {object|null}
   */
  let player = null;
  /** How many times this page has tried a lock, so no two shoves roll the same dice. */
  let forceRolls = 0;
  /** How many loot piles this page has opened, for the same reason. */
  let goldDraw = 0;

  /** How far the player is from a cell, in world units. */
  function motorCell(level, objective) {
    if (!level) return { x: 0, z: 0 };
    return {
      x: level.motor.pos[0] - (objective.cellX + 0.5) * CELL_SIZE,
      z: level.motor.pos[2] - (objective.cellZ + 0.5) * CELL_SIZE,
    };
  }

  /**
   * The wilderness's block grid for a settlement seed, built once per page.
   *
   * Every `.RMD` the install ships is decoded (they are cached per name), graded by
   * `classifyBlock` and sorted into the five categories, and the grid is drawn from
   * the seed in the original's draw order — so the country is the same country every
   * time the page loads, and two settlements never share it.
   *
   * @param {number} seed
   * @returns {Promise<{seed: number, indices: Uint8Array, counts: Record<string, number>, blocks: number}>}
   */
  async function wildernessGrid(seed) {
    if (wildGrid && wildGrid.seed === seed) return wildGrid;
    const ids = blockIdsFromListing((await data.bsa()).names());
    /** @type {Map<number, object>} */
    const blocks = new Map();
    for (const id of ids) {
      try {
        blocks.set(id, await data.rmd(rmdName(id)));
      } catch (err) {
        data.warn(`${rmdName(id)}: ${err.message}`);
      }
    }
    const { lists } = wildernessBlockLists(blocks);
    const drawn = generateWildernessIndices(seed, lists);
    wildGrid = { seed, indices: drawn.indices, counts: drawn.counts, blocks: blocks.size };
    return wildGrid;
  }

  /**
   * The settlement's gate, in wilderness coordinates.
   *
   * The `.MIF` header's own start point is the foot of the gate — the cell the city
   * page arrives on — and a city cell is the wilderness cell beside it, because the
   * settlement's 128 cells sit at `CITY_ORIGIN` in the wilderness grid (the same
   * arithmetic `reviseCityQuarter` cuts the quarters with).
   *
   * @returns {{row: number, col: number}}
   */
  function settlementGateCell() {
    const centre = {
      row: CITY_ORIGIN + Math.floor(mif.depth / 2),
      col: CITY_ORIGIN + Math.floor(mif.width / 2),
    };
    const start = mif.startPoints?.[0];
    // `MIFUtils::ARENA_UNITS`: 128 Arena units to a cell, and the header's pair is
    // (x, y) in level terms, which is (col, row) to the rest of the game.
    if (!start) return centre;
    return { row: CITY_ORIGIN + Math.floor(start.y / 128), col: CITY_ORIGIN + Math.floor(start.x / 128) };
  }

  /**
   * Give a level's walls, floors and ceilings the engine's own **ground sampler**.
   *
   * `uploadTexture` samples a world texture POINT-nearest-mip, which is right for the
   * engine's own art and wrong for a surface that runs to the horizon: a floor or a wall
   * seen at a grazing angle is minified along one axis and not the other, so an
   * isotropic mip chain picks the *coarsest* level and smears the surface into streaks.
   * The engine already has the answer for exactly this case — `groundSamplerFor`, the
   * dial the Daggerfall terrain is sampled with (`?ground=off|default|max`) — and it is
   * exported, so the port applies it to its own world textures rather than inventing a
   * second policy. Measured on a wilderness plain at `?ground=max`: with the sampler the
   * ground keeps its detail from the player's feet to the tree line; without it the same
   * frame is a smear with visible moire across the whole middle distance.
   *
   * It is applied to the *level's* textures only — the figures and the scenery stay on the
   * engine's default, because a billboard is met face-on and an anisotropic tap on one buys
   * nothing.
   *
   * The engine is not edited for this, so the parameters are set from here — which means
   * unit 0 is bound behind the renderer's back. `_forgetTextureShadows` is the renderer's
   * own way of being told that (its comment: "this is the one home"), and without it the
   * next draw can skip a bind it thought was already done.
   *
   * @param {WebGLTexture[]} textures
   * @returns {{tier: string, aniso: number, minFilter: string, driverMax: number, applied: number}|null}
   */
  function applyGroundSampler(textures) {
    if (!textures.length) return null;
    const gl = renderer.gl;
    const ext = gl.getExtension('EXT_texture_filter_anisotropic') ?? null;
    const driverMax = ext ? (gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 1;
    const tier = groundSharpnessTier(params.toString());
    const sampler = groundSamplerFor(tier, driverMax);
    const minFilter = gl[sampler.minFilter] ?? gl.LINEAR_MIPMAP_LINEAR;
    gl.activeTexture(gl.TEXTURE0);
    let applied = 0;
    for (const texture of textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, sampler.aniso);
      applied++;
    }
    renderer._forgetTextureShadows?.();
    return { tier, aniso: sampler.aniso, minFilter: sampler.minFilter, driverMax, applied };
  }

  /**
   * Upload a level's scenery pictures and build one static batch for each.
   *
   * A flat is drawn at the size of its own art — Arena's art is pixel art at roughly
   * 102 pixels to a person (`SPRITE_SCALE`), which makes `NOAK2.IMG`'s 148 pixels a
   * 2.6-unit oak — and placed at the height its own `.INF` record asks for (`flatBaseY`:
   * on the floor, or hanging from the ceiling). The batches never move, so they are
   * built once with `dynamic: false` and drawn every frame as they are.
   *
   * @param {{byName: Map<string, {row: number, col: number}[]>}} collected
   * @param {import('../game/mifLevel.js').ArenaLevel} level
   * @returns {Promise<{batch: object, name: string, count: number, hanging: number}[]>}
   */
  async function loadScenery(collected, level) {
    /** @type {{batch: object, name: string, count: number, hanging: number}[]} */
    const batches = [];
    if (!collected.byName.size) return batches;
    const palette = await data.palette(spritePaletteName());
    const floorY = level.floorY * CELL_SIZE;
    const ceilingY = level.ceilingY * CELL_SIZE;
    for (const [name, list] of collected.byName) {
      let image;
      try {
        image = name.endsWith('.DFA') ? parseDfa(await data.bytes(name), name) : await data.img(name);
      } catch (err) {
        data.warn(`flat ${name}: ${err.message}`);
        continue;
      }
      for (const frame of image.frames ?? [image]) {
        renderer.uploadTexture(ARENA_TEXTURE_ARCHIVE, image.frames ? `${name}#${frame.index}` : name,
          imageToUpload(frame.indices, image.width, image.height, image.palette ?? palette));
      }
      const size = flatSize(image.width, image.height, name);
      const centers = list.map((flat) => [
        (flat.row + 0.5) * CELL_SIZE,
        flatBaseY(flat.yOffset ?? 0, { height: size.h, floorY, ceilingY }),
        (flat.col + 0.5) * CELL_SIZE,
      ]);
      batches.push({
        batch: renderer.createBillboardBatch(ARENA_TEXTURE_ARCHIVE, image.frames ? `${name}#0` : name, size, centers, { dynamic: false }),
        name, frames: image.frames?.length ?? 1,
        count: list.length,
        hanging: list.filter((flat) => (flat.yOffset ?? 0) < 0).length,
      });
    }
    return batches;
  }

  /**
   * Upload a level's **loot** pictures and build one batch per picture.
   *
   * A key, a chest, a treasure pile and a corpse are billboards of their own art, drawn at
   * the scenery's own scale (`SCENERY_SCALE`), and they stand where the map's item flats
   * put them (`game/dungeonItems.js`). A taken one is *moved off the floor* rather than
   * rebuilt: the batch is born `dynamic` and `moveBillboardBatch` rewrites every centre it
   * has, which for a loot batch is a handful of quads — one chest fewer, in place.
   *
   * @param {object[]} spots  `current.loot`, or the placed keys
   * @param {import('../game/mifLevel.js').ArenaLevel} level
   * @returns {Promise<{batch: object, name: string, spots: object[], size: {w: number, h: number}, sync: () => void}[]>}
   */
  async function loadLoot(spots, level) {
    /** @type {{batch: object, name: string, spots: object[], size: {w: number, h: number}, sync: () => void}[]} */
    const batches = [];
    /** @type {Map<string, object[]>} */
    const byArt = new Map();
    for (const spot of spots ?? []) {
      if (!spot.drawn || !spot.art) continue;
      let list = byArt.get(spot.art);
      if (!list) byArt.set(spot.art, list = []);
      list.push(spot);
    }
    if (!byArt.size) return batches;
    const palette = await data.palette(spritePaletteName());
    const floorY = level.floorY * CELL_SIZE;
    const ceilingY = level.ceilingY * CELL_SIZE;
    for (const [name, list] of byArt) {
      let image;
      try {
        image = name.endsWith('.DFA') ? parseDfa(await data.bytes(name), name) : await data.img(name);
      } catch (err) {
        data.warn(`loot ${name}: ${err.message}`);
        continue;
      }
      for (const frame of image.frames ?? [image]) {
        renderer.uploadTexture(ARENA_TEXTURE_ARCHIVE, image.frames ? `loot#${name}#${frame.index}` : `loot#${name}`,
          imageToUpload(frame.indices, image.width, image.height, image.palette ?? palette));
      }
      const size = flatSize(image.width, image.height);
      const centers = (pick) => pick.map((spot) => [
        (spot.row + 0.5) * CELL_SIZE,
        flatBaseY(spot.yOffset ?? 0, { height: size.h, floorY, ceilingY }),
        (spot.col + 0.5) * CELL_SIZE,
      ]);
      const batch = renderer.createBillboardBatch(ARENA_TEXTURE_ARCHIVE, image.frames ? `loot#${name}#0` : `loot#${name}`, size, centers(list), { dynamic: true });
      const record = {
        batch,
        name,
        spots: list,
        size, frames: image.frames?.length ?? 1,
        /** Re-centre every quad the batch still has: the ones not taken. */
        sync: () => {
          const live = list.filter((spot) => !spot.taken);
          // `moveBillboardBatch` clamps to the batch's own capacity; a batch whose spots
          // were all taken keeps its last centre and is dropped from the draw instead.
          if (live.length) renderer.moveBillboardBatch(batch, centers(live));
          batch.indexCount = live.length * 6;
        },
      };
      for (const spot of list) spot.batchRecord = record;
      batches.push(record);
    }
    return batches;
  }

  /**
   * Lay the install's own **water and lava** over a level's chasm cells.
   *
   * A chasm has had its rules since the water pass (`updateWater`): a wet one is waded at
   * the engine's swim speed and a lava one burns. It had no *surface*, so a harbour and a
   * lava lake were pits with a static bed texture — the reported "water and lava dont
   * exist". Arena ships the answer as two loose files, `WATERANI.RCI` and `LAVAANI.RCI`,
   * which are 400 × 400 fields of `PAL.COL` indices sitting entirely on the install's own
   * water and lava ladders (`arena/rciFile.js` has the byte-level evidence).
   *
   * Two decisions worth naming, because they are the difference between a flowing surface
   * and a flat one:
   *
   *   * **the plane is drawn by the engine's own water pass** (`renderer.drawWater`) —
   *     alpha-blended, depth-tested but not depth-written, textured, and scrolled by its
   *     own `uWaterScroll`. No engine file is edited for this; the pass was simply unused
   *     by the port until now.
   *   * **the geometry is squares**, because that pass takes one square per draw call: a
   *     city harbour of 1 448 chasm cells comes out of `mergeSquares` as a few dozen draws
   *     instead of 1 448, and every square is inside the chasm (`chasm.test.mjs` proves it
   *     against the real maps).
   *
   * Two things are honestly *not* the original's: the flow rate (Arena's own is in
   * `A.EXE`, which this install does not ship) and the resampling of the 400 × 400 field
   * into a 64-pixel tile. Both are logged as S38 in docs/PROGRESS.md.
   *
   * @param {import('../game/mifLevel.js').ArenaLevel} level
   * @returns {Promise<object[]>} one entry per kind of surface the level needs
   */
  async function loadChasmSurfaces(level) {
    const surfaces = [];
    for (const kind of ['water', 'lava']) {
      const planes = surfacePlanes(level, { kind, cellSize: CELL_SIZE });
      if (!planes.cells) continue;
      const file = kind === 'water' ? WATER_FIELD : LAVA_FIELD;
      const bytes = await data.bytes(file);
      if (!bytes) {
        // An install without the file gets the bed it always had and the HUD says why. A
        // missing surface is a thinner picture, never a wrong one.
        data.warn(`chasm ${kind}: this install has no ${file}`);
        continue;
      }
      let field;
      let report;
      try {
        field = parseRci(bytes, file);
        report = rciReport(field);
      } catch (err) {
        data.warn(`chasm ${kind}: ${err.message}`);
        continue;
      }
      const palette = await data.palette(spritePaletteName());
      const texture = renderer.uploadTexture(CHASM_ARCHIVE, file, rciTile(field, palette));
      if (!texture) { data.warn(`chasm ${kind}: ${file} would not upload`); continue; }
      surfaces.push({ ...planes, texture, scroll: 0, report });
    }
    return surfaces;
  }

  /**
   * Advance every surface the level has and report what each one is, for the tests.
   *
   * The clock is the scene's own `seconds`, so `__debug.pause` freezes the water as surely
   * as it freezes the weapon's swing — which is what lets a check compare two frames.
   *
   * @param {number} dt
   */
  function stepSurfaces(dt) {
    for (const surface of current?.surfaces ?? []) {
      surface.scroll = surfaceScroll(surface.kind, (surface.seconds = (surface.seconds ?? 0) + dt));
    }
  }

  /**
   * Advance every door of the level.
   *
   * A leaf moves at its own pace — `DOOR_OPEN_SECONDS` to open, `DOOR_CLOSE_SECONDS` to
   * shut — and its **collider goes the moment it starts moving**, not when the swing
   * finishes: a player who walks into a door that is opening should walk through it, and a
   * door half-open is a worse obstacle than either state. The panel is drawn by
   * `drawDoors` at whatever `open` it has reached, so the movement is the picture.
   *
   * @param {number} dt
   */
  function stepDoors(dt) {
    for (const leaf of current?.leaves ?? []) {
      if (leaf.open === leaf.target) continue;
      const speed = leaf.target > leaf.open ? 1 / DOOR_OPEN_SECONDS : 1 / DOOR_CLOSE_SECONDS;
      leaf.open = leaf.target > leaf.open
        ? Math.min(leaf.target, leaf.open + speed * dt)
        : Math.max(leaf.target, leaf.open - speed * dt);
    }
  }

  /**
   * Draw the level's doors, each with its own transform.
   *
   * A shut door is the panel the map drew, in the doorway; an opening one turns, slides or
   * lifts by `game/doors.js`'s matrix. A door that has slid or lifted fully away is not
   * drawn at all — it is inside the wall or the ceiling by then, and a drawn quad there is
   * a z-fight waiting to happen.
   */
  function drawDoors() {
    for (const leaf of current?.leaves ?? []) {
      if (!leaf.mesh) continue;
      if (leaf.open >= 1 && leaf.kind !== 'swinging' && leaf.kind !== 'splitting') continue;
      renderer.drawMesh(leaf.mesh, doorMatrix(leaf, CELL_SIZE, leaf.open), null);
    }
  }

  /** Draw the surfaces: the engine's water pass, once per kind, after the opaque world. */
  function drawSurfaces() {
    for (const surface of current?.surfaces ?? []) {
      if (!surface.quads.length) continue;
      renderer.drawWater(surface.quads, surface.tint, surface.texture, surface.scroll);
      // The pass binds its own program and VAO, exactly like the sky: the meshes and the
      // flats drawn after it must not inherit its state.
      renderer.markForeignPass();
    }
  }

  /**
   * Free one level's GL payloads — the mesh, every door leaf's mesh, the scenery and
   * loot billboard batches, and the creature sprite sets.
   *
   * Called (a) by `dispose()` when the scene is replaced and (b) by `loadLevel` *after*
   * the new level is fully built, just before `current` is re-pointed — never before,
   * because the async build between teardown and re-assignment lets paints run against
   * a live-reading `current` whose geometry is already freed.
   * @param {object|null} level  a `current` record, or null
   */
  function releaseLevelPayloads(level) {
    if (!level) return;
    if (level.mesh) renderer.destroyMesh(level.mesh);
    for (const leaf of level.leaves ?? []) if (leaf.mesh) renderer.destroyMesh(leaf.mesh);
    for (const batch of level.sceneryBatches ?? []) renderer.destroyBillboardBatch(batch);
    for (const record of level.lootBatches ?? []) if (record.batch) renderer.destroyBillboardBatch(record.batch);
    for (const set of spriteSets.values()) {
      if (set.batch) renderer.destroyBillboardBatch(set.batch);
      for (const batch of set.frameBatches?.values() ?? []) renderer.destroyBillboardBatch(batch);
    }
    spriteSets.clear();
  }

  /**
   * Load one level of the map: decode, mesh, upload textures, rebuild collision.
   * @param {number} index
   */
  async function loadLevel(index) {
    // A generated dungeon's level is assembled here, out of the install's own pieces, and
    // then takes the rest of this function's path unchanged — it is a level like any other
    // by the time the decoder sees it.
    const mifLevel = generated
      ? assembleDungeon({
        blocks: mif.levels,
        // Each level of one dungeon gets its own draw, so a two-level dungeon is two levels.
        seed: (generated.seed + index * 0x9e3779b9) >>> 0,
        startPoints: mif.startPoints ?? [],
        // **The way out.** The pieces this install ships carry no stairway voxel of their
        // own (measured over all 32: walls, doors, arches and flats, no `STAIRUP`), so a
        // dungeon assembled from them had no exit at all — the reported "serve no purpose
        // and have no exit". The pass stamps the level's *own* `*LEVELUP` art into a wall
        // beside the arrival, which is the doorway the install's dungeons use for theirs.
        exitVoxel: await generatedExitVoxel(),
        onWarn: (m) => data.warn(`${generated.name}: ${m}`),
      })
      : mif.levels[index];
    if (!mifLevel) throw new Error(`${mapName} has no level ${index}`);
    status(`${mapName} level ${index + 1}/${levelCount}${generated ? ` · ${mifLevel.name}` : ''}`);
    if (mifLevel.warnings.length) for (const w of mifLevel.warnings) data.warn(`${mapName} level ${index}: ${w}`);

    // A city is assembled here, from the same skeleton every time but a different
    // draw of blocks: `?seed=` is what makes a city reproducible, which is also
    // what lets the browser suite assert anything about it at all.
    let voxels = mifLevel;
    let infName = mifLevel.info.toUpperCase();
    let city = null;
    let settlement = null;
    if (cityRequest) {
      status(`building ${mapName} · ${cityRequest.kind} seed ${cityRequest.seed}`);
      settlement = await buildCityLevel({
        data,
        mif,
        blocksPerSide: cityRequest.blocksPerSide,
        seed: cityRequest.seed,
      });
      if (!wildRequest) {
        city = settlement;
        voxels = city.level;
        infName = cityRequest.infName;
      }
    }

    // ── the wilderness ─────────────────────────────────────────────────────────
    //
    // The country around the settlement: a 2×2-block window of the 64×64-block
    // wilderness (`game/wilderness.js`), whose middle four blocks are the
    // settlement's own quarters revised out of the city just built, and whose other
    // blocks are `.RMD` records this install ships. The level is always 128×128, so
    // its size travels with the window rather than with the map file.
    // **The level's own size, not the file's.** A generated level is 64×64 cells — four
    // 32×32 pieces — while `mif` is the *piece* file (`RANDOM1.MIF`, 32×32). Reading the
    // grid off `mif` therefore decoded a quarter of the assembled dungeon and threw the rest
    // away: measured on seed 4219465407, the assembly chose its arrival at (30,32) of a
    // 64×64 level, the decoder built a 32×32 grid, the player was spawned outside it and fell
    // out of the world (feet y −167 and still falling, `grounded: false`). Every generated
    // dungeon was one quarter of itself — which is also why they all looked alike.
    let levelWidth = mifLevel.width ?? mif.width;
    let levelDepth = mifLevel.depth ?? mif.height;
    let wild = null;
    let gateCell = null;
    let standCell = null;
    if (wildRequest) {
      const seed = wildRequest.seed ?? place?.wildernessSeed ?? cityRequest?.seed ?? 20232;
      const grid = await wildernessGrid(seed);
      // Where the window is. `?wild=row,col` names a cell; without one the player
      // arrives at the settlement's own start point — the foot of its gate, the same
      // cell the city page arrives on, because both places share one grid.
      gateCell = settlementGateCell();
      // **The world remembers where it left them.** When `readWildRequest` did *not*
      // hand in a cell (a bare `?wild` with no coordinates, or the remembered-cell boot
      // above), the save's own answer wins over the gate — that is the whole point of a
      // persistent outdoor world. A `?wild=row,col` in the URL always beats memory.
      const remembered = wildRequest.cell
        ? null
        : (() => {
          try {
            const saved = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? 'null');
            const cell = saved?.wild && Number.isFinite(saved.wild.row)
              ? { row: Math.round(saved.wild.row), col: Math.round(saved.wild.col) }
              : null;
            const same = typeof saved?.name === 'string' && place?.name
              && saved.name.toLowerCase() === place.name.toLowerCase();
            return same ? cell : null;
          } catch { return null; }
        })();
      const at = remembered ?? wildRequest.cell ?? gateCell;
      const cameFromMemory = Boolean(remembered);
      const origin = wildernessWindowOrigin(at.row, at.col);
      status(`wilderness · seed ${seed} · blocks ${grid.counts.normal ?? 0} normal + ${grid.counts.village ?? 0} village + ${grid.counts.dungeon ?? 0} ruins`);
      wild = await buildWildernessWindow({
        data,
        indices: grid.indices,
        originRow: origin.row,
        originCol: origin.col,
        city: settlement?.level ?? null,
        onWarn: (m) => console.warn(`[wilderness] ${m}`),
      });
      voxels = wild.level;
      levelWidth = WILD_WINDOW;
      levelDepth = WILD_WINDOW;
      infName = wildRequest.infName
        ?? wildernessInfName({ climate: cityRequest?.climate ?? 'temperate', weather: cityRequest?.weather ?? 'clear' });
      // The player arrives at the cell that was chosen — the gate when the page named
      // none — in the window's own coordinates, which is the same cell of the same
      // grid either way.
      standCell = { row: at.row - origin.row, col: at.col - origin.col };
      // Debug: where the memory put the player, so a mismatch is readable on the spot.
      if (cameFromMemory) dbg.wildFromMemory = { at, after: remembered };
    }

    const inf = await data.inf(infName);
    const level = decodeLevel(voxels, inf, {
      width: levelWidth,
      depth: levelDepth,
      mapType: wildRequest ? 'wilderness' : cityRequest ? 'city' : 'interior',
      // A player who came in through a street door arrives at the building's **own**
      // start point — Arena keeps it in the `.MIF` header, and for `EQUIP1.MIF` it is the
      // foot of the entry corridor with the shop room at its end. A generated dungeon is
      // the same: the pieces' own header names where its level begins, and the player
      // arrives there rather than at the middle of the maze.
      //
      // **And so is a dungeon walked into by name.** The condition used to be `entryCell ||
      // generated`, which left every one of the install's own sixteen dungeons — the ones the
      // world map sends a player to by name — decoded with *no* start points at all, so the
      // decoder fell back to its own spiral out from the arithmetic centre of the grid and
      // the player arrived wherever that landed. Measured on `CRYPT1.MIF` (Crypt of Hearts,
      // 100×100): the centre cell is open, walled in on all four sides, and the arrival had
      // **1 of the level's 3711 open cells reachable** — the reported "you find yourself
      // blocked off as soon as you enter", on a dungeon the archive really ships. The header
      // point is the file's own answer to where a player comes in, and only a page whose grid
      // is *assembled* from other files (a city, a wilderness window) has no header point of
      // its own to read.
      startPoints: cityRequest || wildRequest ? undefined : mif.startPoints,
    });
    // A generated dungeon chooses its own arrival on the *decoded* level — the pieces'
    // header point when it opens onto the level, the largest walkable region's middle when
    // it does not (see `dungeonPlan.spawnCellFor`, and why a fixed centre cell is no good).
    if (generated) {
      // **The assembler's own arrival first.** It chose one before it cut the connecting
      // passages — the cell the level's own header point names when that point leads
      // somewhere, otherwise the middle of the largest region — and the exit was stamped
      // beside *that* cell. `spawnCellFor` reads the decoded level and prefers the header
      // point, which on an assembled level is `RANDOM1.MIF`'s own piece coordinate: measured
      // on seed 4219465407, the assembler arrived at (30,32) with the way out at (29,32), and
      // `spawnCellFor` answered (10,10) from the header — a different region of the same
      // level, forty cells from the door. The assembler's answer is the one the exit was
      // built for, so it is the one the player gets.
      const arranged = voxels?.arrival ?? null;
      const passable = (row, col) => {
        const cell = level.cells[row * level.width + col];
        return Boolean(cell) && !cell.solid && !cell.floor?.chasm;
      };
      const spot = arranged && passable(arranged.row, arranged.col)
        ? arranged
        : spawnCellFor(level, mif.startPoints ?? []);
      if (spot) {
        level.spawn = { x: spot.row + 0.5, y: level.floorY, z: spot.col + 0.5 };
        data.warn(`${generated.name}: level ${index + 1} arrival from the ${spot.from}`
          + `${voxels?.exit ? `, way out at ${voxels.exit.row},${voxels.exit.col}` : ', no way out stamped'}`);
      }
    }
    // A city's `MAP2` mass is drawn as the buildings' upper floors and roofs. Only an
    // outdoor level has any use for it: in a dungeon the same layer is the stone above
    // the ceiling, which the ceiling quad already hides (`game/mifMesh.js`, the
    // "storeys above" pass). The wilderness keeps it too — the settlement's wall is the
    // only thing the original copies out there, but the wall's own height bits go with it
    // (`wilderness.js`'s `reviseCityQuarter`), so the ring stands as tall as the city does.
    const built = buildLevelMesh(level, {
      cellSize: CELL_SIZE,
      upperStoreys: Boolean(cityRequest) || Boolean(wildRequest),
    });
    // The shops whose doors are on this level. A city is the only place they exist: a
    // `0xA` edge in a dungeon is a fence, a gate or a brazier.
    const doors = city ? cityDoors({ level, city, inf, blocksPerSide: cityRequest.blocksPerSide }) : [];

    // ── the doors themselves ───────────────────────────────────────────────────
    //
    // Every `0xB` voxel the mesher met is a door leaf with its own bundle and its own
    // collider slice (`game/mifMesh.js`), and the level's own `LOCK` chunk says which of
    // them are locked and how hard (`game/doors.js`). Until this pass a door was simply a
    // wall with door art on it — the reported "you cant ... find keys to open doors": 87
    // doors in `39300577.MIF`'s first level, none of them openable.
    const locks = lockTable(voxels);
    const leafSpots = built.doors.map((entry) => {
      const lockLevel = lockAt(locks, entry.row, entry.col);
      const saved = doorStateAt(worldMemory, memoryKey(index), entry);
      const open = saved?.open ? 1 : 0;
      return { ...entry, lockLevel: saved?.lockLevel ?? lockLevel,
        locked: saved?.locked ?? lockLevel > 0, open, target: open, mesh: null };
    });
    // The keys for a level's sealed doors, on the player's own side of them.
    const placedKeys = placeKeys({ level, doors: leafSpots, spawn: level.spawn });
    if (leafSpots.length) {
      data.warn(`${mapName} level ${index}: ${leafSpots.length} doors (${leafSpots.filter((d) => d.locked).length} locked, `
        + `${leafSpots.filter((d) => d.lockLevel > HAND_FORCE_MAX).length} sealed), ${placedKeys.length} keys placed`);
    }

    // Textures first, under the archive/record pair each sub-mesh asks for: a
    // sub-mesh whose texture is missing draws untextured, not black, so this is
    // the one thing that must not be left to chance.
    let uploaded = 0;
    const missing = [];
    /** @type {WebGLTexture[]} */
    const worldTextures = [];
    for (const material of built.materials) {
      const upload = await data.texture(material.ref);
      if (!upload) { missing.push(material.key); continue; }
      const texture = renderer.uploadTexture(ARENA_TEXTURE_ARCHIVE, material.record, upload);
      if (texture) worldTextures.push(texture);
      uploaded++;
    }
    const sampler = applyGroundSampler(worldTextures);

    const mesh = renderer.createMesh(built.model);
    const collider = new Collider();
    collider.addMesh('arena-level', built.collider.positions, built.collider.indices, identity());
    // Every door leaf is its own collision bucket, so opening one takes exactly its
    // triangles out of the world and leaves the rest of the level standing.
    for (const leaf of leafSpots) {
      leaf.mesh = renderer.createMesh(leaf.model);
      if (!leaf.target && leaf.collider.indices.length) collider.addMesh(leaf.id, leaf.collider.positions, leaf.collider.indices, identity());
    }
    const motor = new PlayerMotor(collider, { speed: 34, running: 20, swimming: 20 });

    // ── where the player really starts ──────────────────────────────────────────
    //
    // `level.spawn` is the decoder's own pick (`mifLevel.pickSpawn`): the file's header point
    // when it is standable, otherwise the first standable cell found spiralling out from the
    // **arithmetic centre of the grid** — and that spiral accepts one-cell pockets, which is
    // exactly the shape of the reported defect. Measured on `CRYPT1.MIF` with the fallback
    // below: the player arrived at (50,50) of a 100×100 level, grounded false, with one of the
    // level's open cells reachable and the other 3710 walled off.
    //
    // A generated dungeon is asked the same question one screen up — the assembler chooses an
    // arrival on the raw voxels and the exit is stamped beside it — so the law here is the same
    // one, asked of the decoded level (`dungeonPlan.spawnCellFor`): the file's own header point
    // when the level leads out of it, otherwise the middle of the **largest** walkable region.
    // The plain centre survives only for the pages whose grid is assembled and has no header
    // of its own (a city, a wilderness window), and as the last resort when a level has no
    // walkable cell at all.
    let spawn = level.spawn ?? { x: levelDepth / 2, y: level.floorY, z: levelWidth / 2 };
    if (!generated && !city && !wild) {
      const chosen = spawnCellFor(level, mif.startPoints ?? []);
      if (chosen) {
        spawn = { x: chosen.row + 0.5, y: level.floorY, z: chosen.col + 0.5 };
        dbg.spawn = { row: chosen.row, col: chosen.col, from: chosen.from, was: level.spawn };
      }
    }
    motor.spawn(spawn.x * CELL_SIZE, spawn.y * CELL_SIZE, spawn.z * CELL_SIZE);

    // Arena interiors are enclosed; the sky is only drawn when a level has cells
    // without a ceiling (outdoor streets, and dungeon courtyards).
    const openSky = level.stats.ceilinged < level.cells.length;
    /** Whether this level has a sky and an hour — see `applyDaylight`. */
    const lit = Boolean(cityRequest) || Boolean(wildRequest) || level.outdoors === true;
    // The water and the lava — Arena's own fields over the level's own chasm cells.
    const surfaces = await loadChasmSurfaces(level);

    // A city and a wilderness are both *outside*: sun, thin fog, sky. The wilderness
    // has ceilinged cells (the settlement's wall carries a `MAP2` surface), so it is
    // the page that says it is outdoors, not the level's own statistics.
    const outside = Boolean(cityRequest) || Boolean(wildRequest);
    const outdoor = outside || level.outdoors;
    const base = outside ? CITY_AMBIENT : INTERIOR_AMBIENT;
    const ambient = params.has('ambient') ? Number(params.get('ambient')) : base[0];
    const fogDensity = params.has('fog') ? Number(params.get('fog'))
      : wildRequest ? WILD_FOG_DENSITY : outside ? CITY_FOG_DENSITY : FOG_DENSITY;
    const sunScale = params.has('sun') ? Number(params.get('sun')) : (outside ? CITY_SUN_SCALE : 0);
    // **`?ambient=` and `?sun=` are a tuning door, and a fixed light.** When either is given the
    // frame keeps the number it was handed for the whole visit — the daylight pass below stands
    // down — so a probe that pinned the light to compare two builds still compares the same two
    // builds. Without them the hour decides, from the numbers above as its noon.
    dayForced = params.has('ambient') || params.has('sun');
    // This level's own light at **its** noon, for the hour to scale down (`applyDaylight`): the
    // measured values above, kept in one array so the per-frame pass writes nothing new.
    dayAmbient[0] = ambient;
    dayAmbient[1] = ambient * (outside ? 1.0 : 0.965);
    dayAmbient[2] = ambient * (outside ? 1.02 : 0.92);
    dayLit = lit;
    daySunMax = sunScale;
    dayFogDensity = fogDensity;
    dayScratch.dayFogColor = outside ? CITY_FOG_COLOR : FOG_COLOR;
    renderer.setClearColor(openSky ? SKY_CLEAR : [0.02, 0.02, 0.03, 1]);
    renderer.setLighting(dayAmbient, sunScale, sunScale > 0 ? CITY_SUN : NO_SUN);
    renderer.setFog('exp2', fogDensity, 0, 0, dayScratch.dayFogColor);

    // ── the scenery ────────────────────────────────────────────────────────────
    //
    // The level's flats — a wilderness's trees, rocks, bushes and ruins, a city's
    // street furniture, a dungeon's bones — are pictures, and until this existed the
    // mesher dropped them (`buildLevelMesh` returns null for `kind === 'entity'`), so
    // the country outside the walls was bare ground. `game/flats.js` says which cells
    // carry one and what art each names; one static billboard batch per picture draws
    // every copy of it.
    const scenery = collectFlats(level, inf);
    // ── the furniture ────────────────────────────────────────────────────────
    // A decoded interior carries its `.INF`'s own thin few flats; now the room is dressed
    // too. `game/furnish.js` puts Arena's own flat art on the floor by family (tables,
    // the same `FIRE_ART` pass that lights a dungeon lights a dressed tavern. Doors stay
    // clear, standable cells stay standable, and the placement is deterministic in the
    // level's own seed.
    const furnishing = furnishRoom({
      infName,
      open: openFloorCells(level),
      occupied: scenery.flats,
      doors: leafSpots?.map((leaf) => ({ row: leaf.row, col: leaf.col })) ?? [],
      solidAt: (row, col) => solidCellAt(level, row, col),
      seed: Math.round((cityRequest?.seed ?? place?.citySeed ?? place?.dungeonSeed ?? 1) || 1),
    });
    for (const prop of furnishing.props) {
      let list = scenery.byName.get(prop.name);
      if (!list) scenery.byName.set(prop.name, list = []);
      list.push({ row: prop.row, col: prop.col, flatIndex: -1, name: prop.name, on: 'floor', yOffset: 0, itemIndex: null, furniture: true });
      scenery.flats.push({ row: prop.row, col: prop.col, flatIndex: -1, name: prop.name, on: 'floor', yOffset: 0, itemIndex: null });
    }
    // Interactive items/actors are drawn by their live systems, not duplicated forever
    // in the static scenery pass after being taken or killed.
    const sceneryOnly = { ...scenery, byName: new Map([...scenery.byName]
      .map(([name, list]) => [name, list.filter((flat) => flat.itemIndex == null)])
      .filter(([, list]) => list.length)) };
    const sceneryBatches = await loadScenery(sceneryOnly, level);

    // ── what the map left lying about ──────────────────────────────────────────
    //
    // The level's own item flats are its **loot and its people**: a key, a chest, a
    // treasure pile, a corpse, a knight, a bartender (`game/dungeonItems.js` reads the
    // numbers off the INF). `START.MIF` places sixteen of them, `39300577.MIF`'s first
    // level thirty and the palace's first level thirty-one knights. They are picked up
    // with `E` and drawn as billboards of their own art, like the scenery — one more
    // reason the art has to be readable; animated DFA loot uses the original frames.
    const spawns = spawnsFromFlats(scenery);
    const lootSpots = [];
    for (const pickup of spawns.pickups) {
      // Both static IMG and animated DFA pickups use their own original art.
      const art = pickup.art ?? '';
      // Original key flats have no lock metadata. Bind them to the level's locks;
      // otherwise the saved pack gets lock:0 and the key opens absolutely nothing.
      const lock = pickup.kind === 'key' ? Math.max(0, ...leafSpots.map(leaf => leaf.lockLevel)) : undefined;
      lootSpots.push({ ...pickup, ...(lock !== undefined ? { lock } : {}), drawn: /\.(IMG|DFA)$/.test(art), taken: false });
    }
    for (const spot of placedKeys) {
      const existingKey = lootSpots.find(l => l.kind === 'key' && l.row === spot.row && l.col === spot.col);
      if (existingKey) existingKey.lock = Math.max(existingKey.lock ?? 0, spot.lock);
      else lootSpots.push({ ...spot, kind: 'key', itemIndex: 1, name: 'a key', drawn: true, taken: false, placed: true });
    }
    // ── what this visit already took ───────────────────────────────────────────
    // A dungeon's chests, bodies and keys come back when the world has moved on
    // (`save.js`'s `RESTOCK_DAYS`), and until then the cells the player emptied are empty
    // again on this visit. Before this the loot was infinite in the only sense that
    // matters to a player: walk out, walk back in, and the same chest paid out again.
    const lootKey = `${mapName}#${index}`;
    const emptied = lootStillEmpty(lootKey, radiant.day ?? 0);
    for (const spot of lootSpots) {
      if (emptied.has(`${spot.row},${spot.col}`)) spot.taken = true;
    }
    const lootBatches = await loadLoot(lootSpots, level);
    // What this level's `.INF` says may live in it. `monsterRosterFromInf` is the map's
    // own list; an empty one means the level has no monsters, not that the game should
    // pick some (the Imperial Dungeons' escape is quiet in the data).
    const roster = monsterRosterFromInf(inf);

    // The outdoor levels get Arena's own horizon rather than the bare gradient: the
    // climate's sky, the install's clouds in it and the install's mountains on the line.
    if (openSky) await ensureSky(infName);
    // ── the weather, in the air ────────────────────────────────────────────
    //
    // `openSky` is what makes a level outdoors at all, and only an outdoor level can have
    // weather falling on it: a dungeon's sky is a ceiling. Which weather is the level's own
    // business — its `.INF` name says so (`TCW.INF` rain, `TCS.INF` snow, `TCR.INF` bare
    // overcast) — and `outside` is the page's own word for "this is the country": a city or
    // a wilderness window, not a courtyard open to the sky.
    airWeather = openSky && outside ? precipitationMode(skyClimateOf(infName).weather) : null;

    leaves = leafSpots;
    loot = lootSpots;
    // The level's own street grid is gone with the level: the path book is rebuilt on the
    // first walk anyone asks for (`townWalkBook`), against the streets that now exist.
    townWalk = null;
    // The visit's own commerce: a fresh shelf's stock, and a fresh keeper's patience.
    visitHaggle = newVisitHaggle();
    stockTaken = {};
    townWalkNav = null;
    // **The old level goes with the new.** Only now, with every payload of the level
    // being replaced already built and `current` about to be re-pointed, is it safe to
    // free the previous one: the async build above lets paints run between teardown and
    // assignment, and a teardown-first order drew into freed VAOs (caught as the
    // swap-crash in the disposal audit). This is where palace descents stopped leaking
    // their geometry for the life of the page.
    const previous = current;
    releaseLevelPayloads(previous);
    // The level's own `*TRIG` cells (the raw level's list is what they name), and a
    // clean *fired* set: a new level says its own things again.
    const triggerCells = triggerTable(mifLevel);
    firedTriggers = new Set();
    // A new level's arrival cell is not something the player *walked onto*: the first step
    // of the level records where they stand, and only a step into a different cell fires.
    lastTriggerCell = null;
    lastTriggerFeet = null;
    // …and the sound cooldown is **cleared, not stamped**. It was stamped with `dbg.seconds`,
    // which is near zero on a page's first level, so the next comparison read "0.9 s since the
    // last clip" and swallowed the first clip a player legitimately stepped onto — every
    // level's opening trigger cell was silent, and the suite's splash walk-in rang nothing.
    // The arrival is silent because it is not a step (the two rules above), not because a
    // timer was primed to veto the next real one.
    lastTriggerSoundAt = -99;
    // **`motor` belongs here.** The first level's player motor is built above this and every
    // reader of the state — `feetOf`, the HUD's distance lines, the paint pass and the
    // debug door's own `state()` — reads it off `current`; it was dropped from this literal
    // once, and the whole page died on the first `state()` call with a town that never drew.
    current = {
      index, level, rawLevel: mifLevel, built, mesh, collider, motor, inf, infName, uploaded, missing, openSky, outdoor,
      triggers: triggerCells,
      spawn, cam, city, doors, shopKinds: city ? shopSignKinds(inf) : null,
      wild, scenery, sceneryBatches, standCell, sampler, surfaces,
      leaves: leafSpots, loot: lootSpots, lootBatches,
      spawns, roster, peopleSpots: spawns.people, furniture: furnishing.props.length,
      lightSources: sceneLightSources(scenery.flats.map((flat) => ({ ...flat,
        baseY: flatBaseY(flat.yOffset ?? 0, { height: 1, floorY: level.floorY * CELL_SIZE,
          ceilingY: (level.floorY + 1) * CELL_SIZE }) + 0.8 })), doors, CELL_SIZE),
    };
    if (hud) {
      const what = city
        ? `${cityRequest.kind} · seed ${cityRequest.seed} · ${city.stats.stamped}/${city.slots.length} blocks`
        : wild
          ? `wilderness · blocks ${wild.blocks.join(', ')}${wild.missing.length ? ` · ${wild.missing.length} missing` : ''}`
          : `level ${index + 1}/${levelCount}`;
      // The level's own line, kept on `current` so the objective can be appended to it
      // whenever it changes — including the frame after this one, when the quest has
      // had a chance to say what is here (the quest is loaded after the first level,
      // so this cannot be built here).
      current.hudBase =
        `${mapName} · ${what} · ${infName}\n`
        + `${levelWidth}×${levelDepth} cells · ${built.stats.quads} quads · ${built.materials.length} materials · ${uploaded} textures`
        + `${scenery.flats.length ? ` · ${scenery.flats.length} flats in ${sceneryBatches.length} batches` : ''}`
        + `${surfaces.length ? ` · ${surfaces.map((s) => `${s.cells} ${surfaceLabel(s.kind)} cells in ${s.quads.length} planes`).join(' + ')}` : ''}\n`
        + 'WASD move · Shift run · Space jump · E take / enter / gate · F strike · V view · M world map';
      hud.textContent = current.hudBase;
    }
    // **The wild lands in the save.** A wilderness window writes its absolute cell into
    // the last-location record, so a page load lands the player on the countryside cell
    // they *stood on* rather than at the gate or in the middle of a city block — the whole
    // point of a persistent world. A city page clears the field so a later, different
    // settlement cannot read a stale cell.
    const wildFoot = wild && place
      ? {
        row: (standCell?.row ?? 0) + (wild.originRow ?? 0),
        col: (standCell?.col ?? 0) + (wild.originCol ?? 0),
      }
      : null;
    try {
      if (!entryCell) {
        localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
          name: place?.name ?? mapName,
          dungeon: Boolean(wildRequest) && false,
          seed: place?.dungeonSeed ?? null,
          wild: wildFoot,
        }));
      }
    } catch { /* storage can be refused; the map's fallback applies */ }
    visitPlace(worldMemory, memoryKey(index), city ? 'settlement' : entryCell ? 'building' : 'dungeon', radiant.day ?? 0);
    saveWorldState(worldMemory);
    updateObjectiveHud();
    return current;
  }

  // ── the side work, BEFORE the first level is built ─────────────────────────
  //
  // `radiant` is read by the HUD's objective line, and the HUD is written *during*
  // `loadLevel` — so the declaration has to come first, or the page dies on a temporal dead
  // zone `ReferenceError` instead of booting. This is the same trap as the `townsfolk` and
  // `exitCell` declarations earlier in this project's history (defects 7, 15 and 25 in
  // docs/PROGRESS.md), and the same rule fixes it: everything the first `loadLevel` can read
  // is declared before it, whatever the file's own reading order would prefer.
  let radiant = loadRadiantState();
  // The guild ledger loads with the side work, for the same TDZ reason: the talk panel
  // reads it while the first level is still building (defects 7/15/25's rule again).
  let guilds = loadGuildState();
  const worldMemory = loadWorldState();
  // Include location/door identity: many towns share an interior map, not a front door.
  const memoryKey = (index) => `${place?.name ?? fromPlace?.name ?? 'map'}:${mapName}#${index}`
    + (cityRequest ? `:city=${cityRequest.seed}` : '')
    + (entryCell ? `:entry=${entryCell.row},${entryCell.col}` : '');
  function rememberDoor(leaf) {
    setDoorState(worldMemory, memoryKey(current.index), leaf,
      { open: leaf.target > 0, locked: leaf.locked, lockLevel: leaf.lockLevel });
    saveWorldState(worldMemory);
  }
  /**
   * The work the people of this town can offer.
   *
   * `jobDungeons` is the list of dungeons this install can really open (the same list the
   * world map's board is built from). What each person offers is remembered **on the
   * person** (`offerFrom` sets `person.offer`), so a conversation that wanders off and comes
   * back — or a person who walks into the next cell while they are speaking — does not
   * reroll them.
   */
  let jobDungeons = null;

  /**
   * Who in the world knows the player, and how they feel about it (`game/regard.js`).
   *
   * The twin's living-world law, on this save: a regard per *person*, keyed by the place
   * they stand in and the cell they were placed on, easing back toward nothing for every
   * day the player does not see them. It is declared here, beside `radiant`, for the same
   * reason — `populateTown` reads it while the first level is being built.
   */
  let regard = loadRegard();

  /** Remember one act toward one person, and settle what it earned them. */
  function notePerson(person, event) {
    const id = person?.regardId ?? null;
    if (!id) return null;
    const result = noteRegard(regard, id, event, radiant.day ?? 0);
    regard = result.record;
    saveRegard(regard);
    if (result.delta) dbg.regard = { id, event, delta: result.delta, regard: result.regard, standing: result.standing };
    return result;
  }

  await loadLevel(startIndex);

  // ── where a player who walked in leaves by ─────────────────────────────────
  //
  // On the street it is the **street cell of the doorway** (`?enter=25,7`, which is also
  // what `back` carries as its `at`). Inside the building it cannot be that cell: a shop is
  // its own 25×25 map and has no street cell in it at all. It is the cell the player
  // arrived on — the `.MIF`'s own start point — because that is the foot of the doorway
  // they came through, and "you leave by the door you came in" is the rule in both places.
  exitCell = entryCell ? { row: Math.floor(current.spawn.x), col: Math.floor(current.spawn.z) } : null;

  // `?at=row,col` — stand here, not at the map's own arrival. Coming back out of a shop
  // has to put the player back on the street cell they went in by, and a city's own
  // arrival point is its gate.
  const atParam = parseCell(params.get('at'));
  if (atParam) standNear(atParam.row, atParam.col);
  // `?wild=row,col` the same way, in the window's own coordinates: the cell named is
  // a *wilderness* cell, and the window's origin moves to hold it.
  const wildStand = current.standCell;
  if (wildStand) standNear(wildStand.row, wildStand.col);

  // Arrive facing out of the gate, the doorway or the room rather than into it.
  if (!params.has('shot') && !params.has('yaw')) {
    cam.yaw = openYaw(current.level, current.spawn.x, current.spawn.z);
  }

  // ── Arena's own prose, and the work to be done here ───────────────────────
  //
  // Two things happen on arrival that make this a game rather than a walkthrough:
  // the place *says something* — Arena's own gate greeting for a city-state, its
  // own arrival text for a quest dungeon — and, when the player has come here for a
  // reason, there is something to find.
  const library = await loadArenaText(data);
  const chain = buildQuestChain(world);
  let quest = loadQuestState();
  // The people's art and their words, both read off the player's own install: the 65
  // `.CFA` walk files in `GLOBAL.BSA` are the armoured roster, `template.dat`'s lines are
  // what they say (`game/townsfolk.js`) — and the archive's **other** people, the generic
  // men and women with their walk/**talk**/die sheets and the watch, are read beside them
  // (`game/peopleKinds.js`). Without the second list a town holds only fighters in armour.
  const rosterNames = (await data.bsa()).names();
  const folk = folkFromListing(rosterNames);
  const kinds = peopleKindsFromListing(rosterNames);
  const talkLines = talkCorpus(library.talkTemplates);
  questReady = true;

  // ── the player, and the fight ──────────────────────────────────────────────
  //
  // This scene now knows who is walking through it. Before this, a character could be
  // created and then never be anything: the dungeon had no idea whether a level-1
  // Acrobat or a level-20 warrior had come in. Health, Strength, Luck, Agility and the
  // class's critical chance all read off the saved character (see `game/combat.js`).
  player = loadCharacter() ?? placeholderPlayer();
  if (!player.weapon) player.weapon = 'longsword';
  if (!player.material) player.material = 'steel';
  /** @type {import('../game/encounters.js').SpawnedMonster[]} */
  let monsters = [];
  /**
   * A spawn's own number, handed out the first time `__debug.combat()` reads the array.
   *
   * **An index is not a handle.** The array is compacted when a creature dies
   * (`stepMonsters`), so a fixture that captured `monsters.length - 1` before a fight was
   * addressing a different creature after one — the `actioncombat` suite carries a comment
   * about exactly that ("the golem's removal after its death shrank the array"), and its
   * workaround was to look creatures up by **name**, which breaks the moment a level's own
   * bestiary fields a second one (the Imperial Dungeons hold rats now — D-15). A serial is
   * stable across compaction and across several creatures of one species.
   */
  let spawnSerial = 0;
  /**
   * The bolts in flight — a caster's thrown magic (`game/ranged.js`). Each is stepped by
   * the sim clock, dies on a wall, and resolves against the player's live defence; the
   * dead are dropped at the end of the step that killed them.
   * @type {object[]}
   */
  const bolts = [];
  /** The world map overlay while it is open, or null. */
  let mapScene = null;
  /** @type {Map<string, {file: string, cfa: object, size: object, batch: object, capacity: number}>} */
  const spriteSets = new Map();
  let playerSet = null;
  let swingCooldown = 0;
  let kills = 0;
  let xp = Number(player.xp ?? 0);
  /**
   * The guard: `B` held, or the right mouse button. An incoming blow runs through
   * `guardDamage` when it is up (see `game/inventory.js` for why the ratio is a
   * reconstruction and where the game says so).
   */    let mouseGuard = false;
  const guarding = () => (mouseGuard || keys.has('KeyB')) && !defence.guardBroken;
  /**
   * The defence: a roll's i-frames, a parry's window, and the stamina that pays for both
   * (`game/combatStyle.js`). The timers count up from the press, so "is it live?" is answered
   * at the instant a blow lands, which is the rule the module's `resolveDefence` decides by.
   */
  const defence = {
    rollT: Infinity,
    rollDirection: [0, -1],
    parryT: Infinity,
    riposte: 0,
    riposteUntil: 0,
    riposteTarget: null,
    guardBroken: false,
    stamina: { endurance: 50, level: 1, stamina: undefined, max: undefined, regenIn: 0 },
    // The heavy: the clock the press runs while it is held (`combatStyle.js`'s `chargeScale`),
    // and whether a press is holding at all — a player who taps gets the light blow exactly
    // as they always did, because the heavy is the hold and not the press.
    charging: false,
    chargeStart: 0,
    chargeHeld: Infinity,
    chargePulse: 0,
  };
  const combatFx = new CombatFx();
  const atmosphere = new SceneAtmosphere();
  let sceneLightsEnabled = true;
  let atmosphereEnabled = true;
  let combatFxPass = null;
  signal.addEventListener('abort', () => combatFxPass?.dispose(), { once: true });
  let animClock = 0;
  /**
   * The swing animation (`01…ATT.CFA`, the only view the attacks ship at). It plays
   * over the walk set for `SWING_ANIM_SECONDS` after every strike, so a blow has a
   * picture and not just a line of text in the HUD.
   */
  let attackSet = null;
  /** Seconds left of the swing animation, and how long it lasts in all. */
  let swingAnim = 0;
  const SWING_ANIM_SECONDS = 0.45;
  /**
   * The camera's wound: a heavy blow and a landed parry shake the view a beat, then it
   * decays. GUESS magnitudes — read against the same figures the browsergame's own shake
   * uses (0.3 for a heavy, 0.15 for a knock) — because this is presentation, not data.
   */
  let screenShake = 0;
  /** Whether the held heavy's "armed" notice has fired for the current hold. */
  let chargeFullShown = false;
  /**
   * **Hit-stop: the screen's own arrest.** A wound that carries weight — a heavy landing,
   * a poise break — holds *everything* slow for a fraction of a second (`step` dissipates
   * it over the whole sim), so the blow is felt in time and not only on the bar. It is a
   * presentation clock, and it never touches the numbers the fight is decided by.
   */
  let hitStop = 0;
  /**
   * The weapon in the player's hands — Arena's own first-person state machine
   * (`game/weaponView.js`), and the art this install has for it.
   *
   * `weaponArt` is the sheet, one pre-coloured canvas per image index the state table can
   * show, so a frame is a `drawImage` and not a palette walk. It is filled by
   * `loadWeaponArt`, which is why `weaponLoaded` and `weaponMissing` exist: a flail or a bow
   * has no `.CIF` in this install, and the HUD says so rather than drawing the wrong weapon.
   */
  let weaponRig = createWeaponRig(player.weapon);
  /** @type {Map<number, {canvas: HTMLCanvasElement, xOffset: number, yOffset: number, width: number, height: number}>} */
  let weaponArt = new Map();
  let weaponLoaded = null;
  let weaponMissing = null;
  /** What the last painted frame actually put on the overlay, in CSS pixels. */
  let weaponOnScreen = null;
  /** Where the player's feet were last frame, so a still figure can stand still. */
  let lastFeet = null;
  /** Seconds of lava the player has stood in since the last point of damage. */
  let lavaBurned = 0;
  let view = params.get('view') === 'third' ? 'third' : 'first';
  const battle = new ArenaRandom(0xba77);

  /**
   * The palette a creature is drawn with.
   *
   * `PAL.COL` — the same palette the walls use, and OpenTESArena's `ArenaPaletteName`
   * calls it `Default`; its frame settings carry one active palette for the whole
   * scene, textures and sprites alike.
   *
   * The first version of the sprite path preferred `DAYTIME.COL` on the strength of a
   * screenshot that showed a *cyan* skeleton, which was really the `.CFA` lookup table
   * going unused (see `src/arena/cfa.js`). With the table applied, `PAL.COL` is bone:
   * `SKELE1.CFA`'s body comes out `rgb(139,127,127)` with its shading in greys, where
   * `DAYTIME.COL` paints it `rgb(90,154,189)` — blue — and `DREARY.COL` is the same
   * palette dimmed toward night. `?sprites=dreary` still selects that, and any of the
   * four may be asked for, but the default is the install's own default.
   *
   * @returns {string}
   */
  function spritePaletteName() {
    const asked = (params.get('sprites') ?? '').toUpperCase();
    return ['DAYTIME.COL', 'DREARY.COL', 'PAL.COL', 'CHARSHT.COL'].includes(`${asked}.COL`)
      ? `${asked}.COL`
      : 'PAL.COL';
  }

  /** The player's own state, saved after it changes so a reload keeps it. */
  function savePlayer() {
    if (player?.created || player?.classId) saveCharacter(player);
  }

  /** The feet position of the player, in world units. */
  const feetOf = () => Array.from(current.motor.pos);

  /** The level cell under a world point. */
  /**
   * Every standable, undecorated cell of a level, for the furnisher's candidates.
   * The same test the spawn and the walk use (`cell.solid`, `cell.floor.chasm`), read
   * row-major so the room's own shape, not an iteration order, drives the placement.
   * @param {object} level
   * @returns {{row: number, col: number}[]}
   */
  function openFloorCells(level) {
    const cells = [];
    for (let row = 0; row < level.depth; row++) {
      for (let col = 0; col < level.width; col++) {
        const cell = level.cells[row * level.width + col];
        if (!cell || cell.solid || cell.floor?.chasm) continue;
        cells.push({ row, col });
      }
    }
    return cells;
  }

  /** Wall-huggers need walls: the same solidity, asked from outside the loop. */
  function solidCellAt(level, row, col) {
    if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return true;
    const cell = level.cells[row * level.width + col];
    return !cell || cell.solid;
  }

  function cellAtWorld(x, z) {
    const level = current.level;
    const row = Math.round(x / CELL_SIZE - 0.5);
    const col = Math.round(z / CELL_SIZE - 0.5);
    if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return null;
    return level.cells[row * level.width + col] ?? null;
  }

  /** Can something stand here? The same test the player's spawn uses. */
  function walkableWorld(x, z) {
    const cell = cellAtWorld(x, z);
    return Boolean(cell) && !cell.solid && !cell.floor?.chasm;
  }

  /**
   * **Can these two points see each other?** A ray at eye height through the level's own
   * collider, and nothing fancy: the geometry is the same watertight triangle soup the player
   * walks into, so a wall between two bodies is a hit on that ray.
   *
   * This is what stops a monster striking through a wall (the reported "enemies hit you behind
   * walls"). Distance alone was never enough: two bodies a metre apart with a dungeon's wall
   * between them are a metre apart *and* blind.
   *
   * A **shut door blocks sight, and an open one does not** — `leafSpots` are their own collider
   * buckets and opening one takes exactly its own triangles out of the world, so the door's own
   * state is what the ray sees. That is the difference between a monster waiting outside a
   * closed door and one swinging at the player through it.
   *
   * The ray stops `SIGHT_MARGIN` short of the target so the *target's own* volume cannot count
   * as an obstruction, and short of the eye by the same rule.
   *
   * @param {number} fromX @param {number} fromY @param {number} fromZ
   * @param {number} toX @param {number} toY @param {number} toZ
   * @returns {boolean}
   */
  function sightClear(fromX, fromY, fromZ, toX, toY, toZ) {
    const raycast = current?.collider?.raycast;
    if (typeof raycast !== 'function') return true;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dz = toZ - fromZ;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= SIGHT_MARGIN * 2) return true;
    const far = distance - SIGHT_MARGIN;
    const hit = raycast.call(current.collider,
      [fromX, fromY, fromZ],
      [dx / distance, dy / distance, dz / distance],
      far);
    return !Number.isFinite(hit);
  }

  /** Can a *cell* be stood on? Used by the cell-addressed placements (`?at=`). */
  function walkableCell(row, col) {
    const level = current.level;
    if (!level || row < 0 || col < 0 || row >= level.depth || col >= level.width) return false;
    const cell = level.cells[row * level.width + col];
    return Boolean(cell) && !cell.solid && !cell.floor?.chasm;
  }

  /**
   * Stand the player on a cell of the level that is loaded.
   *
   * `current.spawn` moves with them, so everything that reads "where the player arrived"
   * — the arrival pose, the town's placement of its people, a screenshot's vantage —
   * agrees with where they actually are. A cell that cannot be stood on is refused rather
   * than granted, and the refusal is reported: a URL that names a wall must not put the
   * player inside it.
   *
   * @param {number} row
   * @param {number} col
   * @returns {{row: number, col: number}|null}
   */
  function standAt(row, col) {
    if (!walkableCell(row, col)) return null;
    current.motor.spawn((row + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (col + 0.5) * CELL_SIZE);
    current.spawn = { x: row + 0.5, y: current.level.floorY, z: col + 0.5 };
    return { row, col };
  }

  /**
   * Stand on the named cell, or on the nearest ground to it.
   *
   * `?wild=row,col` names a cell of the *country*, and the country is not all walkable: a
   * block with a farmhouse, a crypt or a stand of trees has solid cells in it, and a page
   * that asked for one landed the player on the level's own centre instead — a hundred cells
   * from where they were told they would be. A spiral out from the named cell finds the
   * closest ground; the radius is small enough that the arrival is still "there".
   *
   * @param {number} row @param {number} col
   * @param {number} [radius]
   * @returns {{row: number, col: number}|null}
   */
  function standNear(row, col, radius = 10) {
    const direct = standAt(row, col);
    if (direct) return direct;
    for (let r = 1; r <= radius; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
          const hit = standAt(row + dr, col + dc);
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  /**
   * The shop door the player is standing in, if any.
   *
   * The nearest door within `DOOR_REACH` of the player's feet — measured to the cell's
   * centre, the way the objective's own "am I there yet" is measured.
   *
   * @returns {{door: object, distance: number}|null}
   */
  function doorNear(reach = DOOR_REACH) {
    const doors = current?.doors ?? [];
    // The motor's own position rather than `feetOf()`: the HUD this answers is written
    // *during* the first `loadLevel`, and `feetOf` is a `const` further down the file — so
    // reaching for it here was a temporal dead zone `ReferenceError` and a blank page on
    // the first frame, the same shape of mistake as the `townsfolk` one (see PROGRESS).
    const pos = current?.motor?.pos;
    if (!doors.length || !pos) return null;
    let best = null;
    for (const door of doors) {
      const distance = Math.hypot(pos[0] - (door.row + 0.5) * CELL_SIZE, pos[2] - (door.col + 0.5) * CELL_SIZE);
      if (distance > reach) continue;
      if (!best || distance < best.distance) best = { door, distance };
    }
    return best;
  }

  /**
   * The **door leaf** the player is standing at, if any (`game/doors.js`).
   *
   * A leaf is a `0xB` door: the thing in a dungeon doorway. Measured from the player's own
   * feet to the cell's centre, like every other "am I there yet" in the scene.
   *
   * @returns {object|null}
   */
  function leafNear() {
    const list = current?.leaves ?? [];
    const pos = current?.motor?.pos;
    if (!list.length || !pos) return null;
    let best = null;
    for (const leaf of list) {
      const distance = Math.hypot(pos[0] - (leaf.row + 0.5) * CELL_SIZE, pos[2] - (leaf.col + 0.5) * CELL_SIZE);
      if (distance > DOOR_REACH) continue;
      if (!best || distance < best.distance) {
        leaf.distance = distance;
        best = leaf; // Interaction must mutate the live leaf, not a spread-copy.
      }
    }
    return best;
  }

  /**
   * The thing on the ground the player is standing on, if any.
   *
   * Same reach as a door, measured the same way; a *taken* spot is not offered again.
   *
   * @returns {object|null}
   */
  function lootNear() {
    const list = current?.loot ?? [];
    const pos = current?.motor?.pos;
    if (!list.length || !pos) return null;
    let best = null;
    for (const spot of list) {
      if (spot.taken) continue;
      const distance = Math.hypot(pos[0] - (spot.row + 0.5) * CELL_SIZE, pos[2] - (spot.col + 0.5) * CELL_SIZE);
      if (distance > DOOR_REACH) continue;
      if (!best || distance < best.distance) {
        spot.distance = distance;
        best = spot; // Taken state and the draw batch belong to this exact record.
      }
    }
    return best;
  }

  /**
   * Open (or shut) the door in front of the player.
   *
   * The three ways through a locked one, in the order a player would try them:
   *
   *   * **a key they are carrying** whose lock level covers the door's (`game/doors.js`'s
   *     `keyOpens`) — the keys a level places for its sealed doors, and any the player has
   *     picked up;
   *   * **the mithril key**, if the main quest has given it: the palace's own key, which
   *     turns any sealed lock, is the one item in the game that is *about* locks;
   *   * **a shove**, for the ordinary locks (level 10 and below): `forceChance` puts a
   *     strength's odds on it, and a failure costs nothing but a moment.
   *
   * A sealed lock (`> HAND_FORCE_MAX`) with no key stays shut and says so — it is the
   * original's own way of gating a room, and the reason a key has to be findable.
   *
   * @param {object} leaf
   * @returns {boolean}
   */
  function useLeaf(leaf) {
    const collider = current?.collider;
    if (leaf.open > 0.01) {
      leaf.target = 0;
      if (collider) collider.addMesh(leaf.id, leaf.collider.positions, leaf.collider.indices, identity());
      rememberDoor(leaf);
      showNotice('The door swings shut.', 1200);
      return true;
    }
    let used = null;
    if (leaf.locked) {
      const key = keyOpens(player.keys, leaf.lockLevel);
      if (key) used = 'key';
      else if (quest.mithrilKey && leaf.lockLevel > HAND_FORCE_MAX) {
        used = 'key';
        showNotice('The mithril key turns, and the seal gives.', 2000);
      } else if (leaf.lockLevel <= HAND_FORCE_MAX) {
        forceRolls++;
        const roll = new ArenaRandom(((leaf.row * 4099 + leaf.col) * 131 + forceRolls) >>> 0).nextBelow(1000) / 1000;
        if (roll < forceChance(attributeOf(player, 'strength', 0, 50), leaf.lockLevel)) used = 'forced';
        else { showNotice(FORCE_FAILED, 1600); dbg.lastDoor = { row: leaf.row, col: leaf.col, result: 'held', lockLevel: leaf.lockLevel }; return false; }
      } else {
        showNotice(NEEDS_KEY, 1800);
        dbg.lastDoor = { row: leaf.row, col: leaf.col, result: 'sealed', lockLevel: leaf.lockLevel };
        return false;
      }
      leaf.locked = false;
    }
    leaf.target = 1;
    // The collider goes now, not at the end of the swing: a door that is opening is a door
    // the player may walk through.
    if (collider && leaf.collider.indices.length) collider.removeBucket(leaf.id);
    rememberDoor(leaf);
    const reason = openReason(used);
    if (reason && used !== 'key') showNotice(reason, 1600);
    dbg.lastDoor = { row: leaf.row, col: leaf.col, result: used ?? 'opened', lockLevel: leaf.lockLevel, kind: leaf.kind };
    updateObjectiveHud();
    return true;
  }

  /**
   * Take what is lying on the ground.
   *
   * A key becomes a key the player carries (and can open a sealed door with); equipment
   * becomes the weapon in their hands — the map kept a weapon there, and the sheet in
   * `weaponView.js` loads for it — and everything else is **gold**, drawn inside the range
   * `game/dungeonItems.js` states as reconstructed.
   *
   * @param {object} spot
   * @returns {boolean}
   */
  function takeLoot(spot) {
    if (spot.taken) return false;
    let gold = 0;
    const find = lootFind(spot);
    if (spot.kind === 'key') {
      player.keys = [...(player.keys ?? []), { lock: spot.lock ?? 0, label: `a key for a lock of level ${spot.lock ?? 0}` }];
    } else if (spot.kind === 'equipment') {
      gold = goldFor(spot.kind, () => 0);
    } else {
      goldDraw++;
      const random = new ArenaRandom((spot.row * 7919 + spot.col * 104729 + goldDraw) >>> 0);
      gold = goldFor(spot.kind, () => random.nextBelow(1000) / 1000);
      player.gold = (player.gold ?? 0) + gold;
      // …and whatever else it held, which is what actually fills a pack in a dungeon: a chest
      // with a potion in it, a corpse with a scroll on it (`lootFind`).
      if (find) setBag(addToBag(bagOf(), find, 1));
    }
    spot.taken = true;
    markLootTaken(`${mapName}#${current.index}`, `${spot.row},${spot.col}`, radiant.day ?? 0);
    spot.batchRecord?.sync();
    updateObjectiveHud();
    savePlayer();
    const item = find ? itemById(find) : null;
    dbg.lastLoot = {
      kind: spot.kind, itemIndex: spot.itemIndex, gold, row: spot.row, col: spot.col,
      find: item ? item.id : null,
    };
    showNotice(`${pickupNote(spot, gold)}${item ? ` And a ${item.name.toLowerCase()} for the pack.` : ''}`, 2600);
    if (spot.kind === 'equipment') void wieldFromLoot();
    else updateInventoryPanel();
    return true;
  }

  /**
   * What a chest, a pile, a gem or a body holds besides gold — **AUTHORED**, and deterministic.
   *
   * Arena's own loot tables are in `A.EXE` (S14), so *which* potion a chest holds is this
   * project's draw; what is the install's is that a chest holds something at all. The draw is
   * taken from the **cell** rather than from the clock, which is what makes it the same potion
   * every time that chest is opened — and, because the cell is marked taken in the ledger
   * (`game/save.js`'s `markLootTaken`), a potion that can only ever be taken once.
   *
   * @param {object} spot  a loot spot the level's own flats placed
   * @returns {string|null} an item id from `game/items.js`, or null when there is only gold
   */
  function lootFind(spot) {
    if (!['chest', 'treasure', 'body', 'gem'].includes(spot.kind)) return null;
    const roll = new ArenaRandom(((spot.row * 4099 + spot.col * 131 + (spot.itemIndex ?? 0) * 17) >>> 0)).nextBelow(100);
    const potions = itemsOfKind('potion');
    const scrolls = itemsOfKind('scroll');
    if (spot.kind === 'chest') {
      if (roll < 40 && potions.length) return potions[roll % potions.length].id;
      if (roll < 70 && scrolls.length) return scrolls[roll % scrolls.length].id;
      return null;
    }
    if (spot.kind === 'treasure') return roll < 35 && potions.length ? potions[roll % potions.length].id : null;
    if (spot.kind === 'body') return roll < 30 && potions.length ? potions[roll % potions.length].id : null;
    return roll < 60 && scrolls.length ? scrolls[roll % scrolls.length].id : null;
  }

  /**
   * The weapon an `EQUIPMEN` flat leaves behind: the next one up Arena's own weapon table.
   *
   * The item numbers are indices into a table in `A.EXE` this data set does not ship (S14),
   * so what the flat *is* cannot be read off; what can be read off is the level's own
   * danger (`game/encounters.js`), and the weapon it hands over is drawn from UESP's table
   * around that. The sheet changes with it — `loadWeaponArt` reloads for the new family.
   */
  async function wieldFromLoot() {
    const index = Math.min(WEAPONS.length - 1, 1 + (current?.index ?? 0) + Math.floor((dbg.frame ?? 0) % 3));
    const weapon = WEAPONS[index];
    // The blade goes **in the pack as well as in the hand**: a weapon the player has found is
    // theirs to keep, to sell and to swap back out again (`game/items.js`'s law — equipping
    // never destroys anything).
    player = { ...player, weapon: weapon.id, bag: addToBag(bagOf(), weapon.id, 1) };
    weaponRig.reset(player.weapon);
    await loadWeaponArt();
    savePlayer();
    updateCombatHud();
    updateInventoryPanel();
    showNotice(`${weapon.name} — taken up.`, 2600);
  }

  /**
   * Walk in: one page load of the building behind the door.
   *
   * The page the player is leaving is carried along as `back`, with `at` already set to
   * the street cell they are standing on, so leaving the building is a return to the same
   * street rather than to the city gate. Everything a city is — its kind, its seed, its
   * blocks — is in that same query string, and the city is deterministic, so the street
   * they come back to is the street they left.
   *
   * @param {object} door  a record from `current.doors`
   */
  function enterDoor(door) {
    // ── the shutters ────────────────────────────────────────────────────────────
    //
    // A trade keeps its own hours (`game/livingWorld.js`'s `SHOP_HOURS`: the smith 08:00–18:00,
    // the tavern 10:00–02:00, the guild 09:00–17:00, the temple 06:00–20:00) and this is where
    // that rule is real to a player: the door is *shut*, and says so, rather than opening a
    // shop that is bright and busy at three in the morning. A house and a noble house are not
    // trades and are never refused here (`keepsHours`), because a home is not a shop that has
    // closed.
    const kind = door.kind ?? shopForInteriorFile(door.file)?.kind ?? null;
    if (keepsHours(kind)) {
      const clock = clockNow();
      if (!isOpen(kind, clock)) {
        const what = SERVICE_KINDS[kind]?.name ?? 'the shop';
        showNotice(`The door is barred — ${what} is shut. It is ${clockWord(clock)}, and its hours have gone by. Come back in the morning.`, 3800);
        dbg.shutDoor = { file: door.file, kind, minutes: clock.minutes, phase: clock.phase, hour: clock.hour };
        return { file: door.file, kind, shut: true, minutes: clock.minutes };
      }
    }
    const back = new URLSearchParams(params);   // the city, as it is right now
    back.delete('interior');
    back.delete('enter');
    back.delete('back');
    back.delete('level');
    back.set('at', `${door.row},${door.col}`);
    const next = new URLSearchParams();
    next.set('interior', door.file);
    next.set('enter', `${door.row},${door.col}`);
    next.set('back', `?${back.toString()}`);
    // The dev door's own `?arena=` is written into the URL so it stays reloadable; a chosen
    // folder is *not* a URL and travels through `goInPlace` instead.
    const folder = source?.arenaPath ?? params.get('arena') ?? null;
    if (folder) next.set('arena', folder);
    dbg.entering = { file: door.file, kind: door.kind, row: door.row, col: door.col };
    void goInPlace(next);
    return { file: door.file, kind: door.kind, back: `?${back.toString()}` };
  }

  /** Standing on the street cell the player came in by: leave the building. */
  function leaveDoor() {
    if (!backHref) return null;
    dbg.leaving = true;
    void goInPlace(new URLSearchParams(backHref.replace(/^\?/, '')));
    return { to: backHref };
  }

  /**
   * The wall voxel that means "the way out" in the pieces' own `.INF`.
   *
   * `RD1.INF` — the `.INF` every `RANDOM1.MIF` piece names — declares its own stair art the
   * same way every other `.INF` does: `*LEVELUP` binds one of its voxel textures (`index`
   * 28, `STAIRUP.IMG`). A wall voxel is the two-byte form `most === least`, where the
   * texture index is `most − 1` (`mifLevel.js`), so the voxel to write is `(i+1)<<8 | (i+1)`:
   * `0x1D1D` for this install. Nothing is invented — the art is the level's own, and the
   * same doorway the install's own dungeons use for their stairs.
   *
   * @returns {Promise<number>} 0 when this install has no such art, and no exit is stamped
   */
  async function generatedExitVoxel() {
    try {
      const blocksInf = await data.inf(DUNGEON_BLOCKS_INF);
      const index = blocksInf?.levelUpIndex;
      if (!Number.isInteger(index) || index < 0 || index > 0x7e) return 0;
      const code = index + 1;
      return ((code << 8) | code) & 0xffff;
    } catch {
      return 0;
    }
  }

  /**
   * The **stairway** the player is standing at, if any.
   *
   * A stair is a `0xB`-less wall whose texture is the level's own `*LEVELUP`/`*LEVELDOWN` art
   * (`mifLevel.js`'s `stairKindOf`), so this reads the cells around the player's own cell —
   * a stair is solid, which is why they can never be standing *in* one — and answers with the
   * nearest inside `DOOR_REACH`, the same reach every other "am I there yet" in the scene
   * uses.
   *
   * @param {number} [reach]
   * @returns {{cell: object, row: number, col: number, distance: number}|null}
   */
  function stairNear(reach = DOOR_REACH) {
    const level = current?.level;
    const pos = current?.motor?.pos;
    if (!level || !pos) return null;
    const row0 = Math.floor(pos[0] / CELL_SIZE);
    const col0 = Math.floor(pos[2] / CELL_SIZE);
    let best = null;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const row = row0 + dr;
        const col = col0 + dc;
        if (row < 0 || col < 0 || row >= level.depth || col >= level.width) continue;
        const cell = level.cells[row * level.width + col];
        if (!cell?.stair) continue;
        const distance = Math.hypot(pos[0] - (row + 0.5) * CELL_SIZE, pos[2] - (col + 0.5) * CELL_SIZE);
        if (distance > reach) continue;
        if (!best || distance < best.distance) best = { cell, row, col, distance };
      }
    }
    return best;
  }

  /**
   * The line the fight panel carries while the player is standing at a stairway.
   *
   * An empty string when there is none, so the panel can ask it every time it is written.
   *
   * @returns {string}
   */
  function stairHint() {
    const found = stairNear();
    if (!found) return '';
    const up = found.cell.stair === 'up';
    const next = current.index + (up ? -1 : 1);
    if (next >= 0 && next < levelCount) {
      return `${up ? 'Stairs up' : 'Stairs down'} — E takes them to level ${next + 1} of ${levelCount}.`;
    }
    if (up) return 'The way out — E leaves this place.';
    return 'The stairs run down into rubble; nothing lies below.';
  }

  /**
   * Take the stairway in front of the player.
   *
   * **The direction law is the data's.** A file's levels are stored top-down and its
   * `startingLevelIndex` is the ground floor (`NOBLE1.MIF` starts on its third level), so an
   * **up** stair leads to the level with the *lower* index and a **down** one to the higher —
   * measured on `39300577.MIF` (the Halls of Colossus): level 0 carries seven `STAIRDWN`
   * cells at exactly the cells level 1 carries seven `STAIRUP` ones.
   *
   * With no level to go to, an **up** stair is the way *out* — which is what the install's own
   * data says it is: `START.MIF`'s single stair is `GATE.IMG`, the Imperial Dungeons' exit to
   * the world, and a city `.INF`'s `*LEVELUP` art is its gate. A down stair on the bottom
   * level is rubble, and says so.
   *
   * @param {{cell: object, row: number, col: number}} found
   * @returns {Promise<{to: 'level'|'outside'|'none', index: number, cell: object|null}>}
   */
  async function useStair(found) {
    const up = found.cell.stair === 'up';
    const next = current.index + (up ? -1 : 1);
    if (next >= 0 && next < levelCount) {
      // **Which way the player was going**, taken before the level changes under them: a
      // stairway climbs *through* the wall it is drawn on, so the far side is the cell on
      // the other side of it, along the line they walked. Keeping the walk going means
      // "hold W and go up a floor" works, instead of arriving on the near side where the
      // same held key walks them straight back into the stair — measured: with the near-side
      // arrival, holding `W` for three seconds went up at 5.6s and back down at 7.2s.
      const pos = current.motor.pos;
      const stepRow = Math.abs(pos[0] - (found.row + 0.5) * CELL_SIZE) > Math.abs(pos[2] - (found.col + 0.5) * CELL_SIZE)
        ? Math.sign(pos[0] - (found.row + 0.5) * CELL_SIZE) : 0;
      const stepCol = stepRow ? 0 : Math.sign(pos[2] - (found.col + 0.5) * CELL_SIZE);
      await descend(up ? -1 : 1);
      // **Arrive beyond it, not in it.** The cell is the same cell in the level above or
      // below — that is how the two ends of one stairway are addressed — and it is a wall in
      // both, so the player arrives at ground on the far side when there is any, and at the
      // nearest ground to the stair when there is not. `stairCooldown` is the second half of
      // the same rule: the arrival must not be read as a walk-into while they clear it.
      const beyond = stepRow || stepCol
        ? standAt(found.row + stepRow, found.col + stepCol)
        : null;
      const landed = beyond ?? standNear(found.row, found.col, 8);
      stairCooldown = STAIR_COOLDOWN;
      if (landed) cam.yaw = Math.atan2((landed.row + 0.5) * CELL_SIZE - (found.row + 0.5) * CELL_SIZE,
        (landed.col + 0.5) * CELL_SIZE - (found.col + 0.5) * CELL_SIZE);
      showNotice(`${up ? 'You climb the stairs up' : 'You take the stairs down'} — ${mapName} level ${current.index + 1} of ${levelCount}.`, 3000);
      dbg.stair = { used: up ? 'up' : 'down', level: current.index, cell: landed };
      // Every stair taken this page, in order, with the second it happened: a stairway is a
      // two-way cell pair, so "did the player come up and go straight back down" is a
      // question a test has to be able to ask without guessing from the last two states.
      (dbg.stairHistory ??= []).push({ used: up ? 'up' : 'down', from: current.index + (up ? 1 : -1), to: current.index, at: Number(dbg.seconds.toFixed(2)) });
      return { to: 'level', index: current.index, cell: landed };
    }
    if (up) {
      const left = leaveThePlace();
      dbg.stair = { used: 'up', level: current.index, to: 'outside' };
      return { to: 'outside', index: current.index, cell: null, left };
    }
    showNotice('The stair runs down into rubble — there is no way further down from here.', 2600);
    return { to: 'none', index: current.index, cell: null };
  }

  /**
   * Leave the place the player is in: the street, or the dungeon.
   *
   * Inside a building the way out is the street cell of its own doorway — the rule
   * `interact()` already uses for `E` in the doorway, and the same one the install's own
   * `GATE`/`*LEVELUP` art means. Out in the country or in a dungeon there is no back door to
   * walk through: the world map is the surface, so leaving opens it, with the notice saying
   * so (the map is an overlay over the running game, so nothing is lost by it).
   *
   * @returns {{to: 'street'|'map', href?: string}} what happened
   */
  function leaveThePlace() {
    if (backHref) {
      const left = leaveDoor();
      return left ? { to: 'street', href: left.to } : { to: 'street' };
    }
    showNotice('You step back out under the sky.', 3000);
    void openWorldMap();
    return { to: 'map' };
  }

  /**
   * The **gate** the player is standing in, if any — the way out of a city and the way
   * into one.
   *
   * **A settlement's gate is the opening in its wall, and the wall is its outermost
   * line.** Every shipped skeleton is built the same way: the wall stands on row 0,
   * row `depth−1`, col 0 and col `width−1` — one cell thick — and everywhere else
   * inside it is street. Exactly one opening is cut in that line, two cells wide, and
   * it holds the game's own gateway art: a `0x9` **transparent** voxel (the gate
   * leaves, drawn as `PGATE.IMG`), with walkable ground immediately behind it. Measured
   * on all the shipped skeletons — `CITY1`'s gate is row 0 cols 18–19, `TOWN1`'s is
   * col 0 rows 26–27, `VILLAGE1`'s is row 86 cols 79–80, `CITYW2`'s is col 127 rows
   * 8–9 — and *no* skeleton has a two-cell-wide hole straight through its wall.
   *
   * The first version of this read the wall as a **two-cell ring** and called any
   * walkable cell in it a gate, which is a different rule entirely: the ring's inner
   * cell is the street, so in `TOWN1` (whose row 1 is open along its whole length) the
   * player standing anywhere near the north wall could press `E` and be thrown out of
   * the city through solid masonry. That is the "walks backwards through the wall"
   * report; the gate test below is the wall's own opening and nothing else.
   *
   * The player does not have to be standing *in* the opening: in the city the gate is a
   * `0x9` voxel (solid, and painted with the gateway), so the player stands on the street
   * cell behind it; in the wilderness the same cell has been revised to air
   * (`reviseCityQuarter`) and they stand in it or just outside. One test covers both —
   * *this cell or a neighbour of it is an opening in the settlement's outermost line* —
   * and it is why a city and its own country agree about where the gate is.
   *
   * @returns {{row: number, col: number, to: 'wilderness'|'city', axis: 'north'|'south'|'east'|'west'}|null}
   */
  function gateAtPlayer() {
    const level = current?.level;
    const motor = current?.motor;
    if (!level || !motor) return null;
    // Only a settlement has gates: a dungeon's fences and a building's walls are not.
    // `current.city` rather than a `loadLevel` local: this runs from the HUD, which is
    // written *during* a load — the same reason `doorNear` reads `current.doors`.
    if (!current.city && !wildRequest) return null;
    const row = Math.round(motor.pos[0] / CELL_SIZE - 0.5);
    const col = Math.round(motor.pos[2] / CELL_SIZE - 0.5);
    for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const gate = gateCellAt(row + dr, col + dc);
      if (gate) return gate;
    }
    return null;
  }

  /**
   * The settlement's own coordinates of a cell of the level now standing.
   *
   * A city page *is* the settlement, so its cells are already its own; a wilderness page
   * holds the settlement at `CITY_ORIGIN`, slid by the window's origin as the player
   * wanders. Both are the same 128-cell grid (see `game/wilderness.js`).
   *
   * @param {number} row @param {number} col  level coordinates
   * @returns {{row: number, col: number}}
   */
  function settlementCell(row, col) {
    const origin = current?.wild ?? null;
    return origin
      ? { row: row + origin.originRow - CITY_ORIGIN, col: col + origin.originCol - CITY_ORIGIN }
      : { row, col };
  }

  /**
   * Is this level cell the settlement's gate?
   *
   * On the settlement's outermost line, open (air, or the `0x9` gateway voxel itself),
   * and with walkable ground on the settlement's inside immediately behind it.
   *
   * @param {number} row @param {number} col  level coordinates
   * @returns {{row: number, col: number, to: 'wilderness'|'city', axis: 'north'|'south'|'east'|'west'}|null}
   */
  function gateCellAt(row, col) {
    const level = current?.level;
    if (!level || row < 0 || col < 0 || row >= level.depth || col >= level.width) return null;
    const cell = level.cells[row * level.width + col];
    if (!cell || cell.floor?.chasm) return null;
    if (cell.solid && cell.kind !== 'transparent') return null;      // the wall itself
    const settlement = settlementCell(row, col);
    const { row: lr, col: lc } = settlement;
    if (lr < 0 || lc < 0 || lr >= mif.height || lc >= mif.width) return null;
    const onLine = lr === 0 || lc === 0 || lr === mif.height - 1 || lc === mif.width - 1;
    if (!onLine) return null;
    // Which way is inward: the player walks out of the city through this cell and into
    // the country, so the ground *behind* it (the city's side) has to be there.
    const inward = lr === 0 ? [1, 0] : lr === mif.height - 1 ? [-1, 0] : lc === 0 ? [0, 1] : [0, -1];
    const inner = { row: row + inward[0], col: col + inward[1] };
    if (inner.row < 0 || inner.col < 0 || inner.row >= level.depth || inner.col >= level.width) return null;
    const behind = level.cells[inner.row * level.width + inner.col];
    if (!behind || behind.solid || behind.floor?.chasm) return null;   // a second wall: not a gate
    return {
      row: lr, col: lc,
      to: wildRequest ? 'city' : 'wilderness',
      axis: ringAxis(lr, lc, mif.height, mif.width),
    };
  }

  /**
   * Which sides of the settlement's wall have a gate in them.
   *
   * The same test `gateCellAt` makes for one cell, walked around the settlement's
   * outermost line. Only used for the HUD's hint.
   *
   * @returns {string[]} e.g. `['north', 'east']`
   */
  function cityGateSides() {
    const level = current?.level;
    if (!level) return [];
    /** @type {Set<string>} */
    const sides = new Set();
    const local = (lr, lc) => {
      const origin = current?.wild ?? null;
      return origin
        ? { row: lr - origin.originRow + CITY_ORIGIN, col: lc - origin.originCol + CITY_ORIGIN }
        : { row: lr, col: lc };
    };
    for (const [lr, lc] of settlementWallCells()) {
      const { row, col } = local(lr, lc);
      const gate = gateCellAt(row, col);
      if (gate) sides.add(gate.axis);
    }
    return [...sides];
  }

  /**
   * Every cell of the settlement's outermost line, in the settlement's own coordinates.
   * @returns {[number, number][]}
   */
  function settlementWallCells() {
    /** @type {[number, number][]} */
    const out = [];
    for (let col = 0; col < mif.width; col++) { out.push([0, col]); out.push([mif.height - 1, col]); }
    for (let row = 1; row < mif.height - 1; row++) { out.push([row, 0]); out.push([row, mif.width - 1]); }
    return out;
  }

  /**
   * Which side of a settlement a ring cell belongs to, corners included.
   * @param {number} row @param {number} col @param {number} depth @param {number} width
   * @returns {'north'|'south'|'east'|'west'}
   */
  function ringAxis(row, col, depth, width) {
    if (row === 0) return 'north';
    if (row === depth - 1) return 'south';
    if (col === 0) return 'west';
    return 'east';
  }

  /**
   * Go somewhere else **in this page**.
   *
   * Every transition in the game — a shop door, a city gate, fast travel, the world map's
   * markers — is a scene swap, not a navigation, and this is the one that does it. The
   * reason is the player's own Arena folder: a picked folder lives in this page's memory
   * (`arena/browserSource.js` — a `<input webkitdirectory>` gives a flat `FileList`, which
   * no page load can reopen), so `location.href = '?interior=EQUIP1.MIF'` asked the player
   * to choose their game folder **again** on the way into every shop, and again on the way
   * out. The dev/test door hides it (`?arena=` is in the URL and travels along), which is
   * why the browser suite never saw it.
   *
   * `bootInterior` disposes the scene that is standing (its frame loop and its listeners)
   * and builds the new one with the *same* source — the folder, its decoded archives, the
   * character, the quest and the job board (all in `localStorage`). The URL is rewritten
   * with `replaceState` so a reload lands on the place the player is actually in, and the
   * back/forward stack does not grow a page per doorway.
   *
   * @param {URLSearchParams} next  the URL a page load would have taken
   * @returns {Promise<object>} the new scene
   */
  async function goInPlace(next) {
    // **One transition at a time.** This scene is *replaced in place*, and the thing that
    // replaces it is built asynchronously — so for a moment two `goInPlace` calls can be
    // in flight against the same page, each rewriting the URL and each booting a scene.
    // The winner of that race is whichever `bootInterior` finishes last, so the player
    // lands somewhere neither call asked for: the reported "walking out of a shop drops
    // you somewhere else in the city". The latch makes the first call the only one; the
    // scene it boots has its own, so travelling on from there is normal.
    if (life.leaving) return window.__arenaScene;
    life.leaving = true;
    try {
      history.replaceState(history.state ?? null, '', `${location.pathname}?${next.toString()}${location.hash ?? ''}`);
    } catch { /* a page that cannot rewrite its URL still travels */ }
    let scene;
    try {
      scene = await bootInterior(canvas, renderer, next, status, source);
    } catch (err) {
      life.leaving = false;   // a failed swap leaves this scene standing, and it can retry
      throw err;
    }
    document.getElementById('boot')?.classList.add('hidden');
    window.__ready = true;
    return scene;
  }

  /**
   * Cross the gate: the wilderness page, or the city page, at a cell that is through
   * the wall rather than in it.
   *
   * The arrival is stepped a few cells along the gate's own axis — outward when leaving
   * a city, inward when entering one — because a player who arrives standing *in* the
   * doorway would cross straight back on the next `E`, and because the window follows
   * them: standing outside the north wall, the window has slid one block north and the
   * whole wall is visible behind them.
   * * @param {{row: number, col: number, to: 'wilderness'|'city', axis: 'north'|'south'|'east'|'west'}} gate
 * @param {boolean} outward  step away from the city rather than into it
 * @returns {{to: string, row: number, col: number}|null}
 */
  function crossGate(gate, outward) {
    const step = outward ? GATE_STEP : -GATE_STEP;
    const target = { row: gate.row, col: gate.col };
    if (gate.axis === 'north') target.row -= step;
    else if (gate.axis === 'south') target.row += step;
    else if (gate.axis === 'west') target.col -= step;
    else target.col += step;

    const next = new URLSearchParams(params);
    for (const key of ['at', 'interior', 'enter', 'back', 'level', 'wild', 'wildseed']) next.delete(key);
    if (gate.to === 'wilderness') {
      next.set('wild', `${target.row + CITY_ORIGIN},${target.col + CITY_ORIGIN}`);
    } else {
      next.set('at', `${target.row},${target.col}`);
    }
    // The dev/test door's `?arena=` rides along, so a URL copied out of the address bar is
    // still reloadable. A *picked* folder cannot be named in a URL at all — that is the
    // point of `goInPlace` — so `source` travels with the scene instead.
    const folder = source?.arenaPath ?? params.get('arena') ?? null;
    if (folder) next.set('arena', folder);
    dbg.gate = { to: gate.to, axis: gate.axis, from: { row: gate.row, col: gate.col }, target };
    void goInPlace(next);
    return { to: gate.to, ...target };
  }

  /**
   * Upload a creature's animation set, once per file, and build the batch that will
   * carry its instances. Returns null when this install has no such sprite — a monster
   * whose art is missing is left out of the fight rather than drawn as a black box.
   *
   * @param {string} file  e.g. `RAT1.CFA`
   * @param {number} capacity  how many of them may stand in this level at once
   */
  async function loadSpriteSet(file, capacity) {
    const known = spriteSets.get(file);
    if (known) { known.capacity = Math.max(known.capacity, capacity); return known; }
    const bytes = await data.bytes(file);
    if (!bytes) return null;
    const cfa = parseCfa(bytes, file);
    // The palette is the scene's: `PAL.COL`, the same one the walls use. The sprite's
    // own bytes are indices into the `.CFA` file's lookup table, which `parseCfa`
    // applies; see `spritePaletteName` for why this is not the daylight palette. See
    // FORMATS.md §11.
    const spritePalette = spritePaletteName();
    const palette = await data.palette(spritePalette);
    for (const frame of cfa.frames) {
      renderer.uploadTexture(CREATURE_ARCHIVE, `${file}#${frame.index}`, imageToUpload(frame.indices, frame.width, frame.height, palette));
    }
    // Arena's figures are pixel art at roughly 102 pixels to a person.
    const size = { w: cfa.width * SPRITE_SCALE, h: cfa.height * SPRITE_SCALE };
    const centers = [...Array(Math.max(1, capacity))].map(() => [0, -1000, 0]);
    const batch = renderer.createBillboardBatch(CREATURE_ARCHIVE, `${file}#0`, size, centers, { dynamic: true });
    const set = { file, cfa, size, batch, capacity: Math.max(1, capacity) };
    spriteSets.set(file, set);
    return set;
  }

  /**
   * Load the sheets a town's people answer and fall in, beyond their walk.
   *
   * The armoured roster ships a walk (and an attack); the archive's other families carry
   * **talk** and **die** sheets instead (`game/peopleKinds.js`). Each file is loaded once,
   * sized for the people who carry it, and a family whose sheet this install lacks simply
   * has none — a person then talks with their standing frame, which is what the port did
   * for everybody before this pass.
   *
   * @param {object[]} people  the placed people, each with its own `actions`
   * @returns {Promise<void>}
   */
  async function loadPeopleActions(people) {
    /** @type {Map<string, number>} */
    const wanted = new Map();
    for (const person of people ?? []) {
      for (const file of Object.values(person?.actions ?? {})) {
        if (file) wanted.set(file, (wanted.get(file) ?? 0) + 1);
      }
    }
    for (const [file, count] of wanted) {
      if (!spriteSets.has(file)) await loadSpriteSet(file, count);
    }
  }

  /**
   * Load the first-person weapon's art for whichever sheet the player's weapon swings from.
   *
   * Six of Arena's eight sheets ship in `GLOBAL.BSA`; `FLAIL.CIF` and `BOW.CIF` do not, and
   * a family with no art loads nothing and **says which file is missing** — the alternative
   * is drawing a sword for a flail, which is worse than an empty hand.
   *
   * @returns {Promise<string|null>} the `.CIF` loaded, or null when this install has none
   */
  async function loadWeaponArt() {
    weaponArt = new Map();
    weaponLoaded = null;
    weaponMissing = null;
    const file = weaponRig.file;
    const bytes = await data.bytes(file);
    if (!bytes) { weaponMissing = file; return null; }
    const cif = parseCif(bytes, file);
    // The weapon is drawn with the same palette as the walls and the figures (`PAL.COL`);
    // the sheet's bytes are indices into it, and index 0 is the cutout (`palette.js`).
    const palette = await data.palette(spritePaletteName());
    for (const index of weaponRig.indices) {
      const frame = cif.images[index];
      if (!frame) continue;
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(new ImageData(toRgba(frame.indices, palette, { width: frame.width, height: frame.height }), frame.width, frame.height), 0, 0);
      weaponArt.set(index, { canvas, xOffset: frame.xOffset, yOffset: frame.yOffset, width: frame.width, height: frame.height });
    }
    weaponLoaded = file;
    return file;
  }

  /**
   * Fill the level that has just been built with whoever lives here.
   *
   * Deterministic in the level's own seed, like every other draw in `game/`: come back
   * and the same creatures are in the same places.
   *
   * @param {object} loaded  the `current` record `loadLevel` builds
   */
  async function populate(loaded) {
    monsters = [];
    for (const set of spriteSets.values()) {
      renderer.destroyBillboardBatch(set.batch);
      for (const batch of set.frameBatches?.values() ?? []) renderer.destroyBillboardBatch(batch);
    }
    spriteSets.clear();
    playerSet = null;
    attackSet = null;
    swingAnim = 0;
    lastFeet = null;
    await ensureJobDungeons();
    // The weapon starts the level where the original starts it: put away.
    weaponRig.reset(player.weapon);
    weaponOnScreen = null;
    await loadWeaponArt();
    const inCity = Boolean(loaded.city);
    // A settlement's buildings are inhabited, not infested: the first run of this feature
    // put the dungeon's four creatures inside the shop the player had just walked into (the
    // suite's "5 billboards for 1 person" caught it), which is the same mistake as putting
    // monsters in a street — Arena's own cities are patrolled, not hunted.
    const inhabited = inCity || Boolean(entryCell);
    const danger = dangerOf({ stage: quest.step, city: inhabited });
    const seed = Math.round((loaded.city?.seed ?? 0) * 31 + loaded.index * 7919 + mif.width * 3 + mif.height * 17 + quest.step * 101);
    const arrival = loaded.spawn ? { row: loaded.spawn.x - 0.5, col: loaded.spawn.z - 0.5 } : null;
    // A city is not a battleground: it has *people* in it now (`populateTown`, below),
    // and a settlement where the first thing that happens is a spider biting a
    // shopkeeper reads as a bug. Arena's cities are patrolled by guards and fights
    // there are a crime; a dungeon keeps its four.
    // **How many, and out of whose bestiary.** The level's own `.INF` names its creatures
    // (`roster`, above — `monsterRosterFromInf`), and that roster is what the encounter
    // draws from; `monsterCountFor` scales how many stand in it with the danger and the size
    // of the level. Until this the roster was computed and never passed, every dungeon drew
    // from the danger pool (a rat, a goblin, a wolf…) and four monsters was the whole
    // population — the reported "most monsters dont spawn but skeletons and spiders".
    // **The loaded level's roster, not a local one.** This pass used to read a bare
    // `roster`, which exists only in the loader's own scope (`loadLevel`), so the first
    // time `populate` ran the page did not boot at all: `ReferenceError: roster is not
    // defined`, caught by opening a city in the browser.
    const rosterIds = (loaded.roster ?? []).map((r) => r.monster);
    const count = inhabited ? 0
      : monsterCountFor({ danger, level: loaded.level, monsters: rosterIds });
    const spawned = spawnEncounter({
      level: loaded.level, seed, danger, count, arrival,
      // **How deep this level is**, which is the other half of whose bestiary stands in it:
      // the entrance level of a place fields the weakest slice of its own `.INF` list and its
      // depths field the rest (`encounters.rosterWindow`, D-15). `loaded.index` is the level's
      // index inside this map — 0 is where the player arrives.
      depth: loaded.index ?? 0,
      minCells: inhabited ? 14 : 6, monsters: rosterIds,
    });

    // Contract targets are separate from ordinary respawning enemies, on level one.
    // Their stable IDs persist partial progress without suppressing dungeon replay.
    const active = radiant.active;
    const hunt = slayProgress(active);
    if (!inhabited && !wildRequest && loaded.index === 0 && hunt && !active.completed
      && place?.name.toLowerCase() === active.target.toLowerCase()) {
      const targets = spawnEncounter({ level: loaded.level, seed: seed ^ 0x51a7, danger,
        count: hunt.required, arrival, minCells: 6, monsters: [hunt.monster],
        exclude: new Set(spawned.map(s => `${s.place.row},${s.place.col}`)) });
      targets.forEach((spawn, i) => {
        const encounterId = hunt.ids[i];
        if (!hunt.defeated.includes(encounterId)) spawned.push({ ...spawn, bounty: { questId: active.id, encounterId } });
      });
    }

    for (const spawn of spawned) {
      spawn.world = { x: spawn.place.x * CELL_SIZE, y: spawn.place.y * CELL_SIZE, z: spawn.place.z * CELL_SIZE };
      spawn.nextAttack = spawn.monster.nextAttack;
      spawn.awake = false;
      spawn.file = spawn.monster.sprite ? `${spawn.monster.sprite}1.CFA` : null;
    }
    const usable = spawned.filter((s) => s.file);

    // One batch per creature file, sized for how many of them are here.
    const perFile = new Map();
    for (const spawn of usable) perFile.set(spawn.file, (perFile.get(spawn.file) ?? 0) + 1);
    const missing = new Set();
    for (const [file, capacity] of perFile) {
      const set = await loadSpriteSet(file, capacity);
      if (!set) missing.add(file);
      // Files 1–5 contain walk 0..5 and attack 8..11; file 6 is the death action.
      const base = file.slice(0, -5);
      for (let action = 2; action <= 6; action++) await loadSpriteSet(`${base}${action}.CFA`, capacity);
    }
    monsters = usable.filter((s) => spriteSets.has(s.file));
    if (missing.size) console.warn(`[combat] no art in this install for: ${[...missing].join(', ')}`);

    // The player's own figures, for the third-person view: the walk seen from behind, and
    // the blow. The attack action ships facing the viewer only (`01…ATT.CFA` exists for
    // every armour and `05…ATT.CFA` for none), so it is a figure of its own here rather
    // than a re-facing of the walk — see `game/playerSprite.js` and `liveBatches`.
    playerSet = await loadSpriteSet(playerSpriteFile(player, 'WLK'), 1);
    attackSet = await loadSpriteSet(playerSpriteFile(player, 'ATT', 1), 1);
    if (!playerSet && view === 'third') console.warn(`[combat] ${playerSpriteFile(player, 'WLK')} is not in this install`);
    if (!attackSet && view === 'third') console.warn(`[combat] ${playerSpriteFile(player, 'ATT', 1)} is not in this install`);
    // …and, in a settlement, the people who live in it. Their art is the same `.CFA`
    // family, so they share `spriteSets` and the billboard pass with the creatures.
    if (inCity) { await populateTown(loaded); payBoardJobHere(); }
    // A building entered through its street door has one person in it: whoever keeps it.
    else if (entryCell) await populateShop(loaded);
    else { townsfolk = []; closeTalk(); }
    updateCombatHud();
    return monsters;
  }

  /**
   * Fill a settlement with its own people.
   *
   * `game/townsfolk.js` owns the roster (the install's 65 `.CFA` people files) and the
   * placement rule; this only uploads their art and remembers them. They do not move,
   * fight or take turns: they stand on the street and can be spoken to (`T`), which is
   * what a town in Arena is for — the talking is the game's own prose out of
   * `template.dat`, and nobody is given a name, because the name generator's tables are
   * not in this data set (S30).
   *
   * @param {object} loaded  the `current` record `loadLevel` builds
   */
  async function populateTown(loaded) {
    const seed = Math.round((loaded.city?.seed ?? 0) * 17 + mif.width * 5 + mif.height * 11 + 991);
    const arrival = loaded.spawn ? { row: loaded.spawn.x - 0.5, col: loaded.spawn.z - 0.5 } : null;
    const placed = placeTownsfolk({
      level: loaded.level,
      folk,
      kinds,
      seed,
      count: folkCountFor(loaded.city?.kind ?? 'city'),
      arrival,
      minCells: 4,
    });
    // Every **angle** of every outfit the town wears, so a person can turn to face the
    // player (`viewFacing`): `01CHNWLK`…`05CHNWLK` are one person from five sides, and a
    // townsperson whose angle is frozen is the reported "npcs don't look at you". A batch
    // is built per angle, sized for every person who wears that outfit — `moveBillboardBatch`
    // clamps to the batch's own quads, so an undersized batch silently loses a person while
    // `indexCount` asks for indices the buffer does not hold (a GL error, caught by the
    // `city` suite's WebGL-misuse check).
    // ── the trades this town's own blocks name ────────────────────────────────
    //
    // A settlement's assembled blocks carry the map's own `*ITEM` records, and they name
    // people: Daggerfall's `CITYW2.MIF` places nineteen — its priests, the Mages Guild's
    // wizard, market vendors, a beggar, its harlots and a shady character
    // (`loaded.peopleSpots`, read by `game/dungeonItems.js`). `populateShop` has always read
    // them for a *building*, where the record's **cell** is the room its person belongs in;
    // on the street the record's cell is inside a block the player cannot walk into, so what
    // a town takes from its own map is the **roster** — which trades this town keeps — while
    // the cells stay the seeded placement's. That division is the one S32 and `populateShop`
    // already make, and it is what makes a night street possible at all: the trades whose own
    // day keeps them out after dark are the harlots, the shady characters and the watch, and
    // with every citizen a plain townsperson a city held not one of them — measured 2026-10-15
    // at 23:00, forty-eight people and all forty-eight of them indoors (D-01a).
    const trades = (loaded.peopleSpots ?? []).map((spot) => spot.role).filter(Boolean);
    placed.forEach((person, i) => { if (i < trades.length) person.role = trades[i]; });
    const perOutfit = new Map();
    for (const person of placed) {
      const entry = perOutfit.get(person.outfit.key) ?? { outfit: person.outfit, count: 0 };
      entry.count++;
      perOutfit.set(person.outfit.key, entry);
    }
    for (const { outfit, count } of perOutfit.values()) {
      for (const view of PEOPLE_VIEWS) await loadSpriteSet(viewFileFor(outfit, view), count);
      await loadSpriteSet(viewFileFor(outfit, 1).replace('WLK.CFA', 'ATT.CFA'), count);
    }
    // …and the sheets the archive ships beyond a walk: the **talk** a person answers in and
    // the **die** they go down in (`game/peopleKinds.js`). Loaded once per file, sized for
    // the people who carry it, and only for the families this install really has it for.
    await loadPeopleActions(placed);
    // The settlement whose people these are, for the regard ledger's key. On the street it
    // is the place the player is standing in; a person is identified by *that* and by the
    // cell they were placed on, so the same man on the same paving stone is the same man
    // every time the player comes back (`game/regard.js`'s `personId`).
    const personPlace = whereAmI()?.place ?? place?.name ?? null;
    townsfolk = placed
      .filter((person) => spriteSets.has(viewFileFor(person.outfit, 1)))
      .map((person) => {
        // The cell they were *placed* on. They walk from it, so `place` moves and this does
        // not: it is what makes their offer, their regard and their walk's own draw the
        // same on every visit to the town.
        const home = { row: person.place.row, col: person.place.col };
        return {
          ...person,
          home,
          regardId: personId(personPlace, home),
          world: { x: person.place.x * CELL_SIZE, y: person.place.y * CELL_SIZE, z: person.place.z * CELL_SIZE },
          talkTurn: 0,
          line: null,
        };
      });
    // The corpus's own names, when the sibling install's `NAMEGEN.DAT` came in: a person
    // keeps the name their face's key gives them on every visit (same law as the regard).
    nameThePeople(townsfolk, seed);
    void ensurePeopleNames().then(() => nameThePeople(townsfolk, seed));
    if (placed.length && !townsfolk.length) console.warn('[townsfolk] this install has no people art');
    return townsfolk;
  }

  /**
   * Pay a job that **the town** owes for, the moment the player walks into the town.
   *
   * A job off the world map's board has nobody behind it — it is "posted by the guild"
   * (`scenes/worldmap.js`) — so its reward is the settlement's, and the settlement pays it
   * when the player arrives rather than making them find a particular door. A job a *person*
   * asked for is deliberately not paid here: that one belongs to the one who asked, and
   * `handInJob` is where it is settled (`handInAtPlace` refuses a person's job for exactly
   * this reason).
   *
   * Kept out of the world map because the map is a *page* the player may never open again on
   * a journey that ends in a dungeon door: the arrival in the town is the moment that always
   * happens, and it is the moment the map's own marker calls "return here".
   */
  function payBoardJobHere() {
    const active = handInAtPlace(radiant, place?.name ?? null);
    if (!active) return false;
    const result = applyRadiantEvent(radiant, 'return', { where: place?.name });
    if (!result.ok) return false;
    radiant = result.state;
    saveRadiantState(radiant);
    player = { ...player, gold: Math.max(0, (player.gold ?? 0) + (result.gold ?? 0)) };
    saveCharacter(player);
    // Board work earns the same guild standing on the same event, saved with the rest.
    const guild = guildForJob(active.kind);
    const standing = earnStanding(guilds, guild.id);
    saveGuildState(guilds);
    showNotice(`The guild pays: ${result.gold ?? active.reward} gold for ${active.title}. ${guild.name} hears of it — standing ${standing}.`, 6000);
    dbg.jobPaidAtPlace = { title: active.title, where: place?.name ?? null, gold: result.gold ?? active.reward, guild: { id: guild.id, standing } };
    updateCombatHud();
    updateObjectiveHud();
    return true;
  }

  /**
   * The keeper of the shop the player has walked into.
   *
   * One person, drawn from the install's own `.CFA` roster like a town's people and placed
   * on a standable cell of the building, with the **shop's own bank** as their line source
   * (`game/shops.js`): `equip.dat` for an equipment store, `tavern.dat` for a tavern,
   * `muguild.dat` for a guild. A temple, a noble house and a house have no bank in this
   * install, so their keeper speaks the town's talk corpus instead — and `state().shops
   *.keeperBank` says which of the two a visitor is hearing, so the difference is visible
   * rather than implied.
   *
   * @param {object} loaded  the `current` record `loadLevel` builds
   */
  async function populateShop(loaded) {
    const shop = shopForInteriorFile(mapName);
    const seed = Math.round(mif.width * 13 + mif.height * 7 + 4093);
    const arrival = loaded.spawn ? { row: loaded.spawn.x - 0.5, col: loaded.spawn.z - 0.5 } : null;
    // ── the building's own people ──────────────────────────────────────────────
    //
    // A building's `.INF` names who works and who sits in it: `EQUIP.INF`'s item 15 is
    // `SMITH.DFA` (the armourer), `TAVERN.INF`'s is `BARTEND.DFA` with `MUSIC1/2` and
    // `MAN01…04`/`WOMAN01…04` (items 83…90) for the drinkers, `TEMPLE.INF`'s is
    // `PREST1.DFA` (`game/dungeonItems.js` reads the numbers). The map is where the game's
    // own placement is absent (`A.EXE`, D11), so the *people's cells* are ours while the
    // *roster* is the install's — which is the difference between the reported "shops are
    // empty of npcs" and a shop with its smith behind the counter and a tavern with
    // patrons at its tables.
    const spots = (loaded.peopleSpots ?? []).filter((spot) => {
      const cell = loaded.level.cells[spot.row * loaded.level.width + spot.col];
      return cell && !cell.solid && !cell.floor?.chasm;
    });
    const placed = spots.length
      ? placeTownsfolk({ level: loaded.level, folk, kinds, seed, count: spots.length, arrival, minCells: 0 })
      : [];
    if (placed.length && spots.length) {
      // The map's own cells win over the seeded placement: these are the rooms they were
      // drawn for (a counter, a table, a shrine).
      spots.forEach((spot, i) => {
        const person = placed[i];
        if (!person) return;
        person.place = {
          row: spot.row,
          col: spot.col,
          x: (spot.row + 0.5) * (loaded.level.cellSize ?? 1),
          y: loaded.level.floorY ?? 1,
          z: (spot.col + 0.5) * (loaded.level.cellSize ?? 1),
        };
        person.role = spot.role;
        person.spotIndex = spot.itemIndex;
      });
    }
    // ── the company the install did not name ─────────────────────────────────
    //
    // The room's own list can be nobody at all (a house) or one person (a temple's priest, a
    // guild hall's wizard), and a building the player can walk into should have somebody in it
    // — `BUILDING_FOLK` is the least each kind holds. The top-up is drawn from the building's
    // own seed, so the same family is at home in the same house every time the door is opened,
    // and it **skips a cell somebody already stands on**: two billboards in one cell is one
    // person with two heads.
    const wanted = BUILDING_FOLK[shop?.kind ?? 'house'] ?? 1;
    if (placed.length < wanted) {
      const taken = new Set(placed.map((person) => `${person.place.row},${person.place.col}`));
      const more = placeTownsfolk({
        level: loaded.level,
        folk,
        kinds,
        // A different draw from the room's own people, so a top-up cannot land on the same
        // cells as the roster it is filling in around.
        seed: seed + 907,
        count: Math.max(1, wanted - placed.length),
        arrival,
        minCells: placed.length ? 0 : 3,
      });
      for (const person of more) {
        const key = `${person.place.row},${person.place.col}`;
        if (taken.has(key)) continue;
        taken.add(key);
        // Their *trade* is their own: a worshipper in a temple and a shopper in a house are
        // townspeople, and their day is a townsperson's day. A noble house's own are nobles.
        person.role = shop?.kind === 'noble' ? 'noble' : 'townsperson';
        placed.push(person);
      }
    }
    if (!placed.length) console.warn('[shops] this install has no people art to stand behind a counter');
    // The keeper's five angles too: whoever keeps the place looks up when the player walks
    // in, instead of standing at whatever angle the roster happened to hand out.
    for (const person of placed) {
      for (const view of PEOPLE_VIEWS) await loadSpriteSet(viewFileFor(person.outfit, view), 1);
      await loadSpriteSet(viewFileFor(person.outfit, 1).replace('WLK.CFA', 'ATT.CFA'), 1);
    }
    await loadPeopleActions(placed);
    // Whoever the map says *works* here keeps the place: a `SMITH` in an equipment shop, a
    // `BARTEND` in a tavern, a `PREST` in a temple. Everyone else is a patron, and walks.
    const workerRoles = new Set(['smith', 'bartender', 'priest', 'wizard']);
    const keeperAt = placed.findIndex((person) => workerRoles.has(person.role));
    // The keeper is marked *on the person* rather than by position, so a person whose art
    // this install lacks cannot shift the mark onto somebody else.
    placed.forEach((person, index) => { person.keeper = index === keeperAt || (keeperAt < 0 && index === 0); });
    // A building is somebody's, and it stands in a town: the keeper and the patrons belong to
    // the settlement the doorway led out of (`whereAmI` reads `fromPlace` inside a shop), so
    // the smith behind the counter is the same man the next time that shop is opened.
    const shopPlace = whereAmI()?.place ?? fromPlace?.name ?? null;
    townsfolk = placed
      .filter((person) => spriteSets.has(viewFileFor(person.outfit, 1)))
      .map((person) => {
        // The cell they were placed on, kept apart from where they are standing
        // (`populateTown`'s rule, and what `offerFrom` draws their work from).
        const home = { row: person.place.row, col: person.place.col };
        return {
          ...person,
          home,
          regardId: personId(shopPlace, home),
          world: { x: person.place.x * CELL_SIZE, y: person.place.y * CELL_SIZE, z: person.place.z * CELL_SIZE },
          talkTurn: 0,
          line: null,
          shop: person.keeper ? shop?.kind ?? null : null,
          shopName: person.keeper ? shop?.name ?? null : null,
          guild: person.keeper ? guildForShop(shop?.kind) ?? null : null,
          bank: person.keeper ? shop?.bank ?? null : null,
        };
      });
    // The same law as a street's: the keeper and the patrons keep the names their
    // face keys give them, so the smith behind the counter is the same named man.
    nameThePeople(townsfolk, seed);
    void ensurePeopleNames().then(() => nameThePeople(townsfolk, seed));
    if (shop) closeTalk();
    return townsfolk;
  }

  /**
   * The person the player is standing in front of, if any.
   *
   * @param {number} [reach]
   * @returns {object|null}
   */
  function personNear(reach = TALK_REACH) {
    if (!townsfolk.length) return null;
    const feet = feetOf();
    let best = null;
    for (const person of townsfolk) {
      const distance = Math.hypot(person.world.x - feet[0], person.world.z - feet[2]);
      if (distance > reach) continue;
      if (!best || distance < best.distance) best = { person, distance };
    }
    if (!best) return null;
    return { ...best.person, distance: best.distance };
  }

  /**
   * The dungeons a person may send the player to: the ones whose `.MIF` this install has.
   *
   * Read once per session from the loose-file listing, exactly as the world map's board is
   * (`radiantQuests.discoverLooseMifs`). Until it is known, a person offers only the kinds
   * that need no dungeon; that is why this is awaited at level load rather than lazily.
   */
  async function ensureJobDungeons() {
    if (jobDungeons) return jobDungeons;
    try {
      const loose = await discoverLooseMifs(source);
      jobDungeons = world ? enterableDungeons(world, enterableFromListing(loose)) : [];
    } catch {
      jobDungeons = [];
    }
    return jobDungeons;
  }

  /**
   * The work the person in front of the player has to offer, or null.
   *
   * Cached per person (`game/radiantQuests.js`'s `personOffer` is pure, but the answer is
   * the same every time and a talk panel may be rebuilt several times in one conversation).
   *
   * @param {object|null} person
   */
  function offerFrom(person) {
    // The **giver is a settlement**, never a dungeon: on the street that is the place the
    // player is standing in, and inside a building it is the town the doorway led out of
    // (`fromPlace`). That last case is what makes a tavern keeper able to hand out the
    // town's work — the bar in a tavern is where Arena's side work is handed over, and a
    // keeper who says nothing has nothing to hand over.
    const giver = place?.kind === 'dungeon' ? null : (place ?? fromPlace);
    if (!person?.place || !world || !giver?.name) return null;
    // **Decided once, for that person.** The cache used to be keyed by the person's *cell*,
    // and the town's people now walk — so a stranger who stepped next door mid-conversation
    // was handed a *different* job than the one the panel was selling, and the accept button
    // took work nobody had offered (caught by the browser suite: the offer showed one quest
    // and the journal recorded another). A person's work is theirs, and it is drawn from the
    // cell they were placed on (`home`), which is what keeps it the same job on every visit.
    if ('offer' in person) return person.offer;
    const where = person.home ?? person.place;
    const offer = personOffer({
      world, library, giver, person: { ...person, place: where }, day: radiant.day ?? 1, dungeons: jobDungeons ?? [],
    });
    person.offer = offer;
    return offer;
  }

  /**
   * Take the job the person in front of the player is offering.
   *
   * The accept runs through the same state machine the world map's board uses
   * (`applyRadiantEvent`), so the rules are one set: one job at a time, the payload only
   * pays at its own giver, and the clock that fails a job is the calendar's (`advanceDays`).
   *
   * @returns {{ok: boolean, reason?: string, offer?: object}}
   */
  function acceptJob() {
    const person = talking?.person ?? null;
    const offer = person ? offerFrom(person) : null;
    if (!offer) {
      showNotice('Nobody here has work to give.', 2200);
      return { ok: false, reason: 'nobody here has work' };
    }
    const result = applyRadiantEvent(radiant, 'accept', { offer });
    if (!result.ok) {
      showNotice(result.reason ?? 'Not now.', 2600);
      return { ok: false, reason: result.reason, offer };
    }
    radiant = result.state;
    saveRadiantState(radiant);
    dbg.jobAccepted = { id: offer.id, title: offer.title, target: offer.target };
    showNotice(`Taken: ${offer.title}.\n\n${radiantObjective(radiant) ?? ''}`, 6000);
    updateCombatHud();
    // The level HUD carries the job from this moment, not from the next level load: the
    // player just took work in the street and should not have to walk anywhere to be told
    // where it is.
    updateObjectiveHud();
    // The panel says what was taken where the offer stood, so the player is not left
    // wondering whether the click registered.
    const block = document.getElementById('talk')?.querySelector('.job');
    if (block) {
      block.innerHTML = `<p class="offer">Taken: ${escapeHtml(offer.title)}</p>`
        + `<p class="src">${escapeHtml(radiantObjective(radiant) ?? '')}</p>`;
    }
    dbg.talk = { who: person.description, line: person.line ?? null, job: offer.title };
    return { ok: true, offer };
  }

  /**
   * Hand a finished job back to the person who asked for it.
   *
   * The reward is the state machine's own (`applyRadiantEvent` pays it exactly once, here
   * and on the world map's board alike), and the **regard** is this function's: carrying out
   * somebody's work is the strongest good turn this game can do for them (`REGARD_EVENTS.job`,
   * +25), which is what makes the person who asked worth walking back to. Two acts, one
   * click: the purse and the friendship.
   *
   * @returns {{ok: boolean, reason?: string, gold?: number}}
   */
  function handInJob() {
    const person = talking?.person ?? null;
    const active = handInWith(radiant, person?.regardId);
    if (!active) {
      showNotice('They have nothing waiting for you.', 2200);
      return { ok: false, reason: 'nothing to hand in here' };
    }
    const result = applyRadiantEvent(radiant, 'return', { where: active.giver, personId: person?.regardId });
    if (!result.ok) {
      showNotice(result.reason ?? 'Not here.', 2600);
      return { ok: false, reason: result.reason };
    }
    radiant = result.state;
    saveRadiantState(radiant);
    // Credit the live character AND its save. Updating only storage made the HUD
    // show the old purse and the next damage/inventory save erased the whole reward.
    player = { ...player, gold: Math.max(0, (player.gold ?? 0) + (result.gold ?? 0)) };
    saveCharacter(player);
    const note = notePerson(person, 'job');
    // The work earns standing with the guild whose kind of work it was — the guild ledger
    // is a save, like the regard, and the same event credits both.
    const guild = guildForJob(active.kind);
    const standing = earnStanding(guilds, guild.id);
    saveGuildState(guilds);
    dbg.jobHandedIn = { title: active.title, gold: result.gold ?? 0, regard: note?.regard ?? null, standing: note?.standing ?? null, guild: { id: guild.id, standing } };
    const warmer = note && note.delta ? ` ${note.delta > 0 ? 'They will remember it.' : ''}` : '';
    showNotice(`Paid: ${result.gold ?? active.reward} gold, from ${active.giverPerson ?? active.giver}.${warmer} ${guild.name} hears of it — standing ${standing}.\n\n${radiantObjective(radiant) ?? 'Nothing else in hand.'}`, 6000);
    updateCombatHud();
    updateObjectiveHud();
    const block = document.getElementById('talk')?.querySelector('.job');
    if (block) {
      block.innerHTML = `<p class="offer">Paid: ${escapeHtml(String(result.gold ?? active.reward))} gold.</p>`
        + `<p class="src">${escapeHtml(standingWord(note?.standing ?? 'neutral', note?.regard ?? 0))}</p>`;
    }
    return { ok: true, gold: result.gold ?? active.reward };
  }

  /**
   * `T` — speak to whoever is nearest, and answer what they say.
   *
   * The panel is the person's own words (Arena's, out of `template.dat`) and the two
   * questions this project can answer honestly (see `game/townsfolk.js`): about the
   * place, and about the country it is in. Pressing `T` again asks the *same* person
   * another question — their line walks on through the corpus rather than repeating —
   * and walking to somebody else starts a new conversation.
   *
   * @returns {{ok: boolean, who?: string, line?: string, topics?: object[], reason?: string}}
   */
  function talk() {
    const found = personNear();
    if (!found) {
      closeTalk();
      showNotice('There is nobody near enough to speak to.', 1600);
      return { ok: false, reason: 'nobody within earshot' };
    }
    // The record in `townsfolk` is the one that remembers the turn count, so a
    // conversation survives the player stepping back a pace and returning.
    const person = townsfolk.find((p) => p.file === found.file && p.place.row === found.place.row && p.place.col === found.place.col) ?? null;
    const again = talking && person && talking.person === person;
    if (person) person.talkTurn = again ? (person.talkTurn ?? 0) + 1 : (person.talkTurn ?? 0);
    const seed = talkSeedFor(found);

    // ── what the world thinks of the player ───────────────────────────────────
    //
    // The regard is read *before* the greeting, because it decides whether there is one:
    // past `ENEMY_AT` this is somebody the player has crossed, and the twin's law is plain
    // about what that means — an enemy has no words for you, and an armed one draws. A
    // person who will not speak says so on the panel rather than showing Arena's polite
    // prose and pretending nothing happened.
    const day = radiant.day ?? 0;
    const regardId = person?.regardId ?? null;
    // Read **before** the word is noted, and deliberately: somebody who has become an enemy
    // cannot talk their way back into the player's good books in the same conversation —
    // that is the twin's law, not a missing feature.
    const standing = regardId ? standingOf(regard, regardId, day) : 'neutral';
    const refuses = standing === 'enemy' || standing === 'hostile';
    // A word exchanged is worth something to them, **once a day** (`noteRegard` enforces
    // the ration): a stranger who answers politely once is an acquaintance, and one who is
    // asked the same question fifty times is not a friend.
    if (person && !refuses) notePerson(person, 'talk');
    // …and the panel shows the standing **as it is after the word**, which is the one the
    // player just earned. Reading it before the note said "a stranger" to somebody the game
    // had already counted as an acquaintance — the panel's own copy disagreeing with its save.
    const standingNow = regardId ? standingOf(regard, regardId, day) : 'neutral';
    const regardAfter = regardId ? regardOf(regard, regardId, day) : 0;

    // A shopkeeper speaks their own trade's bank when this install has one, and the town's
    // talk when it does not (`game/shops.js`'s `serviceGreetings` drops every line that
    // wants an item or a price, because this project has neither).
    const bank = person?.bank ? serviceGreetings(library.service, person.bank) : [];
    const greeting = refuses ? null : bank.length
      ? serviceGreeting(bank, seed, person?.talkTurn ?? 0)
      : greetingFor(talkLines, seed, person?.talkTurn ?? 0);
    const topics = refuses ? [] : topicsFor(talkLines, whereAmI(), seed);
    // …and the work they have to offer, which is the reason a player talks to strangers in
    // Arena at all. A person in a dungeon-less install still offers the kinds that need
    // no dungeon; a person inside a building (`place` null) offers nothing, because the
    // job's giver is a *settlement*. Nobody offers new work to somebody they have crossed.
    const offer = person && !refuses ? offerFrom(person) : null;
    // …and the job they are **waiting to pay for**, if the player is the one who did it:
    // the hand-in, which is what turns a job given by a person into a person who is glad to
    // see the player again (`game/regard.js`'s `job`, +25).
    const handIn = person ? handInWith(radiant, person.regardId) : null;
    if (person) person.line = greeting?.text ?? null;
    talking = { person };
    showTalk(found, greeting, topics, offer, { standing: standingNow, regard: regardAfter, regards: refuses, handIn, person });
    return {
      ok: true,
      who: found.description,
      line: greeting?.text ?? null,
      turn: person?.talkTurn ?? 0,
      standing: standingNow,
      regard: regardAfter,
      handIn: handIn ? { title: handIn.title, reward: handIn.reward } : null,
      topics: topics.map((t) => ({ key: t.key, label: t.label, text: t.text })),
      offer: offer
        ? { id: offer.id, kind: offer.kind, title: offer.title, target: offer.target, reward: offer.reward, days: offer.days, text: offer.text }
        : null,
    };
  }

  /** A stable seed for one person, so the same stranger always says the same first line. */
  function talkSeedFor(person) {
    return Math.round(person.place.row * 7919 + person.place.col * 131 + mif.width * 3);
  }

  // ── the corpus's own names (S30, closed) ───────────────────────────────────
  //
  // Arena's own `NAMES.DAT` is `EMPTY`-padded save slots — the install carries no name
  // corpus at all. The **sibling Daggerfall install** (`?daggerfall=`, or the project's
  // own sibling path by default) carries `NAMEGEN.DAT`, whose fragments the generator
  // composes per race (`game/names.js`, measured against UESP's decoded XML).
  // The loader is once-per-page and **silently degraded**: no sibling install, no names,
  // and the game runs exactly as it always has.
  const DF_ROOT_DEFAULT = 'C:/ArenaProject/daggerfall/arena2/DF/DAGGER/ARENA2';
  let peopleBanks = null;
  let peopleNamesTried = false;
  const CLIMATE_NAME_BANKS = {
    T: ['breton', 'breton', 'nord', 'imperial', 'woodElf', 'highElf'],
    D: ['redguard', 'redguard', 'khajiit', 'imperial', 'breton'],
    M: ['woodElf', 'woodElf', 'darkElf', 'highElf', 'breton', 'nord'],
    // An interior has a street's own climate behind it; an unknown climate is temperate.
    fallback: null,
  };

  /**
   * The sibling install's name corpus, if it is reachable — one fetch per page, through
   * the dev door's own `/arena-local` root the way every other install file loads.
   */
  async function ensurePeopleNames() {
    if (peopleNamesTried) return peopleBanks;
    peopleNamesTried = true;
    const dfRoot = params.get('daggerfall') || DF_ROOT_DEFAULT;
    try {
      const res = await fetch(`/arena-local/NAMEGEN.DAT?arena=${encodeURIComponent(dfRoot)}`);
      if (res.ok) {
        const parsed = parseNamegen(new Uint8Array(await res.arrayBuffer()));
        if (parsed) peopleBanks = parsed.banks;
      }
    } catch { /* no sibling install: the game runs nameless, as it always has */ }
    return peopleBanks;
  }

  /**
   * Names the people a level was placed with, deterministically: a person is their
   * *face-to-name* key — the level's own seed, their cell, their index — so the same
   * face is the same person on every visit, exactly as the day plans already keep them.
   * Their race's bank comes off the street's climate (a desert's folk are Redguards and
   * Khajiit before Bretons, a jungle's mer before men), a woman's or man's name off the
   * seed — the whole rule as deterministic as the placement above it.
   *
   * @param {object[]} people the placed records this level's population is built from
   * @param {number} seed the level's own placement seed — the same one `placeTownsfolk` drew
   * @returns {number} how many were named (0 without the corpus, and that is a legal run)
   */
  function nameThePeople(people, seed) {
    if (!peopleBanks || !Array.isArray(people)) return 0;
    const climate = skyClimateOf(current?.infName ?? infName)?.climate ?? 'T';
    const pool = CLIMATE_NAME_BANKS[climate] ?? CLIMATE_NAME_BANKS.T;
    let named = 0;
    people.forEach((person, index) => {
      if (person.name) return;
      const at = person.place ?? person.home ?? { row: index, col: 0 };
      const rng = new ArenaRandom(
        (Number(seed) * 97 + at.row * 7919 + at.col * 104729 + index * 2654435761) >>> 0 || 1,
      );
      const name = personName({ banks: peopleBanks, rng }, pool[rng.nextBelow(pool.length)], rng.nextBelow(100) < 50);
      if (name) { person.name = name; named++; }
    });
    return named;
  }

  /** Every monster read this session has given one name; the count keys the die deterministically. */
  let monstersNamed = 0;
  /**
   * A monster's proper name, from the corpus's own monster banks: the -goth tables (the
   * three-part long words the generator's unnamed 9th bank carries — `game/names.js`'s
   * measured map), named the first time the realm *reads* the monster and kept for its
   * life. Deterministic in the same law as the street's names; a monster named first is
   * the one the fight's own rules use.
   *
   * @param {{monster?: object}} spawn the monster's scene record, or a test's wrapper
   */
  function properNameFor(spawn) {
    const monster = spawn?.monster;
    if (!monster || monster.proper) return;
    if (!peopleBanks) return;
    monstersNamed += 1;
    const rng = new ArenaRandom((monstersNamed * 104729 + 4099 + Number(monster.level ?? 1) * 7) >>> 0 || 1);
    monster.proper = personName({ banks: peopleBanks, rng }, 'goth', rng.nextBelow(100) < 30);
  }

  /**
   * The city-state the player is standing in, and its nearest neighbour.
   *
   * `%cn` in `template.dat` is a **city-state's** name, not a province's: Arena's own
   * lines have `%cn` at war with its neighbour `%cn2`, and the powers that war with one
   * another in Arena are the city-states. So both words come from `CITYDATA.64` — this
   * place's name, and the name of the closest *other* settlement to it on the world map,
   * which is what a neighbour is on that map. Cached, because the nearest-neighbour walk
   * is over 288 settlements and a talk line does not change where the player is.
   */
  function whereAmI() {
    // Inside a building there is no `place` — the page's URL names a `.MIF`, not a
    // location — so the city-state the door was in is read off the page the player came
    // from (`fromPlace`), which is what makes a shopkeeper able to say the town's name.
    const here = place ?? fromPlace;
    if (!here) return null;
    if (whereAmI.cache?.name === here.name) return whereAmI.cache.value;
    let neighbour = null;
    let best = Infinity;
    for (const other of world.settlements()) {
      if (other.name === here.name) continue;
      const distance = Math.hypot(other.global.x - here.global.x, other.global.y - here.global.y);
      if (distance < best) { best = distance; neighbour = other.name; }
    }
    const value = { place: here.name, neighbour: neighbour ?? undefined, province: here.province };
    whereAmI.cache = { name: here.name, value };
    return value;
  }

  /** Put the talk panel up for a person, with their questions and their work. */
  function showTalk(person, greeting, topics, offer = null, opts = {}) {
    // The full townsfolk record rides in `opts.person` (the first argument is the near
    // finder's lighter shape, which carries no guild/shop fields). Both readers below use
    // the richer one when it exists so the keeper's block and the join button have their
    // own shop kind to read.
    if (opts.person && person.shop === undefined) person = opts.person;
    const el = document.getElementById('talk');
    if (!el) return null;
    const standing = opts.standing ?? 'neutral';
    const refuses = Boolean(opts.regards);
    // The standing line, which is the world's memory of the player made visible: it is the
    // only place a regard is ever shown, and it says "a friend" or "an enemy" in the twin's
    // own words — never a name, because Arena gave nobody one this install can read (S30).
    // Shown the moment a regard exists at all — a stranger the player has just thanked reads
    // "someone who knows you", which is the first thing the ledger can honestly say.
    const standingLine = standing === 'neutral' && !opts.regard
      ? ''
      : `<p class="src">They read you as ${escapeHtml(standingWord(standing, opts.regard ?? 0))}.</p>`;
    const line = refuses
      ? (standing === 'hostile'
        ? 'They have no words left for you — they draw.'
        : 'They will not speak to you.')
      : greeting?.text ?? 'They have nothing to say.';
    el.innerHTML = `<h2>${escapeHtml(person.name ? `${person.name} — ${person.description}` : person.description)}</h2>`
      + `<p class="line">${escapeHtml(line)}</p>`
      + (refuses ? '' : `<p class="src">Arena's own words — ${greeting?.source ?? `template.dat #${greeting?.id ?? '?'}`}</p>`)
      + standingLine
      + guildBlock(opts.person ?? person)
      + `<ul>${topics.map((topic) => `<li><button data-topic="${topic.key}">Ask about ${escapeHtml(topic.label)}</button></li>`).join('')}</ul>`
      + (opts.handIn ? handInBlock(opts.handIn) : '')
      + (offer ? jobBlock(offer) : '')
      + '<p class="hint">Click a question · T again for another line · Escape to leave</p>';
    for (const button of el.querySelectorAll('button[data-topic]')) {
      button.onclick = () => askTopic(button.dataset.topic);
    }
    const take = el.querySelector('button[data-job="accept"]');
    if (take) take.onclick = () => acceptJob();
    const hand = el.querySelector('button[data-job="hand-in"]');
    if (hand) hand.onclick = () => handInJob();
    const join = el.querySelector('button[data-guild="join"]');
    if (join) join.onclick = () => joinKeeperGuild();
    el.classList.add('on');
    dbg.talk = { who: person.description, line, standing, offer: offer?.title ?? null, handIn: opts.handIn?.title ?? null, shop: person.shop ?? null };
    return el;
  }

  /**
   * The job this person is waiting to pay for, as the panel shows it.
   *
   * The other half of a job given by a person, and the half the port was missing: before
   * this, a job finished at its dungeon had **no way to be handed in and paid at all** — the
   * `return` event existed but nothing in the game ever fired it, so the purse the board
   * promised was unreachable. Now the one who asked is the one who pays, and pressing the
   * button is how it happens.
   */
  function handInBlock(active) {
    return '<div class="job">'
      + `<p class="offer">You did it — ${escapeHtml(active.title)}.</p>`
      + `<p class="src">They owe you ${active.reward} gold.</p>`
      + `<button data-job="hand-in">Hand it over — ${active.reward} gold</button>`
      + '</div>';
  }

  /**
   * The job a person is offering, as the panel shows it.
   *
   * The prose is the offer's own — Arena's recruiting speech where the kind has one
   * (`artfact*.dat`), this project's words where it does not, and the panel says which, so
   * a player is never told a line is the game's when it is not. The deadline and the purse
   * are the quest's own numbers, measured from the world map's distances.
   */
  function jobBlock(offer) {
    const held = radiant.active;
    const credit = offer.dataText ? offer.source : 'this project\u2019s words \u2014 this kind has no bank of its own';
    return '<div class="job">'
      + `<p class="offer">${escapeHtml(String(offer.text))}</p>`
      + (held
        ? `<p class="src">They will hold it for you — you already have \u201c${escapeHtml(held.title)}\u201d in hand.</p>`
        : `<p class="src">${escapeHtml(credit)} · ${offer.days} days · ${offer.reward} gold</p>`
          + `<button data-job="accept">Take the job — ${escapeHtml(offer.title)}</button>`)
      + '</div>';
  }

  /**
   * Answer one of the panel's questions, in Arena's words.
   *
   * @param {string} key
   * @returns {{ok: boolean, text?: string, reason?: string}}
   */
  function askTopic(key) {
    if (!talking?.person) return { ok: false, reason: 'nobody is being spoken to' };
    const topics = topicsFor(talkLines, whereAmI(), talkSeedFor(talking.person));
    const topic = topics.find((t) => t.key === key);
    if (!topic) return { ok: false, reason: `no such question: ${key}` };
    const el = document.getElementById('talk');
    const line = el?.querySelector('p.line');
    if (line) line.textContent = topic.text;
    const source = el?.querySelector('p.src');
    const about = key === 'city' ? whereAmI()?.place : null;
    if (source) source.textContent = `Arena's own words — template.dat #${topic.id}${about ? `, about ${about}` : ''}`;
    dbg.talk = { who: talking.person.description, line: topic.text };
    return { ok: true, text: topic.text };
  }

  /** Put the talk panel away. */
  function closeTalk() {
    talking = null;
    document.getElementById('talk')?.classList.remove('on');
  }

  /**
   * The monsters' turn: notice, close, and swing.
   *
   * Deliberately small — Arena's own monster AI is not documented anywhere this project
   * could find, so this is a straight line toward the player with a reach and a timer,
   * and it says so in the code rather than pretending to be the original.
   *
   * @param {number} dt
   */
  function stepMonsters(dt) {
    if (!monsters.length) return;
    const feet = feetOf();
    for (const spawn of monsters) {
      if (spawn.monster.health <= 0) {
        if (spawn.death) spawn.death.elapsed += dt;
        spawn.walking = false;
        continue;
      }
      const dx = feet[0] - spawn.world.x;
      const dz = feet[2] - spawn.world.z;
      const distance = Math.hypot(dx, dz);
      spawn.distance = distance;
      // **It has to be able to see the player**, not merely be near them. A monster behind a
      // wall used to wake on distance alone and swing through it: the reported "enemies hit you
      // behind walls". `sees` is the wall test (see `sightClear`), and it is what decides both
      // waking and striking — the closing step is left alone, so a monster that loses sight
      // mid-charge presses along the wall towards where the player was, which is what a body
      // that cannot see you does.
      spawn.sees = distance <= AGGRO && sightClear(
        spawn.world.x, spawn.world.y + SIGHT_EYE, spawn.world.z,
        feet[0], feet[1] + SIGHT_EYE, feet[2],
      );
      spawn.awake = spawn.sees;
      // **The creature has breathing money too.** Its bar is its own; it regenerates at
      // `MONSTER_REGEN` (slower than the player's), every attack pays from it at
      // `beginAttack`, and a spent or wounded light creature gives the fight up and
      // walks off it (`wantsToFlee`) instead of dying a schedule's death.
      if (!spawn.stamina) spawn.stamina = { stamina: staminaMax(spawn.monster), max: staminaMax(spawn.monster) };
      spawn.stamina.max = staminaMax(spawn.monster);
      stepMonsterStamina(spawn.stamina, dt);
      // …and its footing: poise is the meter a landed wound eats, and one that hitting zero
      // staggers the creature (see `strike`'s draining end). Spent footing is not a wound:
      // it fills again on the break, exactly once, per break.
      if (!spawn.poise) spawn.poise = { poise: poiseMax(spawn.monster.level), max: poiseMax(spawn.monster.level) };
      // A caster never closes if it can help it: the roster's casters fight at range
      // (`game/ranged.js`'s `RANGED_IDS` is the install's own list) and their footwork is
      // a band, not a chase.
      spawn.caster = RANGED_IDS.includes(spawn.monster.id);
      spawn.poise.max = poiseMax(spawn.monster.level);
      // **A stagger is a body, not a stat.** It holds the creature shut out of the fight for
      // its whole clock: no chase, no telegraph, no blow — the recovery *is* the opening.
      if (spawn.stagger > 0) {
        spawn.stagger = Math.max(0, spawn.stagger - dt);
        spawn.walking = false;
        continue;
      }
      const chased = distance <= AGGRO;
      spawn.fleeing = chased && wantsToFlee(spawn.monster, spawn.stamina);
      // Guard-to-guard: a fleeing creature runs *away* from the player, keeps its facing
      // turned on them (it is still a thing that may be cut down), and never begins a blow.
      if (spawn.fleeing) {
        const away = Math.min(MONSTER_SPEED * 1.15 * dt, distance - 1);
        if (away > 0) {
          const nx = spawn.world.x - (dx / (distance || 1)) * away;
          const nz = spawn.world.z - (dz / (distance || 1)) * away;
          if (walkableWorld(nx, spawn.world.z)) spawn.world.x = nx;
          if (walkableWorld(spawn.world.x, nz)) spawn.world.z = nz;
        }
        spawn.walking = away > 0;
        continue;
      }
      if (spawn.attack) { stepAttack(spawn, distance, dt); continue; }
      if (!spawn.awake) continue;
      spawn.facing = Math.atan2(dx, dz);
      // ── the creature reads the guard ──────────────────────────────────────────
      // A shield a monster walks straight into is a wall the fight does not notice. In
      // snapping distance a *light* creature with patience to spend does not press into the
      // steel: it holds just outside the reach and **drifts sideways** — a hunter looking
      // for the flank or the moment the arm comes down — while a heavy creature charges
      // through with no regard at all, the same reason its blow is annouced on the ground.
      // Once the guard has been held past `BAIT_PATIENCE` the respect is over: the foe
      // commits anyway, so a shield buys a breath, not a standstill.
      const guardRead = foeReadsGuard(spawn.monster ?? spawn.fighter, { guarding: guarding(), seconds: spawn.baitT ?? 0 });
      if (guardRead.respect && guardRead.bait > 0 && distance <= REACH + 0.5) {
        spawn.baitT = (spawn.baitT ?? 0) + dt;
        spawn.circling = true;
        spawn.circleSide = spawn.circleSide ?? (battle.nextBelow(2) === 0 ? -1 : 1);
        const move = Math.min(MONSTER_SPEED * 0.45 * dt, distance);
        const px = (-dz / (distance || 1)) * spawn.circleSide;
        const pz = (dx / (distance || 1)) * spawn.circleSide;
        const nx = spawn.world.x + px * move;
        const nz = spawn.world.z + pz * move;
        if (walkableWorld(nx, spawn.world.z)) spawn.world.x = nx;
        if (walkableWorld(spawn.world.x, nz)) spawn.world.z = nz;
        spawn.walking = true;
        // The deferred blow: the creature's next attempt is pushed *past* its own bait,
        // which is why a guard held fresh denies the swing entirely.
        spawn.nextAttack = Math.max(spawn.nextAttack ?? 0, guardRead.bait);
        continue;
      }
      spawn.baitT = 0;
      spawn.circling = spawn.circling && guarding();
      // ── a caster's footwork: a band, not a chase ────────────────────────────────
      // The roster's casters do not have a melee reach worth walking into: out of their
      // band they close, inside it they **walk away** (the bolt came from exactly this
      // distance, and standing in a warrior's lap is where casters die), inside the band
      // they stand and cast. The stand-still rule of a wind-up still holds — a casting
      // telegraph is also read, not chased.
      if (spawn.caster && !spawn.fleeing) {
        const footwork = castFootwork(distance);
        if (footwork.walk !== 0 && !spawn.attack) {
          const away = Math.min(MONSTER_SPEED * 0.9 * dt, Math.max(0, distance - 2));
          const nx = spawn.world.x + (dx / (distance || 1)) * away * footwork.walk;
          const nz = spawn.world.z + (dz / (distance || 1)) * away * footwork.walk;
          if (walkableWorld(nx, spawn.world.z)) spawn.world.x = nx;
          if (walkableWorld(spawn.world.x, nz)) spawn.world.z = nz;
          spawn.walking = footwork.walk !== 0;
        } else spawn.walking = false;
        spawn.nextAttack = (spawn.nextAttack ?? 0) - dt;
        if (!spawn.attack && spawn.nextAttack <= 0 && spawn.sees) beginAttack(spawn, distance);
        if (spawn.attack) stepAttack(spawn, distance, dt);
        continue;
      }
      // A creature that is winding up stands still: the telegraph is only readable if the thing
      // it marks does not move under it.
      if (!spawn.attack && distance > REACH * 0.75) {
        const move = Math.min(MONSTER_SPEED * dt, Math.max(0, distance - REACH * 0.7));
        const nx = spawn.world.x + (dx / (distance || 1)) * move;
        const nz = spawn.world.z + (dz / (distance || 1)) * move;
        // Sliding, not blocking: a monster that meets a wall keeps coming along it.
        if (walkableWorld(nx, spawn.world.z)) spawn.world.x = nx;
        if (walkableWorld(spawn.world.x, nz)) spawn.world.z = nz;
      }
      // **A wall is not a weapon.** A blow is only ever *begun* with the two in sight of each
      // other (`sees`), and it is only ever *landed* with them still in sight (`strikeFromMonster`).
      spawn.nextAttack = (spawn.nextAttack ?? 0) - dt;
      if (!spawn.attack && distance <= REACH && spawn.nextAttack <= 0 && spawn.sees) beginAttack(spawn, distance);
      if (spawn.attack) stepAttack(spawn, distance, dt);
    }
  }

  /**
   * A blow is announced before it lands: the creature winds up for the first part of its own
   * cadence (`attackProfile`), and that windup is what the telegraph draws.
   */
  function beginAttack(spawn, distance) {
    const profile = attackProfile(spawn.monster ?? spawn.fighter, { distance });
    // **A blow costs the creature too.** A spent creature does not commit: it keeps its
    // distance (the approach loop above still closes it) and pushes the next attempt out,
    // so a broken bar is a pause to breathe, not a deadlock — and `MONSTER_REGEN` gives
    // it the breath back while it waits.
    if (!payMonsterAttack(spawn.stamina)) {
      spawn.nextAttack = 1.2;
      return false;
    }
    if (profile.charge) profile.reach = Math.max(profile.reach, 5.5);
    const feet = feetOf();
    spawn.attack = fitAttackToGround({ profile, elapsed: 0, struck: false,
      origin: { ...spawn.world }, yaw: Math.atan2(feet[0] - spawn.world.x, feet[2] - spawn.world.z) }, current.collider);
    if (profile.charge) combatFx.burst(spawn.world.x, spawn.world.y + 0.1, spawn.world.z, 'dust');
    dbg.windups = (dbg.windups ?? 0) + 1;
  }

  /**
   * The attack's clock. The blow is decided on the first frame its active phase is reached;
   * the profile's phases add up to the creature's own interval, so a creature's rate of attack
   * is unchanged by any of this.
   */
  function stepAttack(spawn, distance, dt) {
    const attack = spawn.attack;
    const before = attack.elapsed;
    attack.elapsed += dt;
    const at = attackPhase(attack.profile, attack.elapsed);
    // A charge commits to its announced direction. It cannot rotate to follow a dodge.
    if (attack.profile.charge && attack.elapsed >= attack.profile.windup) {
      const activeDt = Math.max(0, Math.min(attack.elapsed, attack.profile.windup + attack.profile.active)
        - Math.max(before, attack.profile.windup));
      const move = attack.profile.reach / attack.profile.active * activeDt;
      const pos = new Float32Array([spawn.world.x, spawn.world.y, spawn.world.z]);
      current.collider.move(pos, Math.sin(attack.yaw) * move, 0, Math.cos(attack.yaw) * move, 1.5);
      spawn.world.x = pos[0]; spawn.world.z = pos[2];
    }
    if (!attack.struck && attack.elapsed >= attack.profile.windup) {
      const feet = feetOf();
      const contact = Math.hypot(feet[0] - spawn.world.x, feet[2] - spawn.world.z) <= 1.8;
      // Charges hurt on contact while crossing the lane, never at the start of a distant
      // warning. A dodge early in the charge can expire before the enemy reaches you.
      if (!attack.profile.charge || contact || at.phase === 'recover' || at.phase === 'done') {
        attack.struck = true;
        // A caster does not swing at the wind-up's end — it **throws**: the bolt leaves from
        // the caster's eye at the player's present, flies on its own clock (`stepBolts`),
        // and answers the player's live defence at the instant of contact. A dodge flees it
        // outright; a block (or a parry, which is not a sword trick at magic) pays a quarter.
        if (spawn.caster) {
          const feet = feetOf();
          if (sightClear(spawn.world.x, spawn.world.y + SIGHT_EYE, spawn.world.z,
            feet[0], feet[1] + SIGHT_EYE, feet[2])) {
            const wound = { damage: (spawn.monster.damage[0] + spawn.monster.damage[1]) / 2 };
            bolts.push(fireBolt(
              { x: spawn.world.x, y: spawn.world.y + 1.5, z: spawn.world.z },
              { x: feet[0], y: feet[1] + 1.25, z: feet[2] },
              wound));
            combatFx.burst(spawn.world.x, spawn.world.y + 1.5, spawn.world.z, spawn.monster.id === 'firedaemon' ? 'hit' : 'parried');
            dbg.casts = (dbg.casts ?? 0) + 1;
          } else spawn.lastBlow = { hit: false, whiff: true };
        }
        else if (attack.profile.charge && !contact) { spawn.lastBlow = { hit: false, whiff: true }; }
        else strikeFromMonster(spawn, distance);
      }
    }
    if (at.phase === 'done') {
      spawn.attack = null;
      spawn.nextAttack = 0.25 + battle.nextBelow(40) / 200;
    }
  }

  /**
   * A frame of every bolt in flight, and what it lands on.
   *
   * A bolt dies on a wall (the collider's own ray is read before the move is committed, so
   * a pillar eats the dart instead of it passing through), burns out past its sight, and
   * against the player's body it answers the *live* defence exactly as a melee blow does
   * — the dodge's i-frames are the same window the roll owns. The whole thing is damage
   * pre-computed by `resolveBolt` and handed straight through `hurtPlayer`, whose own
   * guard math is bypassed (`unguarded`) so a block is not paid twice.
   *
   * @param {number} dt
   */
  function stepBoltsSim(dt) {
    for (const bolt of bolts) {
      // The cast frame pushes the bolt mid-step; the first full frame of its flight is the
      // NEXT step, so the sight check reads its body after it has moved, not at its mouth.
      if (!bolt.seen) { bolt.seen = true; continue; }
      const feet = feetOf();
      // The bolt's passage is the *segment* it is about to fly — the same ray the sight
      // test trusts — rather than the destination's cell: a bolt skimming a cell edge must
      // not be eaten by the rounding of a cell centre.
      const nextX = bolt.x + bolt.vx * dt, nextY = bolt.y + bolt.vy * dt, nextZ = bolt.z + bolt.vz * dt;
      const passage = stepBolt(bolt, dt, (x, y, z) => !sightClear(bolt.x, bolt.y, bolt.z, nextX, nextY, nextZ));
      if (passage.dead) {
        bolt.dead = true;
        if (passage.wallhit) dbg.boltWall = (dbg.boltWall ?? 0) + 1;
        else dbg.boltOut = (dbg.boltOut ?? 0) + 1;
        continue;
      }
      if (!boltAtPlayer(bolt, feet)) continue;
      const landed = resolveBolt(bolt, { defence: liveDefence() });
      bolt.dead = true;
      if (landed.outcome === 'dodged') {
        dbg.dodges = (dbg.dodges ?? 0) + 1;
        dbg.lastBolt = 'dodged';
        showNotice('The bolt burns past you.', 900);
        continue;
      }
      dbg.boltHit = (dbg.boltHit ?? 0) + 1;
      hurtPlayer(landed.damage, 'a thrown bolt', { unguarded: true });
      combatFx.burst(bolt.x, bolt.y, bolt.z, 'hit', landed.damage > 10);
      dbg.lastBolt = landed.outcome === 'blocked' ? 'blocked' : 'struck';
    }
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].dead) bolts.splice(i, 1);
  }

  /**
   * The blow itself: whether the player is out of its reach or out of its sight (a whiff, which
   * is the telegraph's reward), what the player's defence was at that instant, and only then the
   * creature's own roll to hit.
   */
  function strikeFromMonster(spawn, distance) {
    const { profile } = spawn.attack;
    const feet = feetOf();
    if (!insideAttack(spawn.attack, feet[0], feet[2]) || !sightClear(
      spawn.attack.origin.x, spawn.attack.origin.y + SIGHT_EYE, spawn.attack.origin.z,
      feet[0], feet[1] + SIGHT_EYE, feet[2])) {
      spawn.lastBlow = { hit: false, whiff: true };
      dbg.whiffs = (dbg.whiffs ?? 0) + 1;
      return;
    }
    const outcome = resolveDefence({ phase: 'active', defence: liveDefence(), unblockable: profile.unblockable });
    dbg.lastDefence = outcome.outcome;
    if (outcome.outcome === 'dodged') {
      spawn.lastBlow = { hit: false, dodged: true };
      dbg.dodges = (dbg.dodges ?? 0) + 1;
      showNotice('Rolled clear.', 900);
      return;
    }
    if (outcome.outcome === 'parried') {
      defence.riposte = outcome.riposte;
      defence.riposteUntil = dbg.seconds + 1.2;
      defence.riposteTarget = spawn;
      spawn.attack.elapsed = profile.windup + profile.active;
      combatFx.burst(feet[0], feet[1] + 1, feet[2], 'parried', true);
      // The ring of steel is *felt*: a parry shakes the view hard, which is its reward over
      // a plain block.
      screenShake = Math.max(screenShake, 0.3);
      spawn.lastBlow = { hit: false, parried: true };
      dbg.parries = (dbg.parries ?? 0) + 1;
      showNotice('Parried. Strike back now.', 1200);
      return;
    }
    const blow = monsterAttack({ monster: spawn.monster ?? spawn.fighter, target: player, random: battle });
    spawn.lastBlow = blow;
    // A charge cannot be guarded: the guard is not applied to it (`unguarded`).
    if (blow.hit) {
      combatFx.burst(feet[0], feet[1] + 0.9, feet[2], outcome.outcome);
      hurtPlayer(Math.max(1, Math.round(blow.damage * profile.damageScale)), (spawn.monster ?? spawn.fighter).name, {
        unguarded: profile.unblockable,
      });
    }
  }

  /** Which defence is live at this instant: a roll's i-frames, a parry's window, or the guard. */
  function liveDefence() {
    if (defence.rollT >= DODGE.iframeStart && defence.rollT <= DODGE.iframeEnd) return 'dodge';
    if (defence.parryT >= PARRY.activeFrom && defence.parryT <= PARRY.activeTo) return 'parry';
    if (guarding()) return 'block';
    return 'none';
  }

  /** Q: a roll, forward if W is held and otherwise straight back out of the blow's way. */
  function startRoll() {
    if (defence.rollT < DODGE.seconds) return false;
    if (!spendStamina(defence.stamina, DODGE.stamina)) {
      showNotice('Too winded to roll.', 1000);
      return false;
    }
    defence.rollT = 0;
    const input = inputOf(keys, pressed);
    const forward = input.forward || (input.strafe ? 0 : -1);
    const len = Math.hypot(forward, input.strafe);
    defence.rollDirection = [
      (Math.sin(cam.yaw) * forward + Math.cos(cam.yaw) * input.strafe) / len,
      (Math.cos(cam.yaw) * forward - Math.sin(cam.yaw) * input.strafe) / len,
    ];
    dbg.rolls = (dbg.rolls ?? 0) + 1;
    return true;
  }

  function startParry() {
    if (defence.parryT < PARRY.seconds || defence.rollT < DODGE.seconds) return false;
    if (!spendStamina(defence.stamina, PARRY.stamina)) return false;
    defence.parryT = 0;
    return true;
  }

  /**
   * The player takes a blow.
   *
   * There is no death screen in this build (S30): at zero health the player is set back
   * on their feet at the way in, and the HUD says so. Inventing a game-over flow that
   * Arena's own save system does not have would have been the worse lie.
   */
  /**
   * What the player is standing in, from the level's own model.
   *
   * @returns {{chasm: 'dry'|'wet'|'lava'|null, surface: number, submerged: boolean}}
   */
  function waterAt() {
    const feet = feetOf();
    const cell = cellAtWorld(feet[0], feet[2]);
    const chasm = cell?.floor?.chasm ?? null;
    const surface = current.level.floorY * CELL_SIZE;
    return { chasm, surface, submerged: Boolean(chasm) && feet[1] < surface - WATER_ENTER_DEPTH };
  }

  /**
   * Water and lava, every frame: the two rules the original's own `ArenaChasmUtils` gives a
   * chasm, and the reason the bed was sunk in the first place.
   *
   * * **A wet chasm may be swum in** — `allowsSwimming(Wet)` — which in this build is a
   *   **wade**: the player keeps their feet on the 0.45 m bed, keeps the engine's gravity
   *   and step-up, and moves at the engine's own water speed (`swimSpeedScale`, the walk
   *   speed modifier DFU holds while swimming). The engine's full swim mode was tried first
   *   and is *not* used, for a reason worth writing down: it is camera-directed movement
   *   with **no gravity and no vertical input from this scene's keys**, so a 0.45 m bank
   *   becomes a wall the player cannot climb — a pool that traps you. Arena's own chasm is
   *   shallow (a third of a cell) and a wade is what it is; deep water and real swimming
   *   belong with the exterior water the engine already models.
   * * **A lava chasm damages.** The blow goes through `hurtPlayer`, so the guard, the
   *   health, the save and the "you come to at the way in" flow are the ones already there.
   * * **A dry chasm is neither**, which is what `allowsSwimming(Dry) === false` says: it is
   *   a pit, and this build leaves it walkable rather than trapping a player in one (S12).
   *
   * @param {number} dt
   */
  function updateWater(dt) {
    const wet = waterAt();
    const inWater = wet.submerged && (wet.chasm === 'wet' || wet.chasm === 'lava');
    dbg.inWater = inWater ? wet.chasm : null;
    const scale = inWater ? WADE_SPEED_SCALE : 1;
    if (current.motor.swimSpeedScale !== scale) {
      current.motor.swimSpeedScale = scale;
      dbg.waterChanged = (dbg.waterChanged ?? 0) + 1;
      updateCombatHud();
    }
    if (!inWater || wet.chasm !== 'lava') { lavaBurned = 0; return; }
    lavaBurned += dt;
    while (lavaBurned >= 1) {
      lavaBurned -= 1;
      hurtPlayer(LAVA_DAMAGE_PER_SECOND, 'the lava');
    }
  }

  function hurtPlayer(damage, from, opts = {}) {
    // The guard is applied here, at the only door a blow reaches the player through, so
    // a monster's swing and a test's `hurt` cannot disagree about what blocking means. A
    // blow that is `unguarded` (a charge) is not turned aside by it.
    const guarded = opts.unguarded ? { damage, blocked: 0 } : guardDamage(damage, guarding());
    const taken = guarded.damage;
    // A blow that lands shakes the view by its weight — the same language the heavy's own
    // impact speaks, so damage has a body and not only a number.
    screenShake = Math.max(screenShake, (player.maxHealth ?? 1) > 0 && damage > (player.maxHealth ?? 1) * 0.15 ? 0.25 : 0.12);
    const health = Math.max(0, (player.health ?? 1) - taken);
    player = { ...player, health };
    dbg.lastDamage = guarded.blocked
      ? `${from} for ${damage} (guarded: ${taken} through)`
      : `${from} for ${damage}`;
    if (health <= 0) {
      player = { ...player, health: player.maxHealth ?? player.health ?? 1 };
      current.motor.spawn(current.spawn.x * CELL_SIZE, current.spawn.y * CELL_SIZE, current.spawn.z * CELL_SIZE);
      dbg.deaths = (dbg.deaths ?? 0) + 1;
      showNotice(`${from} struck you down. You come to at the way in.`, 4000);
    }
    savePlayer();
    updateCombatHud();
  }

  /**
   * The player swings, at whatever is in front of them and within reach.
   *
   * @returns {{ok: boolean, hit: boolean, target?: string, damage?: number, health?: number, xp?: number, kills?: number, reason?: string}}
   */
  function strike({ held = 0 } = {}) {
    if (defence.rollT < DODGE.seconds || guarding()) return { ok: false, hit: false, reason: 'defending' };
    if (swingCooldown > 0) return { ok: false, hit: false, reason: 'still swinging' };
    // A heavy is a *held* strike: the press charges it (`chargeScale`), and letting go trips
    // this with the seconds held. A hold the bar cannot pay for falls back to the light
    // blow — a winded player is not denied a swing, only the multiplier.
    const charge = chargeScale(held);
    let heavy = charge.heavy;
    if (heavy && !spendStamina(defence.stamina, HEAVY.stamina)) heavy = false;
    swingCooldown = heavy ? HEAVY.cooldown : PLAYER_SWING;
    // A blow has a picture: the swing animation plays whether it connects or not — longer
    // for the heavy, which is the recovery the bigger action readably takes.
    swingAnim = heavy ? SWING_ANIM_SECONDS * 1.6 : SWING_ANIM_SECONDS;
    // …and in the first person the picture is Arena's own weapon sheet, swung the way the
    // player is pushing (a thrust when moving forward, a side sweep when strafing, the
    // overhead chop when standing still). The heavy is always the chop. See `game/weaponView.js`.
    weaponRig.swing(heavy ? 'down' : swingDirection(inputOf(keys, pressed)));
    const feet = feetOf();
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    let best = null;
    for (const spawn of monsters) {
      if (spawn.monster.health <= 0) continue;
      const dx = spawn.world.x - feet[0];
      const dz = spawn.world.z - feet[2];
      const distance = Math.hypot(dx, dz);
      if (distance > REACH || !sightClear(feet[0], feet[1] + SIGHT_EYE, feet[2], spawn.world.x, spawn.world.y + SIGHT_EYE, spawn.world.z)) continue;
      // In front of the player: the swing is a blow, not a circle.
      if ((dx * fx + dz * fz) / (distance || 1) < 0.35) continue;
      if (!best || distance < best.distance) best = { spawn, distance };
    }
    if (!best) {
      // ── …and if nothing of the dark is here, the blow lands on whoever else is ──────
      //
      // A swing in a town is a swing at the town. The victim takes the blow, the ledger
      // takes the note (`REGARD_EVENTS.struck`, −45), and if they fall the whole square takes
      // it as the twin's law says one of their own struck down is taken — which is what turns
      // a street the player was welcome in into one that comes for them.
      const folk = folkInReach(feet, fx, fz);
      if (folk) return strikeFolk(folk);
      return { ok: true, hit: false, reason: 'nothing within reach' };
    }
    if (defence.rollT < DODGE.seconds || guarding()) return { ok: false, hit: false, reason: 'defending' };
    const riposting = defence.riposte && defence.riposteTarget === best.spawn && dbg.seconds <= defence.riposteUntil;
    // The **backstab is a position**, not a roll (the browsergame's own reading): the blow
    // that lands behind the creature's own facing — it was walking away, or never turned —
    // is the one a blade lands half again as hard. `spawn.facing` is the direction the
    // walk step recorded; a monster that has never moved has no facing, and no backstab.
    const fromBehind = best.spawn.facing != null
      && Math.cos(best.spawn.facing - Math.atan2(best.spawn.world.x - feet[0], best.spawn.world.z - feet[2])) > 0.3;
    const blow = resolveAttack({
      attacker: player,
      defender: best.spawn.monster,
      weapon: player.weapon,
      material: player.material,
      random: battle,
      guaranteedHit: Boolean(riposting),
      fromBehind,
    });
    if (!blow.hit) return { ok: true, hit: false, target: best.spawn.monster.name, reason: 'missed' };
    if (blow.backstab) {
      dbg.backstabs = (dbg.backstabs ?? 0) + 1;
      showNotice('A backstab — landed before the turn.', 1100);
    }
    // The charge's own weight, before the riposte's turning: a heavy lands as the bigger
    // blow the hold paid for, and the screen reads it (`screenShake`) so the body feels it.
    if (heavy && charge.scale > 1) blow.damage = Math.round(blow.damage * charge.scale);
    // The player's own heavy is *felt*: the wound lands in the view the same way a
    // monster's charge does, so a big blow reads as weight on both sides of it.
    if (heavy) screenShake = Math.max(screenShake, 0.3);
    if (defence.riposte && defence.riposteTarget === best.spawn && dbg.seconds <= defence.riposteUntil) {
      blow.damage = Math.round(blow.damage * defence.riposte);
      defence.riposte = 0; defence.riposteTarget = null;
      dbg.ripostes = (dbg.ripostes ?? 0) + 1;
      showNotice('Riposte!', 900);
    }
    combatFx.burst(best.spawn.world.x, best.spawn.world.y + 0.9, best.spawn.world.z, 'hit', blow.damage > 10);
    const monster = { ...best.spawn.monster, health: Math.max(0, best.spawn.monster.health - blow.damage) };
    best.spawn.monster = monster;
    // **A wound has weight.** Poise drains with every landed blow; emptying it *staggers* —
    // the creature's committed attack is dropped mid-windup (the telegraph dies with it) and
    // it holds still for `STAGGER_SECONDS`, which is the player's opening, not a stat line.
    const poiseResult = applyPoise(best.spawn.poise, poiseCost({ damage: blow.damage, riposte: Boolean(riposting) }));
    if (poiseResult.staggered) {
      best.spawn.stagger = STAGGER_SECONDS;
      best.spawn.attack = null;
      best.spawn.nextAttack = 0.8;
      hitStop = Math.max(hitStop, 0.12);
      showNotice(best.spawn.monster.name + ' staggers!', 900);
      dbg.staggers = (dbg.staggers ?? 0) + 1;
    } else if (heavy) {
      // A heavy that does not break poise still lands as weight: a short arrest of the
      // whole screen, as long as its frames (the wound and the recovery share it).
      hitStop = Math.max(hitStop, 0.08);
    }
    if (monster.health === 0) {
      beginMonsterDeath(best.spawn);
      kills++;
      // `awardExperience` pays it, saves it and opens the level-up if this was the blow that
      // bought one — the notices both come from there, so a kill and a level cannot say
      // different things about the same amount of experience.
      awardExperience(monsterXp(monster), `${monster.name} falls`);
    }
    updateCombatHud();
    return { ok: true, hit: true, target: monster.name, damage: blow.damage, health: monster.health, xp, kills };
  }

  /**
   * The townsperson in front of the player and within reach, or null.
   *
   * The same front test the monsters get (a blow, not a circle), and deliberately the same
   * reach: a swing that finds a rat but not a man standing beside it would be a difference
   * the player could see.
   *
   * @param {number[]} feet the player's feet
   * @param {number} fx @param {number} fz  the way the player faces
   */
  function folkInReach(feet, fx, fz) {
    let best = null;
    for (const person of townsfolk) {
      // A swing cannot reach through a wall: somebody whose day has them indoors is not a
      // target on the street, however close their own doorstep is to the player's hand.
      if (person.down || person.atHome) continue;
      const dx = person.world.x - feet[0];
      const dz = person.world.z - feet[2];
      const distance = Math.hypot(dx, dz);
      if (distance > REACH) continue;
      if ((dx * fx + dz * fz) / (distance || 1) < 0.35) continue;
      if (!best || distance < best.distance) best = { person, distance };
    }
    return best;
  }

  /**
   * A blow landing on a townsperson.
   *
   * Three things happen and each one is the twin's law rather than this project's guess:
   * the victim's regard takes `struck`; a victim who **falls** takes `slain`, and so does
   * everybody standing in the same town who saw it — "one of their own struck down" — which
   * is what makes the witnesses hostile and armed (`stepHostileFolk`); and the body leaves
   * the street, so the next visit does not stand the player in front of a man they killed.
   * The mutual regard for the dead is deliberately *not* re-seeded: the ledger is the
   * memory, and the memory is the number. Arena pays no experience for this, and neither
   * does the port (`townsfolk.personFighter`).
   *
   * @param {{person: object, distance: number}} found
   * @returns {{ok: boolean, hit: boolean, target?: string, damage?: number, health?: number, regard?: object, reason?: string}}
   */
  function strikeFolk(found) {
    const person = townsfolk.find((p) => p === found.person || (
      p.file === found.person.file && p.home?.row === found.person.home?.row && p.home?.col === found.person.home?.col)) ?? null;
    if (!person) return { ok: true, hit: false, reason: 'nothing within reach' };
    if (!person.fighter) person.fighter = personFighter(person);
    const fighter = person.fighter;
    if (!fighter) return { ok: true, hit: false, reason: 'nothing within reach' };
    const blow = resolveAttack({
      attacker: player,
      // A person has no `attributes` table in this install, so their **Agility out of the
      // armour word** is what makes them hard to hit (`townsfolk.FIGHT_WORDS`), which is the
      // same slot `armourClass` reads the player's own defence from.
      defender: { level: fighter.level, attributes: { agility: fighter.agility } },
      weapon: player.weapon,
      material: player.material,
      random: battle,
    });
    if (!blow.hit) return { ok: true, hit: false, target: fighter.name, reason: 'missed' };
    const health = Math.max(0, fighter.health - blow.damage);
    person.fighter = { ...fighter, health };
    const struck = notePerson(person, 'struck');
    let slain = null;
    if (health === 0) {
      // The witnesses. `slain` is worth −75, which is past `HOSTILE_AT` — the town turns on
      // the player, exactly as the twin's table means it to.
      slain = notePerson(person, 'slain');
      person.down = true;
      // **The body stays for its own death art.** The archive ships a die sheet for the
      // town's families (`MLGEN0#D.CFA`, `FMGEND0#.CFA`, `GUARD06.CFA` — `peopleKinds.js`),
      // and the port used to delete the person on the same frame their health reached zero,
      // so a killing was never seen: the figure vanished mid-street. They fall in their own
      // art now and are swept up once it has played (`FOLK_DIE_SECONDS`, in the step).
      person.downAt = dbg.seconds;
      // **The witnesses are the people who could see it.** Somebody indoors did not watch a
      // killing in the street, and the port has the flag that says so (`atHome`).
      for (const other of townsfolk) if (other !== person && !other.down && !other.atHome) notePerson(other, 'slain');
      showNotice(`${fighter.name} falls. The town saw it.`, 4000);
      // …and the watch's own answer, which is a *different* question from what the witnesses
      // think of the player (`game/livingWorld.js`): how many come, whether it is an arrest,
      // and nothing at all when the street was empty.
      callWatch({ crime: 'murder', witnesses: townsfolk.filter((p) => !p.down && !p.atHome).length + 1 });
    } else {
      showNotice(`${fighter.name} takes the blow.`, 2500);
      callWatch({ crime: 'assault', witnesses: townsfolk.filter((p) => !p.down && !p.atHome).length });
    }
    updateCombatHud();
    return {
      ok: true,
      hit: true,
      target: fighter.name,
      damage: blow.damage,
      health,
      regard: struck ? { delta: struck.delta, regard: struck.regard, standing: struck.standing } : null,
      slain: Boolean(slain),
    };
  }

  /**
   * The hostile ones come for the player.
   *
   * The other half of the ledger: a person the player has crossed past `HOSTILE_AT` — the
   * neighbours of somebody they cut down, or somebody struck twice — stops being scenery and
   * fights. Their blows are the game's own (`monsterAttack`, with the armour word's damage
   * range), their walk is the archive's five angles turned to face the player, and they are
   * ordinary `townsfolk` records, so a hostile town is the same crowd the street was, only
   * looking at the player.
   *
   * Only runs where there is a town to fight in and only for those standing hostile, so the
   * cost of the ledger on a peaceful street is one comparison per person per frame.
   *
   * @param {number} dt
   */
  function stepHostileFolk(dt) {
    if (!townsfolk.length || !place) return;
    const day = radiant.day ?? 0;
    const feet = feetOf();
    for (const person of townsfolk) {
      if (person.down) { person.hostile = false; continue; }
      const hostile = person.regardId && standingOf(regard, person.regardId, day) === 'hostile';
      // **Marked on the person**, because the walking pass just below reads it: a man coming
      // at the player with a blade is not also keeping his hour, and a hostile townsperson
      // who kept his route walked away from the player faster than `MONSTER_SPEED` could
      // close — the street's own man never landed a blow (found by `regard`'s check that a
      // hostile street really draws blood).
      person.hostile = Boolean(hostile);
      if (!hostile) continue;
      if (!person.fighter) person.fighter = personFighter(person);
      if (!person.fighter) continue;
      const dx = feet[0] - person.world.x;
      const dz = feet[2] - person.world.z;
      const distance = Math.hypot(dx, dz);
      // Within sight of the player they close; the aggro radius is the monsters' own, so a
      // hostile town does not chase the player across the map from behind a wall — and
      // **standing in sight means seeing**, the same wall test the monsters use, or a man on
      // the far side of a shop wall would beat the player through it.
      if (person.attack) { stepAttack(person, distance, dt); continue; }
      if (distance > AGGRO) continue;
      if (!sightClear(person.world.x, person.world.y + SIGHT_EYE, person.world.z, feet[0], feet[1] + SIGHT_EYE, feet[2])) continue;
      if (distance > REACH * 0.75) {
        const move = Math.min(HOSTILE_FOLK_SPEED * dt, Math.max(0, distance - REACH * 0.7));
        const nx = person.world.x + (dx / (distance || 1)) * move;
        const nz = person.world.z + (dz / (distance || 1)) * move;
        if (walkableWorld(nx, person.world.z)) person.world.x = nx;
        if (walkableWorld(person.world.x, nz)) person.world.z = nz;
        // They look at the player as they come — the same rule the street already uses for
        // somebody standing still (`townsfolk.viewFacing`), from their own yaw.
        person.facing = Math.atan2(dx, dz);
        person.walking = true;
      } else {
        person.facing = Math.atan2(dx, dz);
        person.walking = false;
        person.nextAttack = (person.nextAttack ?? 0) - dt;
        if (person.nextAttack <= 0) beginAttack(person, distance);
      }
    }
  }

  // ── the menu ─────────────────────────────────────────────────────────────────
  //
  // `Escape`, and the world stops. Arena's own menu is where a player starts over,
  // looks something up, or leaves; this is the first two. It is written the way the
  // rest of the project is: the panel *reports* state that already exists — the
  // character, the main quest's objective, the job in hand, who knows them — rather
  // than inventing any, and **New Game** takes the same exit a page load would
  // (`clearSave` and back through creation), done **in place** so the Arena folder the
  // player picked survives. That last part is the whole reason this is not a
  // `location.href`: a picked folder lives in this page's memory (see `goInPlace`).

  /** Whether the *menu* stopped the world, so closing it resumes only its own pause. */
  let menuPaused = false;
  /** The two sub-panels, kept across a re-render. */
  let menuControls = false;
  let menuConfirm = false;

  /** Every control, printed once, in the game's own words. */
  const MENU_CONTROLS = Object.freeze([
    ['W A S D', 'walk'], ['Shift', 'run'], ['Space', 'jump'], ['Mouse', 'look; the left button swings'],
    ['E', 'open a door, take a thing, cross a gate, use a stair'], ['F', 'strike'],
    ['B / right mouse', 'guard; tap before impact to parry (8 stamina)'], ['Q', 'directional dodge (12 stamina)'], ['T', 'talk to whoever is in front of you'],
    ['V', 'first or third person'], ['R', 'rest if safe; rent a room in a tavern'], ['I', 'what you carry'], ['C', 'your spellbook'],
    ['Z', 'cast the spell you read last'], ['M', 'the world map'],
    ['] [', 'down and up a level'], ['Esc', 'this menu'],
  ]);

  /** One button, in the menu's own shape. */
  function menuRow(action, key, label, tag = '') {
    return `<button data-menu="${action}"${action.startsWith('newgame') ? ' class="danger"' : ''}>`
      + `<span class="key">${escapeHtml(key)}</span>${escapeHtml(label)}`
      + (tag ? `<span class="tag">${escapeHtml(tag)}</span>` : '')
      + '</button>';
  }

  /**
   * Fill the menu in from the live state.
   *
   * @returns {{where: string, who: string, objective: string|null, side: string|null, rows: string[], confirm: boolean, controls: boolean}} the same facts, for a test
   */
  function renderMenu() {
    const el = document.getElementById('menu');
    if (!el) return null;
    const objective = currentObjective(quest, chain);
    const side = radiantObjective(radiant);
    const tally = regardTally(regard, radiant.day ?? 0);
    const weapon = weaponCarried(player);
    const spells = player.spellPoints == null ? '' : ` · <b>${player.spellPoints}</b>/${player.maxSpellPoints} spell points`;
    const where = place?.name ?? mapName;
    const rows = [
      menuRow('resume', 'Esc', 'Resume', 'back to the world'),
      menuRow('controls', 'C', 'Controls', menuControls ? 'hide' : 'show'),
      menuRow('newgame', 'N', 'New Game…', 'forget everything and start over'),
    ];
    el.innerHTML = '<div class="panel">'
      + `<h2>${escapeHtml(where)} — paused</h2>`
      + `<p class="who">${escapeHtml(player.name)}, level ${player.level ?? 1} ${escapeHtml(player.race ?? '')} ${escapeHtml(player.gender ?? '')} ${escapeHtml(player.className ?? 'adventurer')}</p>`
      + `<p class="stat"><b>${player.health ?? 0}</b>/${player.maxHealth ?? 0} health${spells} · <span class="gold">${player.gold ?? 0} gold</span> · <b>${xp ?? 0}</b> experience · <b>${kills ?? 0}</b> slain</p>`
      + `<p class="stat">In hand: ${escapeHtml(weapon.name)} (${escapeHtml(weapon.materialName)}) — ${weapon.min}–${weapon.max} damage</p>`
      + `<p class="obj">The main quest: ${escapeHtml(objective ?? 'complete')}</p>`
      + (side
        ? `<p class="side">Side work: ${escapeHtml(side)}</p>`
        : '<p class="stat">No side work in hand — a tavern is where the world hands it out.</p>')
      + `<p class="stat">Who knows you: <b>${tally.known}</b> met · ${tally.friends} ${tally.friends === 1 ? 'friend' : 'friends'} · ${tally.enemies} ${tally.enemies === 1 ? 'enemy' : 'enemies'} · ${tally.hostile} hostile · <b>${radiant.day ?? 0}</b> days travelled</p>`
      + `<div class="rows">${rows.join('')}</div>`
      + '<div class="confirm' + (menuConfirm ? ' on' : '') + '">'
      + '<p>Begin a new game? ' + escapeHtml(player.name) + ', the quest, the purse and everyone who has met you are all forgotten. This cannot be undone.</p>'
      + `<div class="rows">${menuRow('newgame-confirm', '↵', 'Begin a new game', 'character creation')}${menuRow('resume', 'Esc', 'Keep playing', 'nothing is lost')}</div>`
      + '</div>'
      + `<div class="controls${menuControls ? ' on' : ''}">${MENU_CONTROLS.map(([key, what]) => `<div><span class="k">${escapeHtml(key)}</span> ${escapeHtml(what)}</div>`).join('')}</div>`
      + '<p class="hint">Escape resumes. The world waits while this is open — nothing here will reach the world behind it.</p>'
      + '</div>';
    // What the panel now says, kept for the debug seam (`__debug.menuState`) so a test can
    // read the menu without touching it — a *reader* that re-rendered would be a writer.
    dbg.menuSnapshot = {
      where,
      who: player.name,
      objective: objective ?? null,
      side: side ?? null,
      rows: [...el.querySelectorAll('[data-menu]')].map((b) => b.dataset.menu),
      confirm: menuConfirm,
      controls: menuControls,
    };
    return dbg.menuSnapshot;
  }

  /**
   * Put the menu up, or away — and with it the pause.
   *
   * A pause that is not a pause is not a pause, so the world really does stop: the
   * simulation is `life.paused`, the same switch a test drives. A pause that was
   * already on (a test's own, or a debugger's) is left standing rather than resumed
   * out from under its owner, which is what `menuPaused` remembers.
   *
   * @param {boolean} [force]  `true`/`false` to open/close, `undefined` to toggle
   * @returns {boolean|null} whether it is up now
   */
  function toggleMenu(force) {
    const el = document.getElementById('menu');
    if (!el) return null;
    const on = typeof force === 'boolean' ? force : !el.classList.contains('on');
    el.classList.toggle('on', on);
    life.menuOpen = on;
    dbg.menuOpen = on;
    if (on) {
      menuConfirm = false;
      menuPaused = !life.paused;
      if (menuPaused) life.paused = true;
      // Nothing holds a key while the menu is up: the player let go of `W` a menu ago, and
      // the keyup will not reach a scene that is not listening. Without this the walk would
      // begin the instant they resumed.
      keys.clear();
      pressed.clear();
      renderMenu();
    } else {
      if (menuPaused) life.paused = false;
      menuPaused = false;
    }
    return on;
  }

  /**
   * The menu's own buttons.
   *
   * Delegated and registered with this scene's `AbortSignal`, like every other listener
   * here, so a replaced scene takes its handlers with it.
   */
  document.getElementById('menu')?.addEventListener('click', (e) => {
    const button = e.target?.closest?.('[data-menu]');
    if (!button) return;
    const action = button.dataset.menu;
    if (action === 'resume') toggleMenu(false);
    else if (action === 'controls') { menuControls = !menuControls; renderMenu(); }
    else if (action === 'newgame') { menuConfirm = true; renderMenu(); }
    else if (action === 'newgame-confirm') void newGame();
  }, { signal });

  /**
   * Start over.
   *
   * Forgets everything the save file holds — the character, the quest's own progress, the
   * job board, who has met the player, where the loot was taken — and goes back through
   * character creation, then out to the world map, which is where `main.js` sends a
   * finished character too.
   *
   * All of it happens **in this page** and with the *same* Arena source, because the
   * player's folder cannot survive a navigation (see `scenes/newGame.js`, which is the
   * flow itself and the reason for every line of it). This function is only the latch:
   * this scene may be replaced once, and a second `newGame` while the first is still
   * building must not boot a second creation screen.
   *
   * @returns {Promise<{ok: boolean, why?: string, character?: object|null}>}
   */
  async function newGame() {
    if (life.leaving) return { ok: false, why: 'already leaving' };
    life.leaving = true;
    toggleMenu(false);
    dbg.newGame = true;
    return beginNewGame({ canvas, renderer, status, source, params });
  }

  // ── the pack, the spellbook, the counter and the shrine ────────────────────
  //
  // One DOM panel, three jobs. Arena's interface has a pack, a spellbook and a shop's counter
  // as separate windows; this scene has one panel element (`index.html`'s `#inventory`) and
  // draws the page the player asked for into it:
  //
  //   `I`  **the pack** — the bag `game/items.js` keeps on the character, with Equip, Use and
  //        Drop on every row, and the shop's own shelf underneath when the player is standing
  //        in one of the town's shops;
  //   `C`  **the spellbook** — every spell this character knows (`game/spells.js`), what one
  //        costs in spell points and what it does, with a Cast button; inside a Mages Guild
  //        the guild's shelf is underneath, which is where a spell is bought;
  //   **the counter's services** — a tavern's room, a temple's healing — are buttons in
  //        whichever page is open, because a service belongs to the building the player is
  //        standing in rather than to a window.
  //
  // Every *rule* the panel carries out lives in another module and is pure: the bag law is
  // `game/items.js` (take, equip, use, drop, never destroy), the casting law is
  // `game/spells.js` (cost, knowledge, effects), and the trade, the night's sleep and the
  // shrine are `game/services.js`. What is here is the buttons and the notices, which is the
  // only part that needs a page.
  /**
   * Which page the panel is showing: `bag` or `spells`.
   * @type {'bag'|'spells'}
   */
  let panelMode = 'bag';
  /** The install's own spell file, read once per scene (`arena/spellsFile.js`). */
  let spellLibrary = null;

  /**
   * The player's bag, made real the first time anything asks for it.
   *
   * A character created before the bag existed has no `bag` field at all, so the one rule
   * here is "a bag is an array": the first caller of anything bag-shaped gets a starting kit
   * (`game/items.js`) rather than a crash, and the next `savePlayer` writes it home.
   *
   * @returns {object[]}
   */
  function bagOf() {
    if (!Array.isArray(player.bag)) player = { ...player, bag: startingKit().bag };
    return player.bag;
  }

  /** Put a bag back on the player, keeping everything else about them. */
  function setBag(bag) {
    player = { ...player, bag: Array.isArray(bag) ? bag : bagOf() };
    return player.bag;
  }

  /**
   * Read `SPELLSG.65` once: Arena's own spells, their costs and their effect codes.
   *
   * An install without the file is not an error — the panel then says there is nothing to
   * read rather than throwing on the way into a shop, the same discipline as every other
   * optional file in this scene.
   *
   * @returns {Promise<{spells: object[], byName: Map<string, object>, unknown: string[], missing: string[]}>}
   */
  async function ensureSpellLibrary() {
    if (spellLibrary) return spellLibrary;
    try {
      const bytes = await data.bytes(SPELL_FILES.standard);
      const file = parseSpellsFile(bytes, { file: SPELL_FILES.standard });
      for (const warning of file.warnings) data.warn(warning);
      spellLibrary = buildSpellLibrary(file.named, { known: knownSpellsOf(player) });
      dbg.spellFile = { file: SPELL_FILES.standard, records: file.count, named: file.named.length, unknown: spellLibrary.unknown };
      if (spellLibrary.unknown.length) data.warn(`spells this build does not know: ${spellLibrary.unknown.join(', ')}`);
    } catch (err) {
      data.warn(`spells: ${err.message}`);
      spellLibrary = { spells: [], byName: new Map(), unknown: [], missing: [] };
      dbg.spellFile = { file: SPELL_FILES.standard, records: 0, named: 0, error: String(err?.message ?? err) };
    }
    resolveKnownSpells();
    return spellLibrary;
  }

  /**
   * Give the character a spellbook if they have none, from their own class.
   *
   * A character made before magic existed has no `knownSpells`; their class's list
   * (`game/spells.js`'s `startingSpellsFor`) is written to the save the first time anything
   * reads the spell file, so an old save is not a character who cannot cast.
   *
   * @returns {string[]}
   */
  function resolveKnownSpells() {
    if (Array.isArray(player.knownSpells) && player.knownSpells.length) return player.knownSpells;
    const list = startingSpellsFor(player.classId, player.spellPoints ?? null);
    if (list.length) { player = { ...player, knownSpells: list }; savePlayer(); }
    return list;
  }

  /**
   * The guild a shop's trade belongs to, for the keeper who can speak for it.
   *
   * Arena's guilds are *buildings* the player visits, not populations: the Mages Guild
   * hall is one of the city's doors, and its keeper is the wizard behind the shelf —
   * this port's own trade→guild map, not the twin's faction ids, because Arena's guild
   * membership lives in the data's shop kinds and says so.
   */
  function guildForShop(kind) {
    if (kind === 'mages') return GUILD_ROSTER.mages;
    if (kind === 'equipment') return GUILD_ROSTER.fighters;
    return null;
  }

  /**
   * The guild block the keeper of a guildhall shows: their membership or their invitation.
   *
   * The rank line is the law's own (`game/guilds.js`); the invitation's refusal reasons are
   * `joinGuild`'s own words. A member's standing is the earned number, capped ±100.
   */
  function guildBlock(person) {
    const guild = person?.guild ?? (person?.shop ? guildForShop(person.shop) : null);
    if (!guild) return '';
    const membership = guilds.memberships?.[guild.id];
    const standing = guildStandingOf(guilds, guild.id);
    if (guildMemberOf(membership)) {
      const title = guildTitleOf(membership, guild.id);
      return '<div class="job">'
        + `<p class="offer">You stand among them: <b>${escapeHtml(title ?? `rank ${membership.rank}`)}</b> of ${escapeHtml(guild.name)}.</p>`
        + `<p class="src">Standing ${standing} · your next review is 28 days after your last.</p>`
        + '</div>';
    }
    return '<div class="job">'
      + `<p class="offer">${escapeHtml(guild.name)} takes members. Standing ${standing} — work their name up and they will take you.</p>`
      + `<button data-guild="join">Ask to join ${escapeHtml(guild.name)}</button>`
      + '</div>';
  }

  // A job done for a person earns standing with the guild whose kind of work it was —
  // the trades' own allegiance, one number per guild, capped like the regard's.
  const guildForJob = (kind) => (kind === 'slay' || kind === 'rescue'
    ? GUILD_ROSTER.fighters : kind === 'artifact' ? GUILD_ROSTER.mages : GUILD_ROSTER.thieves);

  /** Ask the keeper's guild for membership, exactly as the panel's own button does. */
  function joinKeeperGuild() {
    const person = talking?.person;
    const guild = person?.guild ?? (person?.shop ? guildForShop(person.shop) : null);
    if (!guild) return { ok: false, reason: 'nobody here speaks for a guild' };
    const result = joinGuild(guilds, guild, player, radiant.day ?? 1);
    if (!result.ok) {
      showNotice(result.reason, 3600);
      return result;
    }
    saveGuildState(guilds);
    const title = guildTitleOf(guilds.memberships[guild.id], guild.id);
    showNotice(`Welcome to ${guild.name} — you stand at rank ${result.rank}${title ? `, ${title}` : ''}.`, 4600);
    updateObjectiveHud();
    return result;
  }

  /** The trade of the building the player is standing in, or null out in the street. */
  function shopTrade() {
    return shopForInteriorFile(mapName)?.kind ?? null;
  }

  // ── the town's own clock and its people ────────────────────────────────────
  //
  // `game/livingWorld.js` is the twin's living world, tailored to what Arena has: a clock, a
  // plan per trade, the hours each shop keeps, and the watch's answer to a crime. What is here
  // is the *scene's* half — read the clock, refuse a shut door, say what the street is doing,
  // and send the watch when the player gives it a reason to.

  /**
   * The minutes past midnight a level's clock reads on arrival.
   *
   * **Ten in the morning**, and that number is the scene's rather than the module's: with
   * `game/livingWorld.js`'s own opening hour of six, a player who arrives at the world map and
   * travels to a town walks up to an equipment store whose hours are 08:00–18:00 and finds it
   * shut, which reads as a broken shop rather than as a town with hours. Ten has every trade in
   * the game open on arrival — the smith, the guild, the temple and the tavern — and every one
   * of them closes later in the session, which is the point. `?clock=<minutes>` puts the player
   * at any hour (a test drives the shutters down with it, and a player may too).
   *
   * @returns {number}
   */
  function arrivalMinutes() {
    // **`Number(null)` is `0`, and that is midnight.** Reading a missing `?clock=` as a number
    // therefore put every level's clock at 00:00, which shut every shop in the game and made
    // walking into a storefront a refusal — caught by the `doors` suite timing out on its way
    // into an equipment shop. A parameter that is not there is not a number.
    const raw = params.get('clock');
    const forced = raw === null || raw === '' ? Number.NaN : Number(raw);
    if (Number.isFinite(forced)) return ((Math.trunc(forced) % 1440) + 1440) % 1440;
    return 10 * 60;
  }

  /**
   * What the hour has done to the light, as a reader outside the frame can hold it.
   *
   * Answers from the **frame's own** numbers when a frame has painted — the ambient and the sun
   * the renderer was actually handed — rather than recomputing them, so a test that reads this
   * and a player who looks out of the window are looking at the same light. A level with no hour
   * (a dungeon) says so instead of inventing one.
   *
   * @returns {object}
   */
  function lightReport() {
    const clock = clockNow();
    return {
      minute: clock.minutes,
      hour: clock.hour,
      phase: clock.phase,
      lit: Boolean(dayLit),
      forced: Boolean(dayForced),
      night: isNight(clock.minutes),
      daylight: dayLight ? dayLight.daylight : null,
      dayWeight: dayLight ? dayLight.dayWeight : null,
      elevation: dayLight ? dayLight.elevation : null,
      sunDir: dayLight ? Array.from(dayLight.sunDir) : null,
      // The renderer's own live light (`_ambient`/`_sunScale`, the fields the twin's hosts read
      // too): what the last frame was actually drawn with, not what this function would compute.
      sunScale: renderer._sunScale ?? null,
      ambient: Array.from(renderer._ambient ?? dayAmbient),
      fog: daySky ? Array.from(daySky.fogColor) : null,
      skyMix: daySky ? daySky.fogMix : null,
      fogDensity: dayFogDensity,
      pointLights: dbg.pointLights ?? 0,
      sourceLights: current?.lightSources?.length ?? 0,
      ambientParticles: atmosphere.fx.particles.length,
      sources: (current?.lightSources ?? []).map((light) => ({ ...light })),
    };
  }

  /**
   * The settlement's clock: the world's day, and the minutes since this level was built.
   *
   * One game minute every five real seconds (`livingWorld.GAME_MINUTES_PER_REAL_MINUTE`, the
   * twin's own `TimeScale 12`), so a game day is two hours of play, the sun is up for one, and a
   * player who lingers in one town really does see its evening come, its smith shut and its
   * tavern fill.
   */
  function clockNow() {
    return timeOfDay(radiant.day ?? 0, dbg.seconds ?? 0, { opensAt: arrivalMinutes() / 60 });
  }

  /**
   * Put the sun where the clock says it is, and the air's colour with it.
   *
   * Called once per painted frame for a level with a sky. The **shape** is the twin's
   * (`game/daylight.js`: DFU's `SunlightManager` arc and light curve, `PlayerAmbientLight`, the
   * rig's colour), applied to the numbers this scene has always used for its noon — so midday is
   * byte for byte what it was before this existed, and the hours either side of it fade out of
   * it. A dungeon is not lit by this at all: it is enclosed, its ambient is its own, and a
   * courtyard is the same rocks at every hour.
   *
   * The sun's direction goes to `beginFrame` rather than to the light alone, so the *geometry*
   * agrees with the colour: a building's east face is lit at dawn and its west face at dusk, and
   * the panels the sky is painted on are turned by the same arc.
   *
   * @returns {object|null} the frame's own light, or null when this level has no hour
   */
  function applyDaylight() {
    if (!dayLit || dayForced) return null;
    const clock = clockNow();
    const light = lightInto(clock, dayScratch);
    // The port's own day values, taken down by the hour's own weight. `dayWeight` is exactly 1
    // at the light curve's peak, which is why high noon is unregressed and the rest of the day is
    // a fraction of it rather than a second set of colours nobody has measured.
    const scale = light.ambientScale;
    ambientNow[0] = dayAmbient[0] * scale;
    ambientNow[1] = dayAmbient[1] * scale;
    ambientNow[2] = dayAmbient[2] * scale;
    renderer.setLighting(ambientNow, daySunMax * light.sunScale, light.sunColor);
    daySky = skyInto(clock, dayScratch);
    renderer.setFog('exp2', dayFogDensity, 0, 0, daySky.fogColor);
    if (current.openSky) renderer.setClearColor(dayScratch.clearColor);
    sky.fogColor = daySky.fogColor;
    sky.fogMix = daySky.fogMix;
    dayLight = light;
    return light;
  }

  /** A clock, as somebody in the street would say it: `6:05 in the evening`. */
  function clockWord(clock) {
    const hour12 = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
    const part = clock.hour < 12 ? 'in the morning'
      : clock.hour < 17 ? 'in the afternoon'
        : clock.hour < 21 ? 'in the evening' : 'at night';
    return `${hour12}:${String(clock.minute).padStart(2, '0')} ${part}`;
  }

  /** Does this trade keep hours at all? A house and a noble house never do. */
  function keepsHours(kind) {
    return Boolean(kind) && Object.hasOwn(SHOP_HOURS, kind);
  }

  /**
   * How far a person is from the player, measured from the motor's own position.
   *
   * The motor rather than `feetOf()`: the HUD this answers is written *during* the first
   * `loadLevel`, and `feetOf` is a `const` further down the file — the same temporal dead zone
   * that once made a blank page out of `doorNear` (see its own note).
   */
  function personDistance(person) {
    const pos = current?.motor?.pos;
    if (!pos || !person?.world) return Infinity;
    return Math.hypot(pos[0] - person.world.x, pos[2] - person.world.z);
  }

  /** The person standing nearest the player, or null on an empty street. */
  function nearestPerson() {
    if (!townsfolk.length) return null;
    let best = null;
    for (const person of townsfolk) {
      // A person at home is behind a door the port cannot open (there is no home interior to
      // enter), so they are not somebody the player can speak to from the street either.
      if (person.down || person.atHome) continue;
      const distance = personDistance(person);
      if (!best || distance < best.distance) best = { person, distance };
    }
    return best?.person ?? null;
  }

  /** The trades this settlement's doors keep, each once, in the door list's own order. */
  function tradesHere() {
    const out = [];
    for (const door of current?.doors ?? []) {
      const kind = door.kind ?? shopForInteriorFile(door.file)?.kind ?? null;
      if (keepsHours(kind) && !out.includes(kind)) out.push(kind);
    }
    return out;
  }

  /**
   * What the clock and the street are doing, as HUD lines.
   *
   * A living world is one the player can *read*: the hour, whether the trade they are standing
   * outside is open, and what the person nearest them is about. Nothing here is decoration —
   * the shut line is the same rule `enterDoor` refuses the door with, so the HUD and the door
   * cannot disagree.
   *
   * @param {object} [clock]
   * @returns {string[]}
   */
  function livingLines(clock = clockNow()) {
    if (!place) return [];
    const lines = [`It is ${clockWord(clock)} — ${clock.phase}.`];
    // **One line for every trade, not one each.** A city holds four trades, and four lines saying
    // "…is open at this hour" pushed the HUD past the status band it lives in (the panel was
    // 153px tall in a 151px band with four lines of its own text clipped off the bottom —
    // measured, `tests/suites/world.mjs`'s band checks). Named together they read the way a
    // player would say it, and the lines a player actually acts on keep their room.
    const kindWord = (kind) => SERVICE_KINDS[kind]?.name ?? kind;
    const trades = tradesHere();
    if (trades.length) {
      const open = trades.filter((kind) => isOpen(kind, clock));
      const shut = trades.filter((kind) => !isOpen(kind, clock));
      lines.push(`${open.length ? `Open: ${open.map(kindWord).join(', ')}` : 'Every trade here is shut'}`
        + `${shut.length ? ` — shut: ${shut.map(kindWord).join(', ')}` : ''}.`);
    }
    const person = nearestPerson();
    if (person) lines.push(`${person.fighter?.name ?? 'Somebody nearby'} is ${activityWord(person, clock)}.`);
    return lines;
  }

  /**
   * The town watch's answer to a crime the player has just committed.
   *
   * `game/livingWorld.js` decides — how many answer, what they do, and *nothing at all when
   * nobody saw it* — and this carries it out: the nearest of the crowd take up the watch,
   * the ledger is told (which is what actually makes them come, `stepHostileFolk`), and an
   * arrest costs gold. The squad is drawn from the people standing there rather than minted,
   * because Arena ships no guard record to mint from.
   *
   * @param {{crime: string, witnesses: number}} crime
   * @returns {object|null}
   */
  function callWatch({ crime, witnesses }) {
    if (!place) return null;
    const clock = clockNow();
    const guardNear = townsfolk.some((person) => !person.down && WATCH_ROLES.includes(roleOf(person)));
    const decision = watchDecision({ crime, witnesses, guardNear, regard: 0 });
    if (!decision.respond) {
      dbg.watch = { crime, action: 'none', reason: decision.reason, count: 0, fine: 0, phase: clock.phase, guardNear };
      return dbg.watch;
    }
    const already = townsfolk.filter((person) => person.watch).length;
    const squad = watchSpawn({
      crime, guards: already, day: radiant.day ?? 0,
      seed: place.citySeed ?? place.dungeonSeed ?? 1,
    });
    const picked = townsfolk
      .filter((person) => !person.down && !person.watch)
      .sort((a, b) => personDistance(a) - personDistance(b))
      .slice(0, Math.max(0, squad.count));
    for (const guard of picked) {
      guard.watch = true;
      guard.fighter = guard.fighter ?? personFighter(guard);
      // They saw it — that is the same note every other witness in the crowd takes, and it is
      // what arms them, so the watch needs no second law of its own. (`notePerson`)
      notePerson(guard, 'slain');
    }
    let fine = 0;
    if (decision.action === 'arrest' && (player.gold ?? 0) > 0) {
      fine = Math.min(player.gold, ARREST_FINE);
      player = { ...player, gold: player.gold - fine };
      savePlayer();
    }
    const line = `${squad.note}${fine ? ` They take ${fine} gold off you for it.` : ''}`;
    showNotice(`${line}\n\n${decision.reason[0].toUpperCase()}${decision.reason.slice(1)}.`, 4200);
    dbg.watch = {
      crime, action: decision.action, reason: decision.reason,
      count: picked.length, fine, guards: already + picked.length,
      phase: clock.phase, guardNear, note: squad.note,
    };
    updateCombatHud();
    return dbg.watch;
  }

  /**
   * The shelf of the building the player is in, or an empty one.
   *
   * The shelf is drawn fresh from `game/services.js` every time the panel is rebuilt, because
   * what it holds depends on the character looking at it: its level decides what is in stock
   * and their purse decides nothing (a shop shows what it has, not what you can afford).
   */
  /**
   * The *stock* this shop carries, seeded by the place and the shop's own cell, once per
   * visit: the same keeper greets the player with the same goods, but the shop down the
   * street holds a different selection, and one roll in the visit's seed may show them a
   * Great Find — the cheapest thing a step past what their level's budget usually buys.
   * The row carries a **count**: the shelf is a volume, not a menu. The live shelf is also
   * the haggle's ledger: its prices carry the visit's negotiated factor.
   */
  function shopShelf() {
    const kind = shopTrade();
    if (!kind) return { items: [], spells: [], services: [] };
    const shelf = shelfFor(kind, { character: player, library: spellLibrary });
    const stock = stockFor(kind, { level: player.level ?? 1, seed: shopSeed() });
    // The budget shelf stays for the great find (the price is already the character's
    // regard-adjusted); the stock's rows carry the place's own picks and counts.
    const rows = stock.items.map((row) => ({
      item: row.item,
      price: priceOf(row.item, { regard: haggleFactorPrice(visitHaggle?.factor ?? 1) }),
      qty: Math.max(0, row.qty - (stockTaken[row.item.id] ?? 0)),
      basePrice: row.price,
    }));
    if (stock.greatFind && !rows.some((row) => row.item.id === stock.greatFind.item.id)) {
      rows.push({
        item: stock.greatFind.item,
        price: priceOf(stock.greatFind.item, { regard: haggleFactorPrice(visitHaggle?.factor ?? 1) }),
        qty: Math.max(0, stock.greatFind.qty - (stockTaken[stock.greatFind.item.id] ?? 0)),
        basePrice: stock.greatFind.price,
        greatFind: true,
      });
    }
    return { ...shelf, items: rows, services: shelf.services };
  }

  /**
   * The shop's own seed: stable per visit, distinct per place **and per door within it**.
   * The door the player came in by (`entryCell`) is the shop's identity in that town —
   * without it, every store of a kind in one city carried the same shelf, and the module's
   * own "the shop down the street holds a different selection" was a lie the page told.
   */
  function shopSeed() {
    const placeSeed = Math.round((cityRequest?.seed ?? place?.citySeed ?? place?.dungeonSeed ?? 1) || 1);
    const door = entryCell ? entryCell.row * 7919 + entryCell.col * 104729 : 0;
    return (placeSeed * 31003 + door) >>> 0 || 1;
  }
  /** A ledger for a fresh visit: three tries and a plain price until someone rolls. */
  function newVisitHaggle() {
    return { attempts: 0, factor: 1, last: null };
  }
  /** The keeper's regard, if this building's trade has one to hand over. */
  function regardForShop() { return 0; }
  /** Turn the haggle's factor into `priceOf`'s regard scale (1 − f × 100). */
  function haggleFactorPrice(factor) { return Math.round((1 - factor) * 100); }

  /** The character's own spellbook, as the library's own entries. */
  function knownSpells(character) {
    if (!spellLibrary) return [];
    return knownSpellsOf(character)
      .map((name) => spellFromLibrary(spellLibrary, name))
      .filter(Boolean);
  }

  // ── the level-up ─────────────────────────────────────────────────────────────
  //
  // The other half of the experience the fight has been paying since `monsters.js` learned
  // UESP's EExp rule: what a level *is*, and where its own points go (`game/progression.js`
  // holds the sourced numbers and says which are the project's). Arena **asks** — UESP's
  // Hints page: *"a random number of attribute points (from 3 to 6) to distribute as you see
  // fit"* — so this is a panel with one row per attribute and a number key each, and the
  // level is not taken until the points are placed. `Escape` postpones it (the points wait),
  // which is a deliberate small departure: a modal that cannot be dismissed is what the
  // original's own stuck screen is.
  /**
   * The level being taken: the points rolled for it and where they have gone so far. The
   * health roll is made when the level is **taken**, on the Endurance in force before this
   * level's own points are spent — UESP's Attributes page has the Endurance bonus apply to
   * subsequent hit-die rolls rather than retroactively (`progression.js` says so at the roll).
   * @type {{points: number, allocation: Record<string, number>, left: number, owed: number}|null}
   */
  let levelUp = null;

  /** Whether one of the panels is on screen — what a test can see, and what a player sees. */
  const panelIsOpen = (id) => Boolean(document.getElementById(id)?.classList.contains('on'));

  /**
   * The dice a level-up is rolled with.
   *
   * Seeded from the character, the level and the experience that bought it, so a level taken
   * twice rolls the same points — a level-up is *data*, like a dungeon's own draw, and a
   * player reloading a save should meet the same decision.
   */
  function levelDice() {
    const seed = ((player?.name?.length ?? 0) * 7919 + (player?.level ?? 1) * 104729 + (xp ?? 0)) >>> 0;
    return new ArenaRandom(seed || 1);
  }

  /**
   * Add experience, and take any level it has bought.
   *
   * @param {number} amount
   * @param {string} what  who paid it, for the notice
   * @returns {{xp: number, levels: number}}
   */
  function awardExperience(amount, what = 'the fight') {
    const paid = Math.max(0, Math.round(Number(amount) || 0));
    xp += paid;
    player = { ...player, xp };
    savePlayer();
    updateCombatHud();
    const due = pendingLevels(player);
    if (due > 0) beginLevelUp(due);
    else    if (paid) showNotice(`${what} — ${paid} experience.`, 2500);
    return { xp, levels: due };
  }

  /**
   * Roll a level and put the panel up.
   *
   * @param {number} [due] how many levels are owed (`pendingLevels`); at least one
   */
  function beginLevelUp(due = pendingLevels(player)) {
    if (due <= 0) return null;
    const dice = levelDice();
    const points = rollAttributePoints(dice);
    levelUp = { points, allocation: {}, left: points, owed: due };
    renderLevelUp();
    return levelUp;
  }

  /** The attributes that still have room for a point, in Arena's own order. */
  function levelUpRoom() {
    const keys = ATTRIBUTES.map((a) => a.key);
    return keys.filter((key, i) => (player.attributes[i] ?? 0) < ATTRIBUTE_MAX);
  }

  /** Draw the level-up panel from the live character and the pending roll. */
  function renderLevelUp() {
    const el = document.getElementById('levelup');
    if (!el) return null;
    if (!levelUp) { el.classList.remove('on'); el.innerHTML = ''; return null; }
    const owed = pendingLevels(player);
    if (owed <= 0) { levelUp = null; el.classList.remove('on'); el.innerHTML = ''; return null; }
    if (levelUp.owed !== owed) levelUp.owed = owed;
    const rows = ATTRIBUTES.map((attribute, i) => {
      const value = player.attributes[i] ?? 0;
      const spent = levelUp.allocation[attribute.key] ?? 0;
      const full = value >= ATTRIBUTE_MAX;
      return `<li class="${full ? 'full' : spent ? 'spent' : ''}">`
        + `<span class="key">${i + 1}</span> <b>${escapeHtml(attribute.abbr)}</b> ${escapeHtml(attribute.name)} `
        + `<b>${value}</b>${spent ? ` <span class="sub">+${spent}</span>` : ''}`
        + `${full ? ` <span class="sub">at its maximum</span>` : ''}</li>`;
    }).join('');
    const klass = classOf(player.classId);
    el.innerHTML = `<h2>You have gained a level of experience</h2>`
      + `<p>${escapeHtml(player.name)} is level <b>${player.level + 1}</b>${klass ? `, ${escapeHtml(klass.name)}` : ''}`
      + ` — ${levelUp.points} attribute point${levelUp.points === 1 ? '' : 's'} to place.</p>`
      + `<p><span class="left">${levelUp.left}</span> still to spend${levelUp.left ? '' : ' — press Enter'}`
      + `${owed > 1 ? ` <span class="sub">(${owed} levels owed)</span>` : ''}</p>`
      + `<ul>${rows}</ul>`
      + `<p class="hint">Press 1–8 to raise an attribute. Enter takes the level; Escape postpones it.</p>`
      + `<p class="src">points: ${escapeHtml(ATTRIBUTE_POINTS_SOURCE)}<br>`
      + `health: ${escapeHtml(HEALTH_GAIN_SOURCE)}<br>`
      + `thresholds: ${escapeHtml(XP_SOURCE)}<br>`
      + `maximum: ${escapeHtml(ATTRIBUTE_MAX_SOURCE)}</p>`;
    el.classList.add('on');
    return { points: levelUp.points, left: levelUp.left };
  }

  /**
   * `1`–`8`: put a point into an attribute. `Enter`: take the level.
   *
   * @param {number} index 0-based attribute index
   * @returns {boolean} whether the point was placed
   */
  function placeLevelPoint(index) {
    if (!levelUp || levelUp.left <= 0) return false;
    const attribute = ATTRIBUTES[index];
    if (!attribute) return false;
    if ((player.attributes[index] ?? 0) + (levelUp.allocation[attribute.key] ?? 0) >= ATTRIBUTE_MAX) {
      showNotice(`${attribute.name} is already at its maximum of ${ATTRIBUTE_MAX}.`, 1800);
      return false;
    }
    levelUp.allocation[attribute.key] = (levelUp.allocation[attribute.key] ?? 0) + 1;
    levelUp.left -= 1;
    renderLevelUp();
    return true;
  }

  /**
   * Take the level: spend the points, add the health, save.
   *
   * A level with points still unspent goes through as well (`Enter` with points left, or an
   * allocation the attributes could not take), and the unspent points are reported — the
   * original hangs on that state (see `progression.js`'s header) and this does not.
   * @returns {{ok: boolean, level?: number, gained?: number, health?: number, spent?: object, unspent?: number}|null}
   */
  function takeLevel() {
    if (!levelUp) return null;
    const dice = levelDice();
    const taken = applyLevel({ character: player, points: levelUp.points, allocation: levelUp.allocation, random: dice });
    player = { ...taken.character, xp };
    levelUp = null;
    savePlayer();
    updateCombatHud();
    updateInventoryPanel();
    dbg.levelUp = {
      level: player.level, gained: taken.health, points: taken.character.lastLevel.points,
      spent: taken.spent, unspent: taken.character.lastLevel.unspent, refused: taken.refused,
    };
    const still = pendingLevels(player);
    showNotice(`${player.name} reaches level ${player.level}. Health +${taken.health}`
      + `${taken.character.lastLevel.unspent ? `, ${taken.character.lastLevel.unspent} point(s) could not be placed` : ''}`
      + `${still ? ` — ${still} more level${still === 1 ? '' : 's'} owed` : ''}.`, 4000);
    if (still > 0) beginLevelUp(still);
    return { ok: true, level: player.level, gained: taken.health, health: player.health, spent: taken.spent, unspent: taken.character.lastLevel.unspent };
  }

  /**
   * Put the panel up, or away, on the page asked for.
   *
   * @param {boolean} [force] `true`/`false` to open/close, `undefined` to toggle
   * @param {'bag'|'spells'} [mode] which page to show; the panel keeps the last one otherwise
   * @returns {boolean|null} whether it is up now
   */
  function toggleInventory(force, mode) {
    const el = document.getElementById('inventory');
    if (!el) return null;
    if (mode) panelMode = mode === 'spells' ? 'spells' : 'bag';
    const on = typeof force === 'boolean' ? force : !el.classList.contains('on');
    el.classList.toggle('on', on);
    if (on) updateInventoryPanel();
    dbg.inventoryOpen = on;
    dbg.panelMode = panelMode;
    return on;
  }

  /** `I`: the pack — or put it away, if the pack is already the page on screen. */
  function openBag() {
    const el = document.getElementById('inventory');
    const showing = Boolean(el?.classList.contains('on')) && panelMode === 'bag';
    return toggleInventory(showing ? false : true, 'bag');
  }

  /** `C`: the spellbook. The file is read before the page is drawn, once. */
  async function openSpellbook() {
    const el = document.getElementById('inventory');
    const showing = Boolean(el?.classList.contains('on')) && panelMode === 'spells';
    if (showing) return toggleInventory(false);
    await ensureSpellLibrary();
    return toggleInventory(true, 'spells');
  }

  /** One row of the pack: what it is, what it does, and what can be done with it. */
  function bagRow(row) {
    const trade = shopTrade();
    const buttons = [
      ['weapon', 'armour', 'shield'].includes(row.kind) ? `<button data-bag="${escapeHtml(row.id)}" data-do="equip">Equip</button>` : '',
      ['potion', 'scroll'].includes(row.kind) ? `<button data-bag="${escapeHtml(row.id)}" data-do="use">Use</button>` : '',
      trade && buys(trade, row.kind) ? `<button data-bag="${escapeHtml(row.id)}" data-do="sell">Sell</button>` : '',
      `<button data-bag="${escapeHtml(row.id)}" data-do="drop">Drop</button>`,
    ].filter(Boolean).join(' ');
    return `<li><b>${escapeHtml(row.name)}</b>${row.qty > 1 ? ` ×${row.qty}` : ''} `
      + `<span class="sub">${escapeHtml(row.note)}</span> ${buttons}</li>`;
  }

  /** One row of the spellbook: the spell, its cost, and the Cast button. */
  function spellRow(entry) {
    const cost = costOf(player, entry);
    const check = canCast(player, entry);
    const element = entry.element && entry.element !== 'none' ? ` · ${entry.element}` : '';
    return `<li><b>${escapeHtml(entry.name)}</b> <span class="sub">${escapeHtml(entry.note)} · ${cost} spell points${element}</span>`
      + ` <button data-cast="${escapeHtml(entry.name)}"${check.ok ? '' : ` title="${escapeHtml(check.reason ?? '')}"`}>Cast</button></li>`;
  }

  /** Everything the shop the player is standing in will sell them. */
  function shelfSection(kind) {
    const rows = shopShelf().items.filter((row) => row.qty > 0);
    const empty = shopShelf().items.length && !rows.length
      ? '<p class="sub">The shelf is bare — sold down to nothing this visit.</p>' : '';
    if (!shopShelf().items.length) return '<p class="sub">This trade carries nothing to haggle over.</p>';
    const can = visitHaggle && visitHaggle.attempts < HAGGLE_MAX;
    return `<h3>On the shelf${can ? '' : ' — sold out of talk'}</h3><ul>`
      + rows.map((row) => `<li><b>${escapeHtml(row.item.name)}${row.greatFind ? ' <span class="sub">a find</span>' : ''}</b>`
        + ` <span class="sub">${escapeHtml(itemNote(row.item))}${row.qty !== 1 ? ` · ${row.qty} on the shelf` : ''}</span>`
        + (can ? ` <button data-haggle="${escapeHtml(row.item.id)}">Haggle</button>` : '')
        + ` <button data-goods="${escapeHtml(row.item.id)}">Buy — ${row.price} gold</button></li>`).join('')
      + '</ul>' + empty;
  }

  /** What the keeper of this building will do for the player, for a price. */
  function serviceSection(kind) {
    const services = kind ? shopShelf().services : [];
    if (!services.length) return '';
    return `<h3>${escapeHtml(SERVICE_KINDS[kind]?.name ?? kind)} — the keeper's services</h3><ul>`
      + services.map((service) => `<li><b>${escapeHtml(service.label)}</b> <span class="sub">${escapeHtml(service.note)}</span>`
        + ` <button data-service="${escapeHtml(service.id)}">${service.price} gold</button></li>`).join('')
      + '</ul>';
  }

  /**
   * Rebuild the panel from the live character, bag, spellbook and shop.
   *
   * The pack page keeps the rows the old panel printed (`game/inventory.js`'s `carried`: the
   * weapon in hand, the purse, the quest's own items, the tally) and adds the **bag** under
   * them; the spellbook page lists what the character knows and what the guild will sell. Both
   * pages carry the counter's own services when the player is standing at one.
   *
   * @returns {{mode: string, sections: number, rows: number, spells: number, shelf: number, services: number}|null}
   */
  function updateInventoryPanel() {
    const el = document.getElementById('inventory');
    if (!el) return null;
    const bag = bagOf();
    resolveKnownSpells();
    const kind = shopTrade();
    const held = weaponHeld(player);
    const sections = carried(player, {
      quest,
      kills,
      xp,
      day: radiant.day ?? 0,
      side: radiant.active?.title ?? null,
    });
    const carriedHtml = sections.map((section) => `<h3>${escapeHtml(section.section)}</h3><ul>`
      + section.rows.map((row) => `<li><b>${escapeHtml(row.name)}</b> <span class="sub">${escapeHtml(row.note)}</span></li>`).join('')
      + '</ul>').join('');
    const head = `<h2>${escapeHtml(player.name)} — ${panelMode === 'spells' ? 'your spellbook' : 'what you carry'}</h2>`
      + `<p class="hint"><button data-panel="bag">Pack (I)</button> <button data-panel="spells">Spells (C)</button>`
      + (kind ? ` · ${escapeHtml(SERVICE_KINDS[kind]?.name ?? kind)}` : '') + '</p>'
      + `<p class="stat"><span class="gold">${player.gold ?? 0} gold</span> · <b>${player.health ?? 0}</b>/${player.maxHealth ?? 0} health`
      + (player.spellPoints == null ? ' · no spell points' : ` · <b>${player.spellPoints}</b>/${player.maxSpellPoints ?? player.spellPoints} spell points`)
      + ` · ${armourRating(player)} armour · in hand: ${escapeHtml(held.item.name)} (${escapeHtml(held.material.name)}) ${held.min}–${held.max} damage</p>`;

    let body;
    let spells = 0;
    let shelf = 0;
    if (panelMode === 'spells') {
      const book = knownSpells(player);
      spells = book.length;
      body = `<h3>In the book</h3>` + (book.length
        ? `<ul>${book.map(spellRow).join('')}</ul>`
        : `<p class="sub">Nothing in this book. ${player.spellPoints == null
          ? 'Arena\'s fighting classes do not cast at all — a scroll is how such a character works magic.'
          : 'The Mages Guild sells spells.'}</p>`);
      if (!spellLibrary) {
        body += `<p class="sub">Arena's own spell file (${escapeHtml(SPELL_FILES.standard)}) has not been read yet — open this page again in a moment.</p>`;
      } else if (kind === 'mages') {
        const forSale = shopShelf().spells;
        shelf = forSale.length;
        body += `<h3>The guild's shelf — spells for sale</h3>` + (forSale.length
          ? `<ul>${forSale.map((row) => `<li><b>${escapeHtml(row.spell.name)}</b> <span class="sub">${escapeHtml(row.spell.note)} · ${row.spell.points} spell points</span>`
            + ` <button data-spell="${escapeHtml(row.spell.name)}">Learn — ${row.price} gold</button></li>`).join('')}</ul>`
          : '<p class="sub">The shelf holds nothing this character could learn.</p>');
      }
    } else {
      body = carriedHtml;
      const rows = bagRows(bag);
      body += `<h3>Pack (${rows.length} ${rows.length === 1 ? 'thing' : 'things'})</h3>` + (rows.length
        ? `<ul>${rows.map(bagRow).join('')}</ul>`
        : '<p class="sub">Nothing in the pack. Chests, piles and bodies in a dungeon have things in them — and every shop in a town sells them.</p>');
    }
    const shelfRows = shelfSection(kind);
    if (shelfRows) shelf += (shopShelf().items ?? []).length;
    body += shelfRows + serviceSection(kind);
    el.innerHTML = head + body
      + `<p class="hint">I the pack · C the spellbook · Z casts the spell you read last · Escape puts this away</p>`
      + `<p class="hint">${escapeHtml(HIT_FORMULA_NOTE)} ${escapeHtml(CASTING_NOTE)}</p>`;
    dbg.panel = {
      mode: panelMode,
      sections: sections.length,
      rows: bagRows(bag).length,
      spells,
      shelf,
      services: (kind ? shopShelf().services.length : 0),
      trade: kind,
      haggle: visitHaggle ? { attempts: visitHaggle.attempts, factor: visitHaggle.factor, last: visitHaggle.last } : null,stock: (kind ? shopShelf().items.map((row) => ({ id: row.item.id, qty: row.qty, price: row.price })) : []),
    };
    return dbg.panel;
  }

  /**
   * The panel's own buttons: a page switch, and one action per row.
   *
   * Delegated and registered with this scene's `AbortSignal`, like every other listener here,
   * so a scene that is replaced takes its handlers with it.
   */
  document.getElementById('inventory')?.addEventListener('click', (e) => {
    const button = e.target?.closest?.('button');
    if (!button) return;
    const data = button.dataset ?? {};
    if (data.panel) {
      panelMode = data.panel === 'spells' ? 'spells' : 'bag';
      if (panelMode === 'spells') void ensureSpellLibrary().then(() => updateInventoryPanel());
      else updateInventoryPanel();
      return;
    }
    if (data.bag) {
      if (data.do === 'use') void useThing(data.bag);
      else if (data.do === 'drop') void dropThing(data.bag);
      else if (data.do === 'sell') void sellThing(data.bag);
      else void equipThing(data.bag);
      return;
    }
    if (data.cast) void castSpell(data.cast);
    else if (data.goods) void buyThing(data.goods);
    else if (data.haggle) void haggleThing(data.haggle);
    else if (data.spell) void learnFromGuild(data.spell);
    else if (data.service) void takeService(data.service);
  }, { signal });

  /** Equip something out of the pack, and put it in the player's hands. */
  async function equipThing(id) {
    const result = equipFromBag(player, bagOf(), id);
    if (!result.ok) { showNotice(result.reason, 2400); return false; }
    player = result.character;
    // The bag `equipFromBag` hands back is applied too, not just the character: whatever the
    // item displaced goes *into* the pack, so a dropped equip would lose it.
    setBag(result.bag);
    savePlayer();
    // A weapon is a *picture* in the first person (`game/weaponView.js`), and the sheet for
    // the new weapon has to be in hand before the next frame draws it.
    if (itemById(id)?.kind === 'weapon') { weaponRig.reset(player.weapon); await loadWeaponArt(); }
    showNotice(result.note, 2600);
    dbg.lastItem = { do: 'equip', id, note: result.note };
    updateCombatHud();
    updateInventoryPanel();
    return true;
  }

  /** Drink a potion, or read a scroll — and cast what the scroll carries. */
  async function useThing(id) {
    const result = useFromBag(player, bagOf(), id);
    if (!result.ok) { showNotice(result.reason, 2400); return false; }
    player = result.character;
    // **The empty bottle.** `useFromBag` hands back the bag with the potion or the scroll
    // taken off it, and this line is what put it in the player's hands: without it the
    // draught worked, said so, and stayed in the pack, which is a potion that never runs out.
    // Caught by the browser suite's "drinking a potion uses one" (`tests/suites/gear.mjs`).
    setBag(result.bag);
    savePlayer();
    dbg.lastItem = { do: 'use', id, note: result.note, effect: result.effect ?? null };
    showNotice(result.note, 2800);
    updateCombatHud();
    updateInventoryPanel();
    // **A scroll casts the spell it names**, through the same door a spellbook cast goes
    // through — a scroll is how a fighter works magic, not a second and weaker kind of it.
    if (result.effect?.kind === 'spell' && result.effect.spell) {
      await castSpell(result.effect.spell, { fromScroll: true });
    }
    return true;
  }

  /** Throw something away. */
  function dropThing(id) {
    const result = dropFromBag(bagOf(), id);
    if (!result.dropped) { showNotice('There is nothing like that in the pack.', 2000); return false; }
    setBag(result.bag);
    savePlayer();
    showNotice(`${result.dropped.name} dropped.`, 2000);
    dbg.lastItem = { do: 'drop', id };
    updateInventoryPanel();
    return true;
  }

  /** Sell something to the shop the player is standing in. */
  function sellThing(id) {
    const trade = shopTrade();
    const result = sellItem(player, bagOf(), id, { kind: trade, regard: 0 });
    if (!result.ok) { showNotice(result.reason, 2600); return false; }
    player = result.character;
    setBag(result.bag);
    savePlayer();
    showNotice(result.note, 2600);
    dbg.lastTrade = { do: 'sell', id, gold: result.gold };
    updateInventoryPanel();
    return true;
  }

  /**
   * Buy something off the shelf — from the visit's own stock, at the visit's own price.
   *
   * The shelf is a **volume**: a row's count is what this visit can sell, and a shout for
   * the tenth potion of healing is answered by the keeper's own ledger, not by another
   * pile appearing under the counter. The price carries the haggle's factor.
   */
  function buyThing(id) {
    const trade = shopTrade();
    const row = shopShelf().items.find((entry) => entry.item.id === id);
    if (row && row.qty <= 0) { showNotice(`${row.item.name} is sold out of this visit's stock.`, 2600); return false; }
    const result = buyItem(player, bagOf(), id, { kind: trade, regard: haggleFactorPrice(visitHaggle?.factor ?? 1) });
    if (!result.ok) { showNotice(result.reason, 2600); return false; }
    player = result.character;
    setBag(result.bag);
    stockTaken[id] = (stockTaken[id] ?? 0) + 1;
    savePlayer();
    showNotice(result.note, 2600);
    dbg.lastTrade = { do: 'buy', id, cost: result.cost, factor: visitHaggle?.factor ?? 1 };
    updateInventoryPanel();
    return true;
  }

  /**
   * Try the price down. One shout is one roll: a win makes the rest of the visit's prices
   * kinder, a loss makes them dearer, and the visit's three tries run out — a keeper with
   * no patience never gets any back before the level changes (the ledger lives here, and
   * PROGRESS's simplification list says the save does not carry it yet.)
   */
  function haggleThing(id) {
    const trade = shopTrade();
    if (!trade) return false;
    if (!visitHaggle) visitHaggle = newVisitHaggle();
    const roll = haggleRoll({
      regard: regardForShop(),
      attempts: visitHaggle.attempts,
      random: new ArenaRandom((shopSeed() + visitHaggle.attempts * 104729) >>> 0 || 1),
    });
    visitHaggle.attempts = roll.attempts;
    visitHaggle.factor = Math.max(0.5, Math.min(2, visitHaggle.factor * roll.factor));
    visitHaggle.last = roll.note;
    dbg.lastHaggle = { ok: roll.ok, factor: visitHaggle.factor, attempts: visitHaggle.attempts, id };
    showNotice(roll.note, 2800);
    updateInventoryPanel();
    return roll.ok;
  }

  /** Learn a spell from the Mages Guild's shelf. */
  function learnFromGuild(name) {
    const entry = spellFromLibrary(spellLibrary, name);
    const result = buySpell(player, entry ?? { name, points: 0 }, { regard: 0 });
    if (!result.ok) { showNotice(result.reason, 2800); return false; }
    player = result.character;
    savePlayer();
    showNotice(result.note, 3200);
    dbg.lastTrade = { do: 'spell', name, cost: result.cost };
    updateInventoryPanel();
    return true;
  }

  /** Pay the keeper for what they do: a room at the tavern, or the temple's healing. */
  function takeService(id) {
    if (shopTrade() === 'tavern' && id === 'rest') return restIn();
    const result = templeService(player, id, { regard: 0 });
    if (!result.ok) { showNotice(result.reason, 2600); return false; }
    player = result.character;
    savePlayer();
    showNotice(result.note, 3200);
    dbg.lastService = { id, cost: result.cost };
    updateCombatHud();
    updateInventoryPanel();
    return true;
  }

  /**
   * A night at the tavern: gold, health, spell points — and **a day off the calendar**.
   *
   * The day is the point. Jobs' deadlines are measured in days (`game/radiantQuests.js`), so
   * sleeping is not a free heal: a player who is two days from a deadline and spends a night in
   * a tavern has spent it, and the scene is the only thing that owns that clock.
   */
  function restIn() {
    const result = rest(player, { kind: 'tavern' });
    if (!result.ok) { showNotice(result.reason, 2600); return false; }
    player = result.character;
    radiant = advanceDays(radiant, result.days);
    saveRadiantState(radiant);
    savePlayer();
    showNotice(result.note, 3400);
    dbg.lastRest = { cost: result.cost, days: result.days, day: radiant.day };
    updateCombatHud();
    updateObjectiveHud();
    updateInventoryPanel();
    return true;
  }

  // Reconstructed camping rule: exposed or threatened rest is refused. Time and
  // deadlines advance, but encounters are not repopulated until the next entry.
  function restHere() {
    if (shopTrade() === 'tavern') return restIn();
    const feet = feetOf();
    const threatened = monsters.some((spawn) => spawn.monster.health > 0
      && Math.hypot(spawn.world.x - feet[0], spawn.world.z - feet[2]) < AGGRO
      && sightClear(spawn.world.x, spawn.world.y + SIGHT_EYE, spawn.world.z, feet[0], feet[1] + SIGHT_EYE, feet[2]))
      || townsfolk.some((person) => person.hostile && !person.down);
    if (threatened || defence.rollT < DODGE.seconds || swingCooldown > 0) {
      showNotice('You cannot rest while enemies threaten you.', 2400); return false;
    }
    if (current.city || entryCell) {
      showNotice('Rent a room at a tavern to rest in town — speak to the keeper, or press R inside.', 3200); return false;
    }
    if (waterAt().submerged || current.motor.pos[1] < current.level.floorY * CELL_SIZE - 0.2) {
      showNotice('Find dry, level ground before resting.', 2400); return false;
    }
    player = { ...player, health: player.maxHealth ?? player.health,
      ...(player.maxSpellPoints != null ? { spellPoints: player.maxSpellPoints } : {}) };
    radiant = advanceDays(radiant, 1);
    saveRadiantState(radiant); savePlayer();
    dbg.lastRest = { cost: 0, days: 1, day: radiant.day, camp: true };
    showNotice('You make camp and rest. A day passes; health and spell points are restored.', 3400);
    updateCombatHud(); updateObjectiveHud(); updateInventoryPanel();
    return true;
  }

  /**
   * The nearest living monster a spell can be aimed at.
   *
   * Preferring what is in front, but not requiring it: Arena's own casting is a click at a
   * target, and a player who has just turned around should not be told "nothing in reach"
   * while a rat chews their boot.
   */
  function spellTarget() {
    const feet = feetOf();
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    let best = null;
    for (const spawn of monsters) {
      if (spawn.monster.health <= 0) continue;
      const dx = spawn.world.x - feet[0];
      const dz = spawn.world.z - feet[2];
      const distance = Math.hypot(dx, dz);
      if (distance > SPELL_RANGE) continue;
      if (distance > 4 && (dx * fx + dz * fz) / (distance || 1) < 0.2) continue;
      if (!best || distance < best.distance) best = { spawn, distance };
    }
    return best;
  }

  /**
   * A spell's blow, landed the way a swing's is (`strike`): the creature loses the health, the
   * tally takes the kill, and the experience is the same experience a sword would have earned.
   *
   * @param {object} spawn @param {number} amount @param {string} source
   */
  function beginMonsterDeath(spawn) {
    noteKill(worldMemory, memoryKey(current.index), spawn.monster.id);
    saveWorldState(worldMemory);
    spawn.attack = null;
    spawn.death = { elapsed: 0 };
    spawn.walking = false;
    spawn.awake = false;
    if (spawn.motion) spawn.motion.moving = false;
    combatFx.burst(spawn.world.x, spawn.world.y + 0.7, spawn.world.z, 'hit', true);
    if (spawn.bounty) {
      const result = applyRadiantEvent(radiant, 'killed', { where: place?.name,
        ...spawn.bounty, monster: spawn.monster.id });
      if (result.ok) {
        radiant = result.state; saveRadiantState(radiant);
        showNotice(radiantObjective(radiant), 4500);
        updateObjectiveHud();
      }
    }
  }

  function damageMonster(spawn, amount, source) {
    if (spawn.monster.health <= 0) return spawn.monster;
    const monster = { ...spawn.monster, health: Math.max(0, spawn.monster.health - Math.max(0, Math.round(amount))) };
    spawn.monster = monster;
    if (monster.health === 0) {
      beginMonsterDeath(spawn);
      kills++;
      awardExperience(monsterXp(monster), `${monster.name} falls to ${source}`);
    }
    return monster;
  }

  /**
   * `Open` and `Wizard Lock`: the one pair of spells the *world* can answer, since a lock is
   * the level's own (`game/doors.js`) and the door in front of the player is where it lives.
   *
   * @param {boolean} shouldOpen
   * @returns {string} what happened, for the notice line
   */
  function shiftLock(shouldOpen) {
    const leaf = leafNear();
    if (!leaf) return 'nothing here is locked';
    if (shouldOpen) {
      if (!leaf.locked) return 'that door is already open';
      leaf.locked = false;
      leaf.target = 1;
      if (current?.collider && leaf.collider?.indices?.length) current.collider.removeBucket(leaf.id);
      dbg.lastDoor = { row: leaf.row, col: leaf.col, result: 'opened', lockLevel: leaf.lockLevel, kind: leaf.kind };
      rememberDoor(leaf);
      updateObjectiveHud();
      return 'the lock gives way';
    }
    leaf.locked = true;
    leaf.target = 0;
    if (current?.collider && leaf.collider?.indices?.length)
      current.collider.addMesh(leaf.id, leaf.collider.positions, leaf.collider.indices, identity());
    rememberDoor(leaf);
    dbg.lastDoor = { row: leaf.row, col: leaf.col, result: 'locked', lockLevel: leaf.lockLevel, kind: leaf.kind };
    return 'the lock closes behind you';
  }

  /**
   * Cast a spell — by name, or the one read last (`Z`).
   *
   * The rules are all `game/spells.js`'s: whether this class may cast at all, whether the
   * spell is in the book, and whether the spell points are there. What this function adds is
   * the *world*: a target to burn, a lock to open, and the HUD and the save afterwards.
   *
   * @param {string|null} [name]
   * @param {{fromScroll?: boolean}} [opts] a scroll casts what a fighter could not
   * @returns {Promise<object>} what the cast did, for the notice bar and the debug seam
   */
  async function castSpell(name = null, opts = {}) {
    const lib = await ensureSpellLibrary();
    const entry = spellFromLibrary(lib, name ?? dbg.lastSpell ?? '');
    if (!entry) {
      showNotice(name ? `${name} is not a spell this game has.` : 'Nothing is ready to cast — C opens the spellbook.', 2600);
      return { ok: false, reason: 'no such spell' };
    }
    // A scroll is magic a *fighter* can use: the cast is made with a character who knows the
    // spell and can pay for it — the scroll itself is the price, since `useFromBag` has
    // already spent it — and the points and the book are put back afterwards.
    const knownBefore = knownSpellsOf(player);
    const pointsBefore = player.spellPoints;
    const caster = opts.fromScroll
      ? { ...player, knownSpells: [...knownBefore, entry.name], spellPoints: Math.max(Number(pointsBefore) || 0, entry.points) }
      : player;
    const target = spellTarget();
    const result = applySpell(entry, {
      character: caster,
      targetName: target?.spawn?.monster?.name ?? null,
      random: (n) => battle.nextBelow(Math.max(1, Math.round(Number(n) || 1))),
    });
    if (!result.ok) {
      showNotice(result.reason, 3000);
      dbg.lastCast = { ok: false, spell: entry.name, reason: result.reason };
      return { ok: false, reason: result.reason, spell: entry.name };
    }
    player = opts.fromScroll
      ? { ...result.character, spellPoints: pointsBefore, knownSpells: knownBefore }
      : result.character;
    dbg.lastSpell = entry.name;
    const outcomes = [];
    for (const event of result.events) {
      if (event.kind === 'damage') {
        const spawn = target?.spawn;
        if (!spawn) { outcomes.push('nothing was in reach to burn'); continue; }
        const after = damageMonster(spawn, event.power, entry.name);
        outcomes.push(`${event.power} to ${after.name}${after.health === 0 ? ' (dead)' : ` (${after.health} left)`}`);
      } else if (event.kind === 'open') outcomes.push(shiftLock(true));
      else if (event.kind === 'lock') outcomes.push(shiftLock(false));
      else if (event.kind === 'passwall') outcomes.push('the stone here is too thick to walk through');
      else if (event.kind === 'light') outcomes.push('light to see by');
      else if (event.kind === 'levitate') outcomes.push('your feet leave the ground');
      else if (event.kind === 'ward') outcomes.push(`a ward of ${event.power}`);
      else if (event.kind === 'heal') outcomes.push(`${event.power} health back`);
      else outcomes.push(event.kind);
    }
    savePlayer();
    updateCombatHud();
    updateInventoryPanel();
    showNotice(`${result.note}${outcomes.length ? ` (${outcomes.join('; ')})` : ''}`, 3400);
    dbg.lastCast = {
      ok: true, spell: entry.name, cost: result.cost, damage: result.damage, heal: result.heal,
      ward: result.ward, events: result.events.map((event) => event.kind), outcomes,
      target: target?.spawn?.monster?.name ?? null, spellPoints: player.spellPoints, fromScroll: Boolean(opts.fromScroll),
    };
    return dbg.lastCast;
  }

  /** The combat line: who the player is, and what is in front of them. */
  function updateCombatHud() {
    const el = document.getElementById('combat');
    if (!el) return;
    // The corpus arrives late on a page that never entered a town (a dungeon boot names
    // nothing yet): the HUD's own once-per-page ask re-renders the line when it lands, so
    // the monster in front of the player gains its proper name on the read after that.
    if (!peopleBanks && !peopleNamesTried) {
      void ensurePeopleNames().then(() => updateCombatHud());
    }
    // …and the install's own greeting, asked for the same once — a session the fanfare
    // greets either on the first paint or, when the browser's autoplay law blocks it,
    // on the player's own first gesture.
    if (!fanfareTried) {
      fanfareTried = true;
      void playFanfare({ arenaPath: source?.arenaPath ?? params.get('arena') ?? null });
    }
    // The HUD's own panel is bottom-left too, and both are several lines tall: with
    // nothing keeping them apart the fight line drew straight over the level line
    // (visible in the first playable build). The class lets the HUD step up out of
    // the way while the combat panel is on screen; see index.html.
    document.body.classList.toggle('combat-on', true);
    const nearest = monsters
      .filter((s) => s.monster.health > 0)
      .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0];
    // Named the first time the realm reads the monster, from the corpus's own
    // -goth tables — then every later read sees the same proper name.
    if (nearest) properNameFor(nearest);
    // The level and how far the experience has climbed toward the next one (`game/progression.js`):
    // the number the fight has been paying into, and the one a player watches.
    const progress = progressOf({ ...player, xp });
    const owed = pendingLevels({ ...player, xp });
    el.innerHTML = `<b>${player.name}</b> — level <b>${player.level}</b> · ${player.health}/${player.maxHealth} health`
      + ` · ${xp} experience${progress.next ? ` (${progress.needed} to level ${progress.earned + 1})` : ''}`
      + ` · ${kills} slain<br>`
      + (owed > 0 ? `<span class="level">${owed} level${owed === 1 ? '' : 's'} owed — press L to place the points</span><br>` : '')
      + (nearest
        ? `${nearest.monster.proper ? `${nearest.monster.proper} — ${nearest.monster.name}` : nearest.monster.name} ${nearest.monster.health}/${nearest.monster.maxHealth} · ${Math.round(nearest.distance ?? 0)} m away`
        : 'Nothing stirs here.')
      + (guarding() ? `<br><span class="guard">guard up — half of any blow is turned aside</span>` : '')
      // The stairways the level's own art marks, when the player is standing at one: the
      // original's way up and down is walking into it, and a player who cannot see that
      // presses `E` and is told where it leads instead.
      + (stairHint() ? `<br><span class="stair">${stairHint()}</span>` : '')
      + (dbg.inWater === 'wet'
        ? '<br><span class="water">you are wading — water is slow to cross</span>'
        : dbg.inWater === 'lava'
          ? `<br><span class="lava">the lava is burning you — ${LAVA_DAMAGE_PER_SECOND} health a second</span>`
          : '')
      // The weapon is a picture in the first person, and a picture this install may not have:
      // a flail or a bow is drawn from a `.CIF` Arena did not ship here, which the player is
      // told rather than left wondering why their hand is empty (see `game/weaponView.js`).
      + (weaponMissing
        ? `<br><span class="hint">this install has no ${escapeHtml(weaponMissing)} — a drawn ${escapeHtml(weaponName(weaponRig.weapon).toLowerCase())} has no first-person art</span>`
        : view === 'first' && weaponRig.drawn
          ? `<br><span class="hint">${escapeHtml(weaponRig.file)} ${escapeHtml(weaponRig.state)}${weaponRig.direction ? ` (${escapeHtml(weaponRig.direction)})` : ''} — V for the third person</span>`
          : '')
      + `<br><span class="hint">F or click to strike · B / right-click to block or parry · Q roll · I pack · C spellbook · Z cast · V ${view === 'third' ? 'first' : 'third'} person</span>`
      + `<br><span class="hint">${HIT_FORMULA_NOTE} ${BLOCK_NOTE}</span>`;
    el.classList.add('on');
    // The guard line is written on events, so a guard raised mid-fight shows up as soon
    // as anything else changes; this is the cheap nudge that makes it show up when the
    // player raises it and nothing else is happening.
    dbg.guard = guarding();
  }

  /**
   * The first-person weapon as a test and the HUD see it.
   *
   * `file` is the sheet Arena's own table names for the weapon in hand and `loaded` what this
   * install actually gave up (they differ for a flail or a bow, which ship no art here);
   * `frame` is the image index the rig is showing, and `onScreen` is where the last painted
   * frame was drawn, in CSS pixels.
   */
  function weaponViewReport() {
    return {
      weapon: weaponRig.weapon,
      name: weaponName(weaponRig.weapon),
      family: weaponRig.family,
      file: weaponRig.file,
      loaded: weaponLoaded,
      missing: weaponMissing,
      state: weaponRig.state,
      direction: weaponRig.direction,
      frame: weaponRig.frame,
      drawn: view === 'first' && weaponRig.drawn,
      sheetFrames: [...weaponArt.keys()].sort((a, b) => a - b),
      onScreen: weaponOnScreen,
    };
  }

  /**
   * How many pixels of the weapon layer are painted right now, read back from the canvas.
   *
   * This is the check that the art is really on the screen and not merely selected: a
   * transparent layer is 0 whatever the state machine says.
   *
   * @returns {{pixels: number, bounds: {x:number,y:number,w:number,h:number}|null, colors: number}}
   */
  function weaponPixels() {
    const el = document.getElementById('weapon');
    if (!el || !el.width || !el.height) return { pixels: 0, bounds: null, colors: 0 };
    const { data: rgba } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    let pixels = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const seen = new Set();
    for (let i = 0; i < rgba.length; i += 4) {
      if (!rgba[i + 3]) continue;
      pixels++;
      const at = i / 4;
      const x = at % el.width;
      const y = Math.floor(at / el.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      seen.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    }
    if (!pixels) return { pixels: 0, bounds: null, colors: 0 };
    return { pixels, colors: seen.size, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
  }

  // The level that is already standing gets its population now: `loadLevel` ran before
  // this block, and every name above is in scope from here on.
  await populate(current);

  /**
   * What this place says when you arrive.
   *
   * A city-state gets the greeting `citytxt` files under its own index
   * (`arenaText.cityTextKey`); a dungeon gets `dungeon.txt`'s entry for its name.
   * Nothing is shown when the data has no words for a place — an invented greeting
   * would be worse than none.
   */
  function arrivalText() {
    if (!place || !world) return null;
    if (place.kind !== 'dungeon') {
      const cities = world.locations.filter((l) => l.provinceID === place.provinceID && l.kind === 'city');
      const cityIndex = cities.findIndex((c) => c.name === place.name);
      const greeting = cityIndex >= 0 ? library.cityGreetings.get(cityTextKey(place.provinceID, cityIndex)) : null;
      if (!greeting) return null;
      return { title: place.name, text: greeting.text, source: 'Arena: citytxt' };
    }
    const intro = library.dungeonIntros.get(place.name.toLowerCase());
    if (!intro) return null;
    return { title: intro.name, text: intro.text, source: 'Arena: dungeon.txt' };
  }

  /**
   * Every walkable cell of a level, deepest first.
   *
   * Arena puts a Staff piece in a particular room that `A.EXE` names, which is not in
   * the data this project has (D11). Depth from the spawn is derived instead, from
   * the level the player is actually standing in: a breadth-first walk over the
   * walkable cells, and the cells ordered by how far away they are. It is the same
   * answer a player would give if asked where the heart of a dungeon is, and it is
   * the only place a pickup can go that is guaranteed to be *reachable* — a piece
   * walled off behind an undecoded door would make the quest unfinishable. Logged as
   * S22 in PROGRESS.md.
   *
   * The whole ordering, not just its first cell, is what the finale needs: the Jewel
   * of Fire's cell and the mithril key that opens it lie in two different rooms, and
   * the second is chosen as the deepest cell far enough away from the first.
   *
   * @param {object} level a decoded level
   * @returns {{order: {x: number, z: number, depth: number}[], cells: number}}
   *   `order` is deepest-first; `cells` is how many cells are reachable at all
   */
  function deepestCells(level) {
    // The grid's own convention, taken from the mesh builder: `row` is world **x**
    // and `col` is world **z**, so a cell is `cells[x * width + z]`, x runs over
    // `depth` and z over `width`. Getting this backwards is not visible on a square,
    // centred level (`START.MIF`, and every dungeon's first floor) — it only shows on
    // the off-centre ones, which is how it was caught.
    const { width, depth } = level;
    const at = (x, z) => (x < 0 || z < 0 || x >= depth || z >= width ? null : level.cells[x * width + z]);
    // A wall is the only thing a player cannot cross. Doors open, chasms are jumped
    // (`Space`), raised platforms are stepped onto, entity flats are decorations. A
    // flood that stopped at a door would leave most of a dungeon "unreachable" and
    // could put the objective behind one.
    const walkable = (cell) => Boolean(cell) && cell.kind !== 'wall';
    const start = {
      x: Math.min(depth - 1, Math.max(0, Math.floor(level.spawn.x))),
      z: Math.min(width - 1, Math.max(0, Math.floor(level.spawn.z))),
    };
    if (!walkable(at(start.x, start.z))) return { order: [], cells: 0 };
    const seen = new Uint8Array(width * depth);
    const queue = [{ ...start, depth: 0 }];
    seen[start.x * width + start.z] = 1;
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = here.x + dx;
        const nz = here.z + dz;
        if (nx < 0 || nz < 0 || nx >= depth || nz >= width) continue;
        const index = nx * width + nz;
        if (seen[index] || !walkable(at(nx, nz))) continue;
        seen[index] = 1;
        queue.push({ x: nx, z: nz, depth: here.depth + 1 });
      }
    }
    // Deepest first, and by cell index within a depth so the answer is stable: the
    // same level must always put the piece in the same room.
    const order = queue
      .map(({ x, z, depth: d }) => ({ x, z, depth: d }))
      .sort((a, b) => (b.depth - a.depth) || (a.x - b.x) || (a.z - b.z));
    return { order, cells: queue.length };
  }

  /**
   * The deepest reachable cell, which is where a Staff piece is kept.
   *
   * @param {object} level
   * @returns {{x: number, z: number, depth: number, cells: number}|null} in cells
   */
  function deepestCell(level) {
    const walk = deepestCells(level);
    const first = walk.order[0];
    return first ? { ...first, cells: walk.cells } : null;
  }

  /**
   * The Imperial Palace's two rooms, on its bottom level.
   *
   * UESP's walkthrough of the finale puts the Jewel of Fire in a **magically locked
   * cell** on the fourth and final level, and the mithril key that opens it in a room
   * on the same island — two separate chambers, which is the one thing about the
   * finale a player cannot miss. The rooms' own positions (UESP gives the key at
   * `26,25` and the Jewel at `20,24`) do not survive into the `.MIF` this project
   * ships and decodes: that level's cells hold no chasm at all, so the lava lake the
   * walkthrough describes is not in this map, and the coordinates would name a wall.
   * Rather than pretend, the two chambers are derived from the level: the deepest
   * reachable cell is the Jewel's, and the key lies in the deepest cell at least
   * `FINALE_CHAMBER_GAP` cells away from it. Logged as S24 in PROGRESS.md.
   *
   * @param {object} level
   * @returns {{key: object, jewel: object, cells: number}|null}
   */
  function finaleChambers(level) {
    const walk = deepestCells(level);
    const jewel = walk.order[0];
    if (!jewel) return null;
    const key = walk.order.find((cell) => (
      Math.abs(cell.x - jewel.x) + Math.abs(cell.z - jewel.z) >= FINALE_CHAMBER_GAP
    )) ?? jewel;
    return {
      key: { ...key, cells: walk.cells },
      jewel: { ...jewel, cells: walk.cells },
      cells: walk.cells,
    };
  }

  /**
   * What the player is here to do, if anything.
   *
   * The main quest and the side work are asked the same question — "is the thing I
   * want in the place you are standing in?" — and the answer is one event, at one
   * cell. The event names are the state machines' own, so nothing here can invent a
   * transition the machines would refuse.
   */
  function objectiveHere() {
    const stage = chain.stages[quest.step] ?? null;
    const here = place ? place.name.toLowerCase() : null;
    const same = (name) => typeof name === 'string' && here !== null && name.toLowerCase() === here;

    // The opening dungeon is a bare map file, not a `CITYDATA` location — Arena
    // ships it as `START.MIF` beside the game rather than among its provinces — so
    // it is recognised by its *filename* while every other stage is recognised by
    // the name the player travelled to.
    if (stage?.kind === 'escape' && mapName.toUpperCase() === stage.mif.toUpperCase()) {
      return { owner: 'main', event: 'escaped', what: 'the way out of the Imperial Dungeons' };
    }

    // ── the finale ────────────────────────────────────────────────────────────
    //
    // Checked before the `place` test, exactly like the escape: the palace is a loose
    // `.MIF` beside the game (`IMPPAL.MIF`) rather than a `CITYDATA` location, so a
    // scene standing in it has no `place` and the branch below this one would never be
    // reached. Three beats, in the order Arena's walkthrough has them, all three on the
    // bottom level: the mithril key, the Jewel of Fire it unlocks, then the Emperor's
    // freedom. The cell each happens in comes from `finaleChambers`, so the key and the
    // Jewel are never the same room.
    if (stage?.kind === 'finale' && !quest.ended && mapName.toUpperCase() === stage.mif.toUpperCase()) {
      if (current.index !== levelCount - 1) return null;
      const chambers = finaleChambers(current.level);
      if (!chambers) return null;
      if (!quest.mithrilKey) return { owner: 'main', event: 'mithrilKey', what: 'the mithril key', cell: chambers.key };
      if (!quest.hasKeyItem) return { owner: 'main', event: 'jewelOfFire', what: 'the Jewel of Fire', cell: chambers.jewel };
      return { owner: 'main', event: 'won', what: 'the Emperor\'s freedom', cell: chambers.jewel };
    }

    if (!place) return null;

    if (stage?.kind === 'piece') {
      if (!quest.mapKnown && same(stage.clue?.title)) {
        return { owner: 'main', event: 'foundClue', what: `the map to ${stage.title}` };
      }
      if (quest.mapKnown && same(stage.title)) {
        return { owner: 'main', event: 'foundPiece', what: `piece ${stage.piece} of the Staff of Chaos` };
      }
    }

    const active = radiant.active;
    if (active && active.kind !== 'slay' && !active.completed && same(active.target)) {
      const event = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[active.kind] ?? null;
      return event ? { owner: 'side', event, what: active.subject } : null;
    }
    return null;
  }

  /**
   * The arrival panel and the objective, rebuilt for the level now loaded.
   *
   * A stage may name its own cell (`wanted.cell`), which is how the finale's key and
   * Jewel end up in two different rooms; everything else takes the level's deepest
   * reachable chamber.
   */
  function refreshObjective() {
    const wanted = objectiveHere();
    const deep = wanted?.cell ?? (current.level ? deepestCell(current.level) : null);
    current.objective = wanted && deep
      ? { ...wanted, cellX: deep.x, cellZ: deep.z, depth: deep.depth, cells: deep.cells, done: false }
      : null;
    updateObjectiveHud();
    return current.objective;
  }

  /**
   * What the palace says when the player is in it but not yet at its bottom.
   *
   * The finale happens on the fourth and final level (UESP's walkthrough), and the
   * only way down is the `]` key — so a player who arrives at the gate of the palace
   * and finds nothing to do has to be told where to go, in the game's voice.
   *
   * @returns {string|null}
   */
  function descentHint() {
    if (!questReady) return null;
    const stage = chain.stages[quest.step] ?? null;
    if (stage?.kind !== 'finale' || quest.ended) return null;
    if (mapName.toUpperCase() !== stage.mif.toUpperCase()) return null;
    if (current.index >= levelCount - 1) return null;
    return `Somewhere below this floor is the Jewel of Fire — ] descends (you are on level ${current.index + 1} of ${levelCount}).`;
  }

  /**
   * The HUD's own lines: what is here to be taken, how far off it is, and — in the
   * palace — which way down.
   */
  function updateObjectiveHud() {
    if (!hud || !current) return;
    const lines = [];
    const objective = current.objective;
    if (objective && !objective.done) {
      const dx = motorCell(current, objective).x;
      const dz = motorCell(current, objective).z;
      // **“The the way out…”** — every `what` is already a noun phrase with its article (`the
    // mithril key`, `the map to Stonekeep`), so the line capitalises it rather than prefixing
    // another "The": the objective panel read "The the way out of the Imperial Dungeons lies
    // 110 paces from here" for every objective in the game.
    const what = String(objective.what ?? 'objective');
    lines.push(`${what[0].toUpperCase()}${what.slice(1)} lies ${Math.round(Math.hypot(dx, dz))} paces from here — find the deepest chamber, then press E.`);
    } else if (objective?.done) {
      lines.push('Taken. Nothing else waits here.');
    }
    // A job somebody in the street gave the player: where to go, and where to be paid. It is
    // on the level HUD because work in hand is the one thing a player should not have to open
    // the map to remember (`radiantObjective`, the same line the journal carries).
    const side = radiantObjective(radiant);
    if (side) lines.push(side);
    const hint = descentHint();
    if (hint) lines.push(hint);
    // The doorway: the one line that tells a player a building can be walked into. It is
    // the *sign* that is announced, because the sign is what the game itself draws over
    // the door (`game/shops.js`) — and it is only up while the player is in the doorway.
    const found = doorNear();
    if (found) {
      lines.push(`The sign over this door says ${found.door.name} — press E to go in.`);
    } else if (current.doors?.length) {
      lines.push(`${current.doors.length} shop doors in this ${cityRequest?.kind ?? 'city'}; the sign is over each one.`);
    }
    // A dungeon's own door: what it is, whether it is locked, and how hard the lock is
    // (`game/doors.js`). Only up while the player stands at it, like the doorway line.
    const leaf = leafNear();
    if (leaf) lines.push(doorLine({ ...leaf, open: leaf.open > 0.5 }));
    // What the map's item flats left lying about: a key, a chest, a treasure, a corpse.
    const ground = lootNear();
    if (ground) lines.push(`On the floor here: ${ground.name}. Press E to take it.`);
    else {
      const left = (current.loot ?? []).filter((spot) => !spot.taken);
      if (left.length) lines.push(`${left.length} of the map's own things still lie in this level.`);
    }
    const carriedKeys = (player?.keys ?? []).length;
    if (carriedKeys) lines.push(`${carriedKeys} key${carriedKeys === 1 ? '' : 's'} in the pack.`);
    // The gate: the way out of a city and the way into one. Up while the player stands
    // in the gap in the wall, like the doorway line above.
    const gate = gateAtPlayer();
    if (gate) {
      lines.push(gate.to === 'wilderness'
        ? `You are standing in ${place?.name ?? 'the'} gate — press E to walk out into the wilds.`
        : `This is ${place?.name ?? 'the city'}'s ${gate.axis} gate — press E to enter the city.`);
    } else if (current.city && current.gateHint !== false) {
      lines.push(`The wall has gates on ${cityGateSides().join(' and ') || 'no'} side${cityGateSides().length === 1 ? '' : 's'} — press E in one to leave the city.`);
    }
    if (exitCell) {
      const toDoor = atObjective({ cellX: exitCell.row, cellZ: exitCell.col }).distance;
      lines.push(toDoor <= DOOR_REACH
        ? `You came in by the door here — press E to step back out to ${fromPlace?.name ?? 'the street'}.`
        : `The street door is ${Math.round(toDoor)} paces behind you — press E on it to leave.`);
    }
    // The town's own clock and its people (`game/livingWorld.js`): the hour, which trades are
    // open, and what the person nearest is about. Read rather than simulated — the same clock
    // `enterDoor` refuses a door with.
    for (const line of livingLines()) lines.push(line);
    if (townsfolk.length) {
      // **How many are *about*, not how many the town holds.** Since the day can put somebody
      // indoors (`stepTownsfolk`'s rest branch), a line counting the roster would promise a
      // street full of people at midnight; the count the player is owed is the one they can see.
      const about = townsfolk.filter((person) => !person.atHome);
      const indoors = townsfolk.length - about.length;
      lines.push(townsfolk.length === 1 && townsfolk[0].shop
        ? `${townsfolk[0].description} keeps this place; press T to speak.`
        : `${about.length} ${about.length === 1 ? 'person is' : 'people are'} about${indoors ? `, ${indoors} indoors` : ''}; press T to speak to whoever is nearest.`);
    }
    hud.textContent = (current.hudBase ?? '') + lines.map((line) => `\n${line}`).join('');
  }

  /**
   * Keep the HUD's doorway line honest as the player walks.
   *
   * The HUD is rebuilt on *events*, not every frame, so this notices when the nearest door
   * changes and rebuilds then — a handful of times across a city rather than sixty times a
   * second. Without it the "press E to go in" line would only appear when something else
   * happened to redraw the HUD, which is to say almost never.
   *
   * @returns {boolean} whether the nearest door changed
   */
  function refreshNearDoor() {
    const found = doorNear();
    const key = found ? `${found.door.row},${found.door.col}` : null;
    // …and the same for the way *out* of a building: "press E to step back out" has to
    // appear as the player walks back to the door, not only if something else redraws.
    const atExit = Boolean(exitCell) && atObjective({ cellX: exitCell.row, cellZ: exitCell.col }).distance <= DOOR_REACH;
    // …and for the gate in the wall, which appears and disappears the same way.
    const atGate = Boolean(gateAtPlayer());
    if (key === dbg.nearDoor && atExit === dbg.atExit && atGate === dbg.atGate) return false;
    dbg.nearDoor = key;
    dbg.nearDoorKind = found ? found.door.kind : null;
    dbg.atExit = atExit;
    dbg.atGate = atGate;
    updateObjectiveHud();
    return true;
  }

  /** Is the player standing close enough to take this objective? */
  function atObjective(objective) {
    if (!objective) return false;
    const dx = current.motor.pos[0] / CELL_SIZE - 0.5 - objective.cellX;
    const dz = current.motor.pos[2] / CELL_SIZE - 0.5 - objective.cellZ;
    return { distance: Math.hypot(dx * CELL_SIZE, dz * CELL_SIZE) };
  }

  /**
   * `E` — take whatever is here, walk through the doorway, or say that neither is.
   *
   * The order is the order a player means: the thing the quest sent them for first, then
   * the door they are standing in. A pickup is only allowed within a couple of cells of
   * the objective, so the journey has to actually be made; and the state machines get the
   * final word on whether the event was legitimate.
   */
  async function interact() {
    const objective = current.objective ?? refreshObjective();
    if (objective && !objective.done && atObjective(objective).distance <= 3) return takeObjective(objective);
    // ── the stairway ───────────────────────────────────────────────────────────
    // The walls the level's own `*LEVELUP`/`*LEVELDOWN` art marks: up to the floor above
    // (or, from the top, out of the place), down to the floor below. Checked before the
    // street doors, because inside a building the stair is the thing the player means.
    const stair = stairNear();
    if (stair) {
      await useStair(stair);
      return true;
    }
    // ── the gate ───────────────────────────────────────────────────────────────
    // Standing in a settlement's gate: `E` leaves the city for the country, or enters
    // the city from it. Checked before the doors, because a gate is not a doorway and
    // the ring has no shops in it.
    const gate = gateAtPlayer();
    if (gate) {
      crossGate(gate, gate.to === 'wilderness');
      return true;
    }
    // ── the doors ──────────────────────────────────────────────────────────────
    // In a city, an `E` in a shop's doorway walks in; inside a building, an `E` on the
    // street cell they came in by walks back out (see `enterDoor`/`leaveDoor`).
    if (exitCell && current.index === startIndex && atObjective({
      cellX: exitCell.row, cellZ: exitCell.col,
    }).distance <= DOOR_REACH) {
      leaveDoor();
      return true;
    }
    const found = doorNear();
    if (found) {
      enterDoor(found.door);
      return true;
    }
    // ── a dungeon's own door, and what the map left on the floor ────────────────
    // The `0xB` doors of the level (`game/doors.js`), then the item flats the map
    // placed — a key, a chest, a treasure, a corpse (`game/dungeonItems.js`). Both are
    // only reachable in a place the mesher made doors for, so a city street is
    // untouched by this and a dungeon is no longer a maze of walls with door art.
    const leaf = leafNear();
    const ground = lootNear();
    // A key at the player's feet wins over a door two metres away. Otherwise the
    // door consumes E forever and the key that opens it can never be picked up.
    if (ground && (!leaf || ground.distance < leaf.distance)) return takeLoot(ground);
    if (leaf) return useLeaf(leaf);
    if (ground) return takeLoot(ground);
    if (objective && !objective.done) {
      showNotice(`You are not there yet — ${Math.round(atObjective(objective).distance)} paces from ${objective.what}.`, 1400);
      return false;
    }
    if (exitCell) {
      const back = Math.round(atObjective({ cellX: exitCell.row, cellZ: exitCell.col }).distance);
      showNotice(`The street door is behind you — ${back} paces back to it.`, 1600);
      return false;
    }
    showNotice('There is nothing here to take.', 1400);
    return false;
  }

  /** Take the thing `E` is standing on, once it is close enough. */
  async function takeObjective(objective) {
    if (objective.owner === 'main') {
      const result = applyQuestEvent(quest, objective.event, { chain });
      if (!result.ok) { showNotice(result.reason, 2000); return false; }
      quest = result.state;
      saveQuestState(quest);
      // The last event of all is not a pickup: the Emperor is free, and the game is
      // over, so it gets the install's closing movie and then a page of its own
      // instead of a line on the notice bar. The page is awaited so the movie is
      // *finished* before it appears — and `dbg.ending` is set by the page, so a
      // scripted run that skips the movie sees the same ending it always did.
      if (quest.ended) void showEndingMovie().then((played) => showEndingPanel(played));
      else {
        showNotice(`Taken: ${objective.what}.\n\n${currentObjective(quest, chain)}`, 6000);
        // …and a beat that Arena answers with a vision gets one: the world stops and the
        // install's own movie plays (`playStoryMovie`), with the notice still under it.
        void maybeStoryMovie(objective.event);
      }
    } else {
      const result = applyRadiantEvent(radiant, objective.event, { where: place?.name });
      if (!result.ok) { showNotice(result.reason, 2000); return false; }
      radiant = result.state;
      saveRadiantState(radiant);
      showNotice(`Done: ${radiant.active?.title ?? 'the job'}.\n\n${radiantObjective(radiant) ?? ''}`, 6000);
    }
    objective.done = true;
    // Look again *now*: taking one thing can put the next in front of the player in
    // the same level — the finale's mithril key opens the Jewel's cell, and the Jewel
    // ends the quest — and an objective that stayed "done" would leave them with
    // nothing to do and no objective line to say so. Caught by `mainquest`.
    refreshObjective();
    return true;
  }

  /** A short line on the HUD, in the game's voice. */
  function showNotice(text, ms) {
    const el = document.getElementById('notice');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => el.classList.remove('on'), ms ?? 3000);
    dbg.notice = text;
  }

  /**
   * The ending: the Emperor's own words, and what the player did to earn them.
   *
   * Arena ends on its own cutscene (`END01.FLC`), and the panel below now *follows* that movie
   * rather than standing in for it (`showEndingMovie`). The record underneath is the player's
   * own: the character, the level they reached, the kills, the purse and the days the journey
   * took. It is the one place in the game that looks backward, and it should state only what
   * actually happened in this save.
   */
  /**
   * The last thing the game does: **Arena's own closing movie**, then the page.
   *
   * The ending panel used to say, in its own words, that "the cutscene itself (`END01.FLC`)
   * is not decoded". It is now: the install's 320×200 animation plays over the world (any
   * key skips it), and only then does the written scene appear — the Emperor's words and the
   * record of what this player actually did. A page whose install ships no such file still
   * ends, silently and honestly: `showMovie` answers `played: false` and this returns.
   */
  async function showEndingMovie() {
    return playStoryMovie('END01.FLC');
  }

  /**
   * The main quest's own movies, by the event that earns them.
   *
   * The mapping is **this project's reading**, like the catalogue's `beat` column: the escape
   * from the Imperial Dungeons is where Arena first shows the player a vision (`VISION.FLC`),
   * and the ending's own movie is wired separately above. Nothing here claims to be the
   * original's jump table — `A.EXE` holds that, and this data set does not ship it (D11) — so
   * it is named as a decision rather than as a fact.
   */
  const STORY_MOVIES = { escaped: 'VISION.FLC' };

  /**
   * Play the movie one of the main quest's events earns, if it has one.
   * @param {string} event the quest event that just landed
   */
  function maybeStoryMovie(event) {
    const name = STORY_MOVIES[event];
    if (!name) return null;
    return playStoryMovie(name);
  }

  /**
   * Play one of the install's movies as a **story beat**: the world stops for it.
   *
   * A cutscene is not a panel — the player cannot swing at a monster, walk into a corridor or
   * open the map while 1994 is playing over the screen, and the world's own clock stops
   * (`life.paused`, the switch the menu uses). The keys the player was holding are dropped,
   * exactly as the menu drops them, so the walk does not begin the moment the movie ends.
   * A pause that was already standing is left standing, the same courtesy the menu pays.
   *
   * @param {string} name a `.FLC` name
   * @returns {Promise<{played: boolean, skipped: boolean, frames: number, file: string|null,
   *   reason: string|null}>} `played: false` when the install does not ship the movie
   */
  async function playStoryMovie(name) {
    const state = { name, played: false, skipped: false, frames: 0, file: null, reason: null };
    let showMovie = null;
    try {
      ({ showMovie } = await import('./cutscenePlayer.js'));
    } catch (err) {
      state.reason = String(err?.message ?? err);
      dbg.movie = { ...state };
      return state;
    }
    const wasPaused = life.paused;
    moviePlaying = true;
    keys.clear();
    pressed.clear();
    life.paused = true;
    try {
      const played = await showMovie(name, {
        source,
        arenaPath: source?.arenaPath ?? params.get('arena') ?? null,
        status: (text) => showNotice(text, 1200),
        onState: (live) => { dbg.movie = { ...live }; },
      });
      // The beat's outcome **and the player's own final state**: `done`, `framesDrawn` and the
      // pacing live in the latter, and a summary without them left the seam claiming a movie
      // that had already played was still playing (measured: `mainquest` waiting fifteen polls
      // for a `done` that had already happened).
      Object.assign(state, {
        played: played.played,
        file: played.file ?? state.file,
        reason: played.reason ?? state.reason,
        ...(played.state ?? {}),
        frames: played.frames,
        skipped: played.skipped,
        state: played.state,
      });
    } catch (err) {
      state.reason = String(err?.message ?? err);
    } finally {
      moviePlaying = false;
      if (!wasPaused) life.paused = false;
      // Every path through here answers a **finished** beat: a movie that could not be read
      // (`reason`) and a beat that never got as far as a player are both done, so a caller
      // waiting on `dbg.movie.done` is never left waiting for something that already happened.
      state.done = true;
      state.playing = false;
      if (typeof state.framesDrawn !== 'number') state.framesDrawn = state.frames ?? 0;
      dbg.movie = { ...(dbg.movie ?? {}), ...state };
    }
    return state;
  }

  function showEndingPanel(played) {
    const el = document.getElementById('ending');
    if (!el) return null;
    const character = loadCharacter();
    const days = radiant.day ?? 0;
    const lines = [
      'Jagar Tharn: "You must not! The jewel holds my lifeforce!"',
      'Emperor Uriel Septim VII: "Thou art truly a child of the Empire. I thank thee for thy assistance. From this day forth, thou art named Eternal Champion. Arise my Champion, and take thy rightful place at my side."',
    ];
    const record = [
      `<b>${character?.name ?? player.name}</b>, ${character?.className ?? player.className ?? 'adventurer'} of level ${character?.level ?? player.level ?? 1}`,
      `${kills} slain · ${xp} experience · ${character?.gold ?? player.gold ?? 0} gold`,
      `The Staff of Chaos, whole, in ${quest.pieces}/8 pieces recovered`,
      days ? `${days} days from the Imperial Dungeons to the throne room` : 'The road was short, and the deed is done',
    ];
    const movieLine = played?.played
      ? `Arena\'s closing movie (${played.file}) played above, from the install\'s own art${played.skipped ? ', skipped' : `, ${played.frames} frames of it`}`
      : `Arena\'s closing movie (END01.FLC) is not in this install${played?.reason ? ` — ${played.reason}` : ''}`;
    el.innerHTML = '<h2>The Eternal Champion</h2>'
      + lines.map((line) => `<p class="quote">${wrapText(line, 62).join('<br>')}</p>`).join('')
      + '<div class="record">' + record.map((line) => `<p>${line}</p>`).join('') + '</div>'
      + `<p class="src">Arena\'s closing scene, in its own words (UESP transcription) · ${movieLine}</p>`
      + '<p class="hint">Press any key to stand in the throne room, or M for the world map.</p>';
    el.classList.add('on');
    dbg.ending = true;
    return { title: 'The Eternal Champion', lines, record };
  }

  /** Put the arrival text up, and let it sit until the player moves on. */
  function showArrival() {
    const arrival = arrivalText();
    const el = document.getElementById('arrival');
    if (!el || !arrival) return null;
    el.innerHTML = `<h2>${arrival.title}</h2>`
      + wrapText(arrival.text, 58).map((line) => `<p>${line}</p>`).join('')
      + `<p class="src">${arrival.source}</p>`;
    el.classList.add('on');
    return arrival;
  }

  const arrival = showArrival();
  refreshObjective();

  // ── input ──────────────────────────────────────────────────────────────────
  /**
   * `M` — the world map, drawn **over this page**.
   *
   * The map used to be a page of its own (`?map`), and that is where one of the
   * player's reports came from: a folder chosen with the browser's picker is a File
   * System Access *handle*, which cannot travel through a URL, so the map page could
   * not read Arena's data and asked for the folder again — every time. `bootWorldMap`
   * now has an overlay mode: it draws into the same `#map` layer over the running game
   * and a click on a marker hands the location back here, where the scene is rebuilt
   * in place with the *same* source. The whole journey — the map, the choice, the
   * arrival — happens without a page load.
   */
  async function openWorldMap() {
    if (mapScene || life.mapOpen) return mapScene;
    life.mapOpen = true;
    try {
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
        name: place?.name ?? mapName,
        dungeon: place?.kind === 'dungeon',
      }));
    } catch { /* ignoring storage is fine; the map falls back to the continent's centre */ }
    const { bootWorldMap } = await import('./worldmap.js');
    mapScene = await bootWorldMap(canvas, renderer, params, status, source, {
      overlay: true,
      onTravel: (location) => {
        closeWorldMap();
        const promise = travelTo(location);
        dbg.travel = { to: location.name, kind: location.kind, promise };
        return true;
      },
      onClose: () => { life.mapOpen = false; mapScene = null; },
    });
    dbg.mapOpen = true;
    return mapScene;
  }

  /** Put the world map away, leaving the game exactly where it was. */
  function closeWorldMap() {
    const scene = mapScene;
    mapScene = null;
    life.mapOpen = false;
    dbg.mapOpen = false;
    if (scene) scene.close();
    return true;
  }

  /**
   * Fast travel, in the same page.
   *
   * A destination is the URL a page load would have used — `?location=`, `?dungeon=` or
   * the palace's `?interior=IMPPAL.MIF` — except that it is handed back to `bootInterior`
   * instead of to the browser, so the picked folder survives. Days have already passed
   * inside the map (`travel()`), and the quest, the character and the job board all live
   * in `localStorage`, so the new scene picks them up untouched.
   *
   * @param {object} location a marker from the world map
   */
  async function travelTo(location) {
    const next = new URLSearchParams();
    if (location.kind === 'palace') next.set('interior', 'IMPPAL.MIF');
    else if (location.kind === 'dungeon') next.set('dungeon', location.name);
    else next.set('location', location.name);
    const folder = source?.arenaPath ?? params.get('arena') ?? null;
    if (folder) next.set('arena', folder);
    dbg.travelling = { to: location.name, kind: location.kind, query: next.toString() };
    // `goInPlace` disposes the scene that is standing (this one) before it builds — the
    // same exit a scene gets when another replaces it — and keeps the picked folder.
    await goInPlace(next);
    return { name: location.name, kind: location.kind };
  }

  addEventListener('keydown', (e) => {
    // A story movie owns the keyboard while it is up: its own skip listener is on `window`,
    // and the world behind it gets nothing — no swing, no step, no map. (The ending's own
    // movie is skipped with the key that skips it, not by opening the pause menu behind it.)
    if (moviePlaying) return;
    // The world map is a layer over this page, so its keys are its own while it is up:
    // `F` must not swing at a monster behind the map, and `M` is the map's own close key.
    if (life.mapOpen) return;
    // …and the menu is a layer too, with exactly one key of its own: while it is up the
    // world gets nothing but the Escape that closes it, so a swing or a step cannot be
    // queued up behind a panel the player is reading.
    if (life.menuOpen && e.code !== 'Escape') return;
    if (!e.repeat && !keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'BracketRight') void descend(1);
    if (e.code === 'BracketLeft') void descend(-1);
    if (e.code === 'KeyM') void openWorldMap();
    if (e.code === 'KeyE' && !e.repeat) void interact();
    if (e.code === 'KeyR' && !e.repeat) restHere();
    if (e.code === 'KeyQ' && !e.repeat) startRoll();
    // B is the guard's own key, and pressing it is also the parry's press.
    if (e.code === 'KeyB' && !e.repeat) startParry();
    if (e.code === 'KeyF') { const blow = strike(); dbg.lastStrike = blow; }
    if (e.code === 'KeyV') setView(view === 'third' ? 'first' : 'third');
    // `I` the pack and `C` the spellbook are two pages of **one** panel (`toggleInventory`),
    // and the key of the page already on screen puts the panel away — which is what a player
    // expects of the key that opened it.
    if (e.code === 'KeyI') openBag();
    if (e.code === 'KeyC') void openSpellbook();
    // ── the level-up (`game/progression.js`) ──────────────────────────────────
    // Arena's own allocation: a number key per attribute, and the level is taken when the
    // player says so. Checked **before** the rest, so a `1` cannot also be a hotbar key later,
    // and deliberately not blocking movement: a player who is being hit while they decide can
    // still run, which is the one thing a modal in a live dungeon should not take away.
    if (levelUp && /^Digit[1-8]$/.test(e.code)) { placeLevelPoint(Number(e.code.slice(5)) - 1); return; }
    if (levelUp && (e.code === 'Enter' || e.code === 'NumpadEnter')) { takeLevel(); return; }
    // `L` brings the panel back after it was postponed, and says what is waiting otherwise.
    if (e.code === 'KeyL') {
      if (levelUp) renderLevelUp();
      else {
        const due = pendingLevels(player);
        showNotice(due > 0 ? `${due} level${due === 1 ? '' : 's'} owed — press L to place the points.` : 'Nothing is owed.', 2200);
      }
    }
    // `Z` casts again without opening anything: the spellbook is where a spell is chosen, and
    // a fight is no place to be reading (`castSpell` with no argument casts the last one read).
    if (e.code === 'KeyZ') void castSpell();
    // `T` talks, and a second `T` asks the same person again rather than restarting.
    if (e.code === 'KeyT') talk();
    if (e.code === 'Escape') {
      // Escape backs out of whatever is up, and the menu is what it does when nothing is:
      // a player who wants out of a conversation should not be handed a menu on the way.
      const up = ['arrival', 'ending', 'talk', 'inventory', 'levelup']
        .some((id) => document.getElementById(id)?.classList.contains('on'));
      document.getElementById('arrival')?.classList.remove('on');
      document.getElementById('ending')?.classList.remove('on');
      closeTalk();
      toggleInventory(false);
      // Postponed, not discarded: the points stay in `levelUp` and `L` brings the panel back,
      // so `Escape` is a way to keep playing rather than a way to lose a level's points.
      if (levelUp) document.getElementById('levelup')?.classList.remove('on');
      if (!up) toggleMenu();
      else toggleMenu(false);
    }
    if (document.pointerLockElement !== canvas) requestLook(canvas);
  }, { signal });
  // The arrival panel is a page, not a wall: the first move dismisses it.
  addEventListener('keydown', () => document.getElementById('arrival')?.classList.remove('on'), { once: false, signal });
  addEventListener('keyup', (e) => keys.delete(e.code), { signal });
  addEventListener('blur', () => keys.clear(), { signal });
  /**
   * Change level, and bring its own population with it.
   *
   * @param {number} delta  +1 down, −1 up, clamped to the map's levels
   */
  async function descend(delta) {
    const next = Math.max(0, Math.min(levelCount - 1, current.index + delta));
    if (next === current.index) return current;
    await loadLevel(next);
    await populate(current);
    refreshObjective();
    return current;
  }

  /**
   * First or third person.
   *
   * Arena is a first-person game and this project's default stays first person; the
   * third-person view is the one the engine's own Daggerfall build offers, and it is
   * what makes the player's own sprite (from Arena's `.CFA` people) visible at all.
   *
   * @param {'first'|'third'} next
   */
  function setView(next) {
    view = next === 'third' ? 'third' : 'first';
    dbg.view = view;
    // The weapon layer belongs to the first person; the third person draws the player's own
    // sprite instead (`liveBatches`), and `drawWeaponView` empties the overlay on the next
    // painted frame.
    updateCombatHud();
    return view;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  canvas.addEventListener('pointerdown', (e) => {
    if (moviePlaying || life.mapOpen || life.menuOpen) return;
    // Right button: the guard. The swing below is the left button's (and any non-right
    // press), because a player who blocks with the mouse still expects the left to hit.
    if (e.button === 2) { mouseGuard = true; startParry(); updateCombatHud(); return; }
    requestLook(canvas);
    // A click in the world is a swing, which is how a player expects to fight. It is
    // NOT gated on the pointer being locked: the first click is the one that asks for
    // the lock, so gating here made the very first swing do nothing — and a browser
    // that refuses pointer lock (or a headless one, which has no lock at all) could
    // never fight by mouse. Measured by `tests/run-browser.mjs combat`.
    // A press in the world *charges* the strike (xElden-ring Shape: the hold is the heavy).
    // The blow itself lands on `pointerup`, with the seconds held — so a tap is the light
    // swing the click always was, only a beat later, and a hold is the heavy.
    defence.charging = true;
    defence.chargeStart = dbg.seconds;
    defence.chargeHeld = Infinity;
  }, { signal });
  addEventListener('pointerup', (e) => {
    if (moviePlaying) return;
    if (e.button === 2 || mouseGuard) { mouseGuard = false; updateCombatHud(); return; }
    if (defence.charging) {
      defence.charging = false;
      defence.chargeHeld = Math.max(0, dbg.seconds - defence.chargeStart);
      const blow = strike({ held: defence.chargeHeld });
      dbg.lastStrike = blow;
      updateCombatHud();
    }
  }, { signal });
  addEventListener('mousemove', (e) => {
    if (moviePlaying) return;
    if (document.pointerLockElement !== canvas) return;
    lookFilter.add(e.movementX * lookScale(), -e.movementY * lookScale() * lookInvert());
  }, { signal });  // ── the debug seam ─────────────────────────────────────────────────────────
  Object.assign(window.__debug, {
    scene: 'interior',
    map: mapName,
    /** The place's own words, or null when Arena's data has none. */
    arrival: () => (arrival ? { title: arrival.title, text: arrival.text, source: arrival.source, shown: document.getElementById('arrival')?.classList.contains('on') ?? false } : null),
    /** What is here to be taken, where it is, and how far away it is. */
    objective: () => (current.objective
      ? {
        ...current.objective,
        paces: Math.round(Math.hypot(motorCell(current, current.objective).x, motorCell(current, current.objective).z)),
      }
      : null),
    /** Take it, exactly as `E` does. */
    interact: () => interact(),
    /** The main quest, as this scene sees it. */
    quest: () => ({
      step: quest.step,
      stage: chain.stages[quest.step]?.title ?? null,
      objective: currentObjective(quest, chain),
      pieces: quest.pieces,
      mapKnown: quest.mapKnown,
      mithrilKey: quest.mithrilKey,
      hasJewel: quest.hasKeyItem,
      ended: quest.ended,
      entries: quest.log,
    }),
    /** The ending, if it has been reached in this session or this save. */
    ending: () => ({
      reached: Boolean(quest.ended),
      shown: document.getElementById('ending')?.classList.contains('on') ?? false,
      text: document.getElementById('ending')?.textContent ?? null,
      movie: dbg.movie ?? null,
    }),
    /**
     * The install's movie a story beat is playing (or played), as the player reports it:
     * the file, its own frame count and delay, how many frames have been drawn, and whether
     * it was skipped. `null` when no beat has played a movie in this level visit.
     */
    movie: () => dbg.movie ?? null,
    /** The side work, as this scene sees it. */
    side: () => ({ active: radiant.active?.title ?? null, target: radiant.active?.target ?? null, objective: radiantObjective(radiant), day: radiant.day }),
    /**
     * Put the side work down, as the game's own `abandon` event does.
     *
     * Here for a test that needs a clean slate: the suites share one page, so a job accepted
     * by an earlier suite would otherwise follow the player into the street.
     */
    abandonJob: () => {
      const result = applyRadiantEvent(radiant, 'abandon', {});
      if (result.ok) {
        radiant = result.state;
        saveRadiantState(radiant);
        updateObjectiveHud();
      }
      return { ok: result.ok, reason: result.reason ?? null, active: radiant.active?.title ?? null };
    },
    // ── the fight ────────────────────────────────────────────────────────────
    // ── the people ───────────────────────────────────────────────────────────
    /** Who is standing in this settlement, and what the game says they wear. */
    townsfolk: () => townsfolk.map((person) => ({
      file: person.file,
      // **Whether their own day has them indoors right now** — the flag the draw skips them
      // with and the talk reach refuses them with. Reported so a reader can tell "nobody is
      // out" from "the scene stopped stepping them", which is D-01a's whole question.
      atHome: Boolean(person.atHome),
      armour: person.armour,
      description: person.description,
      cell: { row: person.place.row, col: person.place.col },
      world: { x: person.world.x, y: person.world.y, z: person.world.z },
      distance: Math.round(Math.hypot(person.world.x - feetOf()[0], person.world.z - feetOf()[2]) * 100) / 100,
      turn: person.talkTurn ?? 0,
      line: person.line ?? null,
      // Who they are to the world, and to the player (`game/regard.js`).
      regardId: person.regardId ?? null,
      regard: person.regardId ? regardOf(regard, person.regardId, radiant.day ?? 0) : 0,
      standing: person.regardId ? standingOf(regard, person.regardId, radiant.day ?? 0) : 'neutral',
      health: person.fighter?.health ?? null,
      fighter: person.fighter ? { level: person.fighter.level, damage: person.fighter.damage, agility: person.fighter.agility } : null,
    })),
    /** The ledger itself, as the journal and the tests read it. */
    regard: () => ({
      day: radiant.day ?? 0,
      tally: regardTally(regard, radiant.day ?? 0),
      people: peopleKnown(regard, radiant.day ?? 0, { min: 0, limit: 40 }),
    }),
    /** The guild ledger: memberships, titles, and the earned standing per guild. */
    guilds: () => ({
      day: radiant.day ?? 0,
      members: Object.entries(guilds.memberships ?? {})
        .filter(([, m]) => m && m.rank >= 0)
        .map(([id, m]) => ({ id, rank: m.rank, title: guildTitleOf(m, id) ?? null,
          probation: Boolean(m.probation), joinedOn: m.joinedOn ?? null, lastRankChange: m.lastRankChange ?? null })),
      standings: ['fighters', 'mages', 'thieves'].map((id) => ({ id, standing: guildStandingOf(guilds, id) })),
      standing: Object.fromEntries(['fighters', 'mages', 'thieves'].map((id) => [id, guildStandingOf(guilds, id)])),
      lastNotice: dbg.notice ?? null,
    }),
    /** The guild block the keeper shows, exactly as it is on screen. */
    guildPanel: () => {
      const el = document.getElementById('talk');
      const block = el?.querySelector('.job');
      return {
        shown: el?.classList.contains('on') ?? false,
        block: block?.querySelector('.offer')?.textContent ?? null,
        source: block?.querySelector('.src')?.textContent ?? null,
        button: block?.querySelector('button[data-guild="join"]')?.textContent ?? null,
      };
    },
    /**
     * The petition's own law, isolated: a hostile standing is refused, purely in-process.
     * Uses the same `joinGuild` the keeper's button drives, with nothing in hand.
     */
    tryJoinWithHostileStanding: () => {
      const saved = { ...guilds, memberships: { ...guilds.memberships }, standings: { ...guilds.standings } };
      const result = joinGuild(saved, GUILD_ROSTER.fighters, player, radiant.day ?? 1);
      return {
        ok: result.ok, reason: result.reason ?? null, rank: result.rank ?? null,
        members: Object.entries(saved.memberships).filter(([, m]) => m?.rank >= 0).length,
        standing: guildStandingOf(saved, 'fighters'),
      };
    },
    /** Hand in the job the person in front of the player is owed for, if any. */
    handIn: () => handInJob(),
    /** The talk corpus, as the scene loaded it from the player's install. */
    talkLines: () => ({
      plain: talkLines.plain.length,
      province: talkLines.province.length,
      total: talkLines.total,
      parts: talkLines.parts,
      dropped: talkLines.dropped,
      unfillable: talkLines.unfillable,
    }),
    /**
     * Stand next to one of the town's people, for a test that must not walk a city.
     *
     * @param {number|'nearest'} [which]
     */
    teleportToPerson: (which = 0) => {
      const feet = feetOf();
      const person = which === 'nearest'
        ? townsfolk.slice().sort((a, b) => (
          Math.hypot(a.world.x - feet[0], a.world.z - feet[2]) - Math.hypot(b.world.x - feet[0], b.world.z - feet[2])
        ))[0]
        : which === 'keeper'
          ? townsfolk.find((t) => t.keeper) ?? townsfolk[0]
          : townsfolk[which];
      if (!person) return null;
      // **The cell they are standing in now**, not the one they were placed on: a person
      // walking a route keeps `place` at the last cell they *arrived* on until they reach the
      // next one, so standing "next to" a walker by `place` put the player beside a paving
      // stone the person left half a minute ago — a seam that then reported "nobody within
      // earshot" for somebody crossing the square. Their live position is the answer, rounded
      // to the cell the motor's own convention names (see `feetOf`).
      const row = Math.round(person.world.x / CELL_SIZE - 0.5);
      const col = Math.round(person.world.z / CELL_SIZE - 0.5);
      // Stand one cell away along the clearest axis, facing them — the same rule the
      // monster approach uses, so a person is talked to from where a player could stand.
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const step = options.find(([dr, dc]) => walkableWorld(
        (row + dr + 0.5) * CELL_SIZE, (col + dc + 0.5) * CELL_SIZE,
      )) ?? options[0];
      const at = { row: row + step[0], col: col + step[1] };
      current.motor.spawn((at.row + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (at.col + 0.5) * CELL_SIZE);
      cam.yaw = Math.atan2(person.world.x - (at.row + 0.5) * CELL_SIZE, person.world.z - (at.col + 0.5) * CELL_SIZE);
      return { description: person.description, at, distance: Math.hypot(person.world.x - feetOf()[0], person.world.z - feetOf()[2]), cell: { row, col }, walking: Boolean(person.walking || person.route) };
    },
    /**
     * Stand next to **the person who gave the job in hand** — the one who pays for it.
     *
     * A hand-in is owed to a specific person (`radiant.active.giverId` is their regard
     * id, the same key `handInWith` reads), and a town's people meanwhile keep walking, so
     * "the nearest person" is not guaranteed to be them and the panel would show no hand-in
     * block. This is the same teleport as `teleportToPerson`, aimed by the ledger.
     */
    teleportToJobPayer: () => {
      const giverId = radiant.active?.giverId ?? null;
      const which = giverId != null ? townsfolk.findIndex((t) => String(t.regardId) === String(giverId)) : -1;
      if (which < 0) return { ok: false, reason: giverId == null ? 'no job in hand' : `no person regards as ${giverId}` };
      const found = window.__debug.teleportToPerson?.(which) ?? null;
      return found ? { ok: true, ...found, giverId } : { ok: false, reason: 'the payer is not standing anywhere' };
    },
    /**
     * Stand in the open street with **nobody within reach**, for a test of what `T` does when
     * there is no conversation to have — the other side of `teleportToPerson`.
     *
     * A town's people walk now, so "the player arrives with nobody in earshot" is not something
     * a suite can assume: somebody may be crossing the gate at the moment the page settles, and
     * the test of a rule about *nobody being there* would then be measuring the crowd. This
     * stands the player on the walkable cell nearest them that is clear of every person by more
     * than the talk reach, and answers how far the nearest one is, so the premise is
     * established rather than hoped for.
     *
     * @returns {{row: number, col: number, nearest: number}|null} null when every walkable cell
     *   of the level has somebody within reach of it (a crowded room, not a street)
     */
    standClearOfPeople: () => {
      if (!current?.level) return null;
      const feet = feetOf();
      const clear = TALK_REACH + 1;
      let best = null;
      for (let row = 1; row < current.level.depth - 1; row++) {
        for (let col = 1; col < current.level.width - 1; col++) {
          const x = (row + 0.5) * CELL_SIZE;
          const z = (col + 0.5) * CELL_SIZE;
          if (!walkableWorld(x, z)) continue;
          const nearest = townsfolk.length
            ? townsfolk.reduce((min, person) => Math.min(min, Math.hypot(person.world.x - x, person.world.z - z)), Infinity)
            : Infinity;
          if (nearest <= clear) continue;
          const distance = Math.hypot(x - feet[0], z - feet[2]);
          if (!best || distance < best.distance) best = { row, col, nearest, distance };
        }
      }
      if (!best) return null;
      current.motor.spawn((best.row + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (best.col + 0.5) * CELL_SIZE);
      return { row: best.row, col: best.col, nearest: best.nearest };
    },
    /**
     * The shop doors of this city, with the room behind each one.
     *
     * The list is built from the level and the block plan (`game/shops.js`), so a test can
     * assert what a player would see: how many doors there are, what the signs say, and
     * which `.MIF` each opens.
     */
    shopDoors: () => (current.doors ?? []).map((door) => ({
      ...door,
      paces: Math.round(Math.hypot(
        feetOf()[0] - (door.row + 0.5) * CELL_SIZE,
        feetOf()[2] - (door.col + 0.5) * CELL_SIZE,
      )),
    })),
    /**
     * Stand in a shop's doorway, for a test that must not walk a 128-cell city to one.
     *
     * @param {number|'nearest'|string} [which]  an index into the door list, `'nearest'`,
     *   or the name of a kind (`'tavern'`) for the nearest door of that kind.
     */
    teleportToDoor: (which = 'nearest') => {
      const doors = current.doors ?? [];
      if (!doors.length) return null;
      const feet = feetOf();
      const distanceTo = (door) => Math.hypot(
        feet[0] - (door.row + 0.5) * CELL_SIZE, feet[2] - (door.col + 0.5) * CELL_SIZE,
      );
      const byKind = typeof which === 'string' && SHOP_KIND_NAMES.includes(which);
      const pool = byKind ? doors.filter((d) => d.kind === which) : doors;
      if (!pool.length) return null;
      const door = byKind || which === 'nearest'
        ? pool.slice().sort((a, b) => distanceTo(a) - distanceTo(b))[0]
        : pool[which] ?? pool[0];
      if (!door) return null;
      standAt(door.row, door.col);
      refreshObjective();
      refreshNearDoor();
      return { row: door.row, col: door.col, kind: door.kind, name: door.name, file: door.file, sign: door.sign };
    },
    /** Walk out of the building through the door the player came in by, as `E` does. */
    leaveBuilding: () => leaveDoor(),
    /** Speak to whoever is nearest, exactly as `T` does. */
    talk: () => talk(),
    /** Take the job the person in front of the player is offering, as their button does. */
    acceptJob: () => acceptJob(),
    /** The work the people here have to offer, as the scene drew it. */
    jobOffer: (which = 'nearest') => {
      // `'nearest'` means **whoever the panel is talking about**. Once a conversation is
      // open that is the person being spoken to, even if somebody else has walked closer
      // since: the town's people move about, and a seam that followed the crowd would
      // report a different job than the button on the screen sells.
      const person = which === 'nearest' ? (talking?.person ?? personNear()) : townsfolk[Number(which)];
      if (!person) return null;
      const offer = offerFrom(person);
      return offer
        ? {
          who: person.description, id: offer.id, kind: offer.kind, title: offer.title,
          target: offer.target, targetMif: offer.targetMif, province: offer.targetProvince,
          days: offer.days, reward: offer.reward, dataText: offer.dataText, source: offer.source,
          draftDungeons: (jobDungeons ?? []).length,
        }
        : { who: person.description, offer: null, draftDungeons: (jobDungeons ?? []).length };
    },
    /** Answer one of the panel's questions, exactly as its button does. */
    askTopic: (key) => askTopic(String(key)),
    closeTalk: () => { closeTalk(); return true; },
    /** The talk panel exactly as it is on screen. */
    talkPanel: () => {
      const el = document.getElementById('talk');
      return {
        shown: el?.classList.contains('on') ?? false,
        who: el?.querySelector('h2')?.textContent ?? null,
        line: el?.querySelector('p.line')?.textContent ?? null,
        source: el?.querySelector('p.src')?.textContent ?? null,
        topics: [...(el?.querySelectorAll('button[data-topic]') ?? [])].map((b) => ({ key: b.dataset.topic, label: b.textContent })),
        // The job the person is offering, exactly as the panel shows it: the prose, the
        // credit line, and the button a player would click.
        job: el?.querySelector('.job .offer')?.textContent ?? null,
        jobCredit: el?.querySelector('.job .src')?.textContent ?? null,
        accept: el?.querySelector('button[data-job="accept"]')?.textContent ?? null,
        // The hand-in: the button the one who asked for the work is owed, and the standing
        // line the ledger puts under the greeting.
        handIn: el?.querySelector('button[data-job="hand-in"]')?.textContent ?? null,
        standings: [...(el?.querySelectorAll('p.src') ?? [])].map((p) => p.textContent)
          .filter((text) => /read you as/.test(text)),
      };
    },
    /**
     * Who the conversation is about, and where they are standing.
     *
     * The panel says who is speaking; this says which *record* that is, and how far off —
     * which is the difference between "the person walked away" and "the panel is about
     * somebody the scene can no longer find".
     */
    talking: () => (talking?.person
      ? {
        file: talking.person.file,
        place: { ...talking.person.place },
        world: { x: talking.person.world.x, z: talking.person.world.z },
        walking: Boolean(talking.person.walking),
        inTownsfolk: townsfolk.includes(talking.person),
        distance: Math.hypot(talking.person.world.x - feetOf()[0], talking.person.world.z - feetOf()[2]),
      }
      : null),
    /** The side work as it stands, including whether a job may be accepted. */
    jobs: () => ({
      active: radiant.active
        ? { id: radiant.active.id, kind: radiant.active.kind, title: radiant.active.title, target: radiant.active.target, giver: radiant.active.giver, reward: radiant.active.reward, days: radiant.active.days, combat: slayProgress(radiant.active), completed: Boolean(radiant.active.completed), giverId: radiant.active.giverId ?? null, giverPerson: radiant.active.giverPerson ?? null }
        : null,
      objective: radiantObjective(radiant),
      entry: radiant.log.at(-1) ?? null,
      taken: radiant.taken,
      day: radiant.day,
    }),
    /**
     * A job taken from a **person**, for a suite that must not walk a town to find one.
     *
     * The offer is built by the game's own `personOffer` (through `jobOffer`), so this cannot
     * invent a job the street could not have given: it only skips the conversation.
     */
    takeJobFromPerson: (which = 'nearest') => {
      const person = which === 'nearest' ? (talking?.person ?? personNear()) : townsfolk[Number(which)];
      if (!person) return { ok: false, reason: 'nobody there' };
      const offer = offerFrom(person);
      if (!offer) return { ok: false, reason: 'nothing to offer' };
      const result = applyRadiantEvent(radiant, 'accept', { offer });
      if (!result.ok) return { ok: false, reason: result.reason };
      radiant = result.state;
      saveRadiantState(radiant);
      updateObjectiveHud();
      return {
        ok: true,
        title: offer.title,
        giverId: offer.giverId ?? null,
        giverPerson: offer.giverPerson ?? null,
        regardId: person.regardId ?? null,
        target: offer.target,
      };
    },
    /** Test seam for pickup/delivery jobs only. Bounties must use real monster deaths. */
    finishJob: () => {
      const active = radiant.active;
      if (!active) return { ok: false, reason: 'nothing in hand' };
      if (active.kind === 'slay') return { ok: false, reason: 'defeat the contracted creatures in their lair' };
      const event = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[active.kind] ?? null;
      if (!event) return { ok: false, reason: `no finish for ${active.kind}` };
      const result = applyRadiantEvent(radiant, event, { where: active.target });
      if (!result.ok) return { ok: false, reason: result.reason };
      radiant = result.state;
      saveRadiantState(radiant);
      return { ok: true, objective: radiantObjective(radiant), completed: Boolean(radiant.active?.completed) };
    },
    /** Who is here, what they are doing, and what the player has left. */
    combat: () => {
      // Stable handles before anything is read (`spawnSerial`): the report below hands each
      // spawn a `serial`, and the index it also carries moves when somebody dies.
      for (const spawn of monsters) spawn.serial ??= ++spawnSerial;
      return {
      view,
      player: {
        name: player.name, class: player.className ?? null, level: player.level ?? 1,
        health: player.health, maxHealth: player.maxHealth, xp, kills,
        weapon: player.weapon, material: player.material, created: Boolean(player.created),
        gold: player.gold ?? 0,
        carrying: weaponCarried(player),
      },
      guarding: guarding(),
      guardNote: BLOCK_NOTE,
      // The attack in progress for each creature: its phase, how far through it, and whether
      // its blow has been decided (`strikeFromMonster`).
      attacks: monsters.filter((s) => s.attack).map((s) => {
        const at = attackPhase(s.attack.profile, s.attack.elapsed);
        return { serial: s.serial, name: s.monster.name, phase: at.phase, progress: at.progress, elapsed: s.attack.elapsed,
          windup: s.attack.profile.windup, active: s.attack.profile.active, charge: s.attack.profile.charge,
          struck: s.attack.struck, origin: { ...s.attack.origin }, yaw: s.attack.yaw,
          reach: s.attack.profile.reach, x: s.world.x, z: s.world.z };
      }),
      telegraphs: combatFx.telegraphs,
      effects: { space: 'world', depthTested: true, particles: combatFx.particles.length, vertices: combatFx.count, bursts: combatFx.bursts, chargeBursts: dbg.chargeBursts ?? 0, hitStop },
      defence: { rollT: defence.rollT, parryT: defence.parryT, direction: defence.rollDirection, live: liveDefence(), riposte: defence.riposte, stamina: defence.stamina.stamina ?? null, max: defence.stamina.max ?? null },
      monsters: monsters.map((s) => ({
        serial: s.serial,
        name: s.monster.name, id: s.monster.id, level: s.monster.level,
        health: s.monster.health, maxHealth: s.monster.maxHealth,
        file: s.file, cell: { row: s.place.row, col: s.place.col },
        bounty: s.bounty ?? null,
        world: { x: s.world.x, y: s.world.y, z: s.world.z },
        distance: s.distance ?? null, awake: Boolean(s.awake),
        circling: Boolean(s.circling), baitT: Number.isFinite(s.baitT) ? s.baitT : 0,
        // **Whether it can see the player at all** (`sightClear`): what wakes a monster and
        // what lets its blow land. Reported because "it hit me through the wall" is a claim
        // about this flag, and a test should read the flag rather than infer it from health.
        sees: Boolean(s.sees),
        frame: s.renderFrame ?? null,
        walking: Boolean(s.walking),
        dying: Boolean(s.death),
        deathElapsed: s.death?.elapsed ?? null,
      })),
      spriteFiles: [...spriteSets.keys()],
      townsfolk: townsfolk.length,
      // How many billboards the last frame actually drew: the people are drawn by the
      // same pass as the creatures, so "their art is uploaded" is not the same claim as
      // "they are on screen" — and the second one is the one a player cares about.
      figures: dbg.figures ?? 0,
      spritePalette: spritePaletteName(),
      ripostes: dbg.ripostes ?? 0,
      staggers: dbg.staggers ?? 0,
      casts: dbg.casts ?? 0,
      lastBolt: dbg.lastBolt ?? null,
      boltEnds: { wall: dbg.boltWall ?? 0, out: dbg.boltOut ?? 0, body: dbg.boltHit ?? 0 },
      bolts: bolts.map((b) => ({ x: b.x, y: b.y, z: b.z, damage: b.damage, life: b.life })),
      lastDefence: dbg.lastDefence ?? null,
      parries: dbg.parries ?? 0,
      dodges: dbg.dodges ?? 0,
      playerSprite: playerSet?.file ?? null,
      attackSprite: attackSet?.file ?? null,
      swinging: swingAnim > 0,
      // The weapon in the player's hands, and what this install could give up for it.
      weaponView: weaponViewReport(),
      formula: HIT_FORMULA_NOTE,
      deaths: dbg.deaths ?? 0,
      lastDamage: dbg.lastDamage ?? null,
      };
    },
    /** Swing, exactly as `F` and a click do. */
    strike: (opts) => { const blow = strike(opts); dbg.lastStrike = blow; return blow; },
    /**
     * Open (or shut) one of this level's own doors, by its cell — the seam a test uses for
     * a door it cannot walk to. Real players press `E` at it (`useLeaf` is the same call).
     */
    openDoor: (row, col) => {
      const leaf = (current.leaves ?? []).find((l) => l.row === row && l.col === col);
      return leaf ? useLeaf(leaf) : false;
    },
    /** Take one of the map's own items, by its cell (the `E` key does the same). */
    takeLoot: (row, col) => {
      const spot = (current.loot ?? []).find((s) => s.row === row && s.col === col && !s.taken);
      return spot ? takeLoot(spot) : false;
    },
    /** Walk to a loot pile and take it, for a test that must not path through a dungeon. */
    lootKinds: () => pickupKinds((current.loot ?? []).filter((spot) => !spot.taken)),
    /** The first-person weapon: the sheet, the state, the frame, and whether it is drawn. */
    weaponView: () => weaponViewReport(),
    /** Read the weapon layer back: how many pixels the last paint really put there. */
    weaponPixels: () => weaponPixels(),
    /**
     * Wield something else, as a shop or a looted blade would: the sheet changes and its art
     * is loaded for the new one.
     * @param {string} id
     */
    setWeapon: async (id) => {
      player = { ...player, weapon: String(id ?? player.weapon).toLowerCase() };
      weaponRig.reset(player.weapon);
      await loadWeaponArt();
      savePlayer();
      updateCombatHud();
      updateInventoryPanel();
      return weaponViewReport();
    },
    /**
     * Run the weapon's own clock by `seconds` and repaint, so a test can watch the draw, the
     * swing and the sheath without depending on the frame rate of the machine it runs on.
     * @param {number} seconds
     */
    stepWeapon: (seconds) => {
      weaponRig.step(Math.max(0, Number(seconds) || 0));
      drawWeaponView();
      return weaponViewReport();
    },
    /** The guard, exactly as `B` and the right button hold it. */
    guard: (on = true) => { mouseGuard = Boolean(on); updateCombatHud(); return guarding(); },
    /**
     * The stairways on the level the player is in, and which one `E` would take.
     *
     * `stair` is the level's own `*LEVELUP`/`*LEVELDOWN` art read off its `.INF`
     * (`mifLevel.js`'s `stairKindOf`), which is what the player sees on the wall; `near` is
     * the one inside reach. A level with none reports none, and that is a real answer: the
     * pieces of `RANDOM1.MIF` hold no stairway, which is why the assembler stamps one.
     */
    stairs: () => {
      const level = current?.level;
      if (!level) return { count: 0, up: 0, down: 0, near: null, exit: current?.exitCell ?? null };
      let up = 0;
      let down = 0;
      for (const cell of level.cells) {
        if (cell.stair === 'up') up++;
        else if (cell.stair === 'down') down++;
      }
      const near = stairNear();
      return {
        count: up + down,
        up,
        down,
        level: current.index,
        levels: levelCount,
        levelUpIndex: level.inf?.levelUpIndex ?? null,
        levelDownIndex: level.inf?.levelDownIndex ?? null,
        near: near ? { row: near.row, col: near.col, stair: near.cell.stair, distance: near.distance } : null,
        exitCell: current?.exitCell ?? null,
        cooldown: stairCooldown,
        last: dbg.stair ?? null,
        history: dbg.stairHistory ?? [],
      };
    },
    /** Take the stairway in reach, exactly as walking into it or pressing `E` does. */
    useStair: async () => {
      const found = stairNear();
      if (!found) return { ok: false, reason: 'no stairway within reach' };
      const result = await useStair(found);
      return { ok: true, ...result, level: current.index };
    },
    /** The inventory, exactly as `I` shows it. */
    inventory: () => carried(player, { quest, kills, xp, day: radiant.day ?? 0, side: radiant.active?.title ?? null }),
    /** Open or close the inventory panel, as `I` does. */
    toggleInventory: (on) => toggleInventory(on),
    /** The pack, as the panel lists it (`game/items.js`). */
    bag: () => bagRows(bagOf()),
    /** Open the pack page, and the spellbook page, as the keys do. */
    openBag: () => openBag(),
    openSpellbook: () => openSpellbook(),
    /** The panel, as it is on screen: which page, and what is on it. */
    panel: () => ({
      open: Boolean(document.getElementById('inventory')?.classList.contains('on')),
      mode: panelMode,
      ...(dbg.panel ?? {}),
    }),
    /**
     * The spellbook, and the file behind it.
     *
     * `file` is what the install's own `SPELLSG.65` really held — how many records, how many of
     * them named, and any name this build does not know how to cast — so a check can hold the
     * decode to the player's own data rather than to a table in the source.
     */
    spellbook: async () => {
      await ensureSpellLibrary();
      return {
        file: dbg.spellFile ?? null,
        known: knownSpells(player).map((entry) => ({
          name: entry.name, points: entry.points, cost: costOf(player, entry),
          note: entry.note, element: entry.element, codes: entry.codes,
        })),
        all: (spellLibrary?.spells ?? []).length,
        note: CASTING_NOTE,
      };
    },
    /** Learn a spell the way the guild's shelf does (a test's door to a caster). */
    learn: async (name) => {
      await ensureSpellLibrary();
      player = { ...learnSpell(player, String(name)), spellPoints: player.spellPoints ?? 100, maxSpellPoints: player.maxSpellPoints ?? 100 };
      savePlayer();
      updateInventoryPanel();
      return knownSpells(player).map((entry) => entry.name);
    },
    /** Cast by name, exactly as `Z` and a scroll do. */
    cast: (name) => castSpell(name),
    /** What the building the player is standing in trades in, and what is on its shelf. */
    shop: () => ({ kind: shopTrade(), shelf: shopShelf() }),
    /** The install's own fanfare: decoded, and whether it played or waits for a gesture. */
    fanfare: () => fanfareState(),
    /**
     * Stand the player in a named cell (row, col) — the trigger proof's own door: a
     * test warps into a level's `*TRIG` cell and the next frame fires it. Refuses a
     * cell outside the level with `{ refused: 'row,col' }`.
     *
     * @param {number} row @param {number} col
     */
    warp: (row, col) => {
      const level = current?.level;
      if (!level || row < 0 || col < 0 || row >= level.depth || col >= level.width) return { refused: `${row},${col}` };
      current.motor.spawn((row + 0.5) * CELL_SIZE, level.floorY * CELL_SIZE, (col + 0.5) * CELL_SIZE);
      current.spawn = { x: row + 0.5, y: level.floorY, z: col + 0.5 };
      return { at: `${row},${col}`, trigger: current.triggers?.get(`${row},${col}`) ?? null };
    },
    /** The level's own `*TRIG` cells: table size, the list raw, the ones fired, and the last one's state. */
    triggers: () => ({
      cells: current?.triggers?.size ?? null,
      list: current?.triggers ? [...current.triggers.values()] : [],
      fired: firedTriggers.size,
      last: dbg.trigger ?? null,
      sound: trigSoundState(),
    }),
    /** The name corpus and the street's named folk, as S30's own seam reads them. */
    names: () => ({
      loaded: Boolean(peopleBanks),
      banks: peopleBanks ? Object.fromEntries(Object.entries(peopleBanks).map(([key, sets]) => [key, sets.reduce((n, set) => n + set.length, 0)])) : null,
      named: townsfolk.filter((p) => p.name).length,
      of: townsfolk.length,
      sample: townsfolk.find((p) => p.name)?.name ?? null,
    }),
    /**
     * The living world, as the scene reads it (`game/livingWorld.js`): the hour, which trades
     * are open, what every person present is about, and what the watch last did.
     *
     * `clock` is the scene's own answer to "what time is it here" — the hour a player's stay
     * has reached, the phase of the day, and how long the level has been standing — so a check
     * can hold the shut door, the plans and the sky to the same clock.
     */
    living: () => {
      const clock = clockNow();
      return {
        clock,
        word: clockWord(clock),
        arrivalMinutes: arrivalMinutes(),
        open: Object.fromEntries(Object.entries(SHOP_HOURS).map(([kind]) => [kind, isOpen(kind, clock)])),
        trades: tradesHere(),
        people: townsfolk.filter((person) => !person.down).map((person) => ({
          id: person.regardId ?? null,
          role: roleOf(person),
          watch: Boolean(person.watch),
          distance: Number.isFinite(personDistance(person)) ? Math.round(personDistance(person) * 10) / 10 : null,
          activity: currentActivity(person, clock),
          word: activityWord(person, clock),
        })),
        watch: dbg.watch ?? null,
        shutDoor: dbg.shutDoor ?? null,
        // What the sky is doing at that same hour (`game/daylight.js`), so the clock, the
        // shutters and the light out of doors are one claim rather than three that agree.
        light: lightReport(),
      };
    },
    /** The light the last painted frame had — the sun, the ambient and the air's colour. */
    light: () => lightReport(),
    sceneEffects: (lights = true, air = true) => { sceneLightsEnabled = Boolean(lights); atmosphereEnabled = Boolean(air); },
    worldMemory: () => ({ key: memoryKey(current.index), ...worldSummary(worldMemory) }),
    /**
     * Put the town's clock at any hour, as `?clock=<minutes>` does on the way in — a test's door
     * to the shutters, and to the watch's own shift.
     *
     * `minutes` is minutes past midnight; the level's own seconds are then set so that
     * `clockNow()` reports it, rather than a second clock being invented for the debug seam.
     */
    setClock: (minutes) => {
      const wanted = ((Math.trunc(Number(minutes) || 0) % 1440) + 1440) % 1440;
      const elapsed = wanted - arrivalMinutes();
      dbg.seconds = Math.max(0, secondsForMinutes(elapsed < 0 ? elapsed + 1440 : elapsed));
      updateObjectiveHud();
      return clockNow();
    },
    /**
     * The watch's last answer, exactly as it was carried out.
     *
     * **A witness count of zero is a count, not a missing argument.** `Number(0) || 1` is `1`,
     * and that one character made the module's headline law — *a crime nobody saw is nobody's
     * business* — unreachable from the only door a test has: `callWatch('murder', 0)` brought
     * four armed men. Only a value that is not a number at all falls back to one witness.
     */
    callWatch: (crime, witnesses) => {
      const seen = Number(witnesses);
      return callWatch({
        crime: String(crime ?? 'murder'),
        witnesses: Number.isFinite(seen) ? Math.max(0, Math.trunc(seen)) : 1,
      });
    },
    /** The counter's own actions, for a test that must not click. */
    buy: (id) => buyThing(id),
    sell: (id) => sellThing(id),
    equip: (id) => equipThing(id),
    use: (id) => useThing(id),
    dropItem: (id) => dropThing(id),
    learnFromGuild: (name) => learnFromGuild(name),
    service: (id) => takeService(id),
    rest: () => restHere(),
    /** Put something in the pack, as a chest or a shop would. */
    giveItem: (id, qty = 1) => {
      setBag(addToBag(bagOf(), String(id), qty));
      savePlayer();
      updateInventoryPanel();
      return bagRows(player.bag);
    },
    /** The purse, for a check that has to pay for something. */
    grantGold: (amount = 0) => {
      player = { ...player, gold: Math.max(0, Number(player.gold) || 0) + (Number(amount) || 0) };
      savePlayer();
      updateInventoryPanel();
      return player.gold;
    },
    /** The inventory panel exactly as it is on screen. */
    inventoryPanel: () => {
      const el = document.getElementById('inventory');
      return { shown: el?.classList.contains('on') ?? false, text: el?.textContent ?? null };
    },
    /**
     * What the player is standing in, exactly as `updateWater` reads it.
     *
     * `speedScale` is the engine's `swimSpeedScale`: the walk speed modifier the scene sets
     * while the player is in water, so a test can hold the rule to "water is slower"
     * without timing a walk through a level whose corridors run where they run.
     */
    /**
     * The level's water and lava **surfaces** — Arena's own fields over its own chasm cells.
     *
     * One entry per kind the level has, with the field it was built from (`WATERANI.RCI` or
     * `LAVAANI.RCI`), how many draw-call squares it takes, how many chasm cells those cover
     * and how far it has flowed. This is what lets a check say the *harbour* is a real
     * surface drawn from the install's own art and that it moves, rather than only that the
     * player wades in it.
     */
    chasmSurface: () => (current?.surfaces ?? []).map((s) => ({
      kind: s.kind,
      field: s.field,
      planes: s.quads.length,
      cells: s.cells,
      covered: s.covered,
      largest: s.largest,
      tint: [...s.tint],
      scroll: s.scroll,
      seconds: s.seconds ?? 0,
      texture: Boolean(s.texture),
      values: s.report?.values ?? null,
      ramp: s.report?.ramp ?? null,
      inside: s.report?.inside ?? null,
      outside: s.report?.outside ?? null,
    })),
    water: () => ({
      ...waterAt(),
      feetY: feetOf()[1],
      grounded: Boolean(current.motor.grounded),
      swimming: current.motor.swimming,
      speedScale: current.motor.swimSpeedScale,
    }),
    /**
     * What every figure is showing this frame, as `FILE#frame`.
     *
     * A walk cycle belongs to walking, so this is how a test holds the game to it: a
     * standing creature's frame must not change between two reads a second apart, and a
     * monster that is closing on the player must change.
     */
    animation: () => ({
      player: dbg.playerFrame ?? null,
      // Only the batches that were actually drawn: the player's own art is uploaded even
      // in the first-person view, and the swing set waits its turn, so listing every
      // uploaded set would count figures that are not on screen.
      figures: dbg.drawnFrames ?? [],
      // …and which of those batches had somebody who *really moved* this frame. A walk
      // cycle belongs to walking, so a batch showing a frame other than its first one has
      // to be in this list; that is the rule a test holds the game to.
      //
      // **`crowd`, not `live`.** A sheet the player and a townsman share (`05CHNWLK.CFA` is both
      // the player's own back view in chain mail and townsman five's walk) has its `live` set back
      // to zero when the player's own figures are taken out of the crowd count, which used to
      // drop a moving townsman from this list and make his walk frame look like a batch animating
      // on the spot. `crowd` counts only the town's folk and the creatures, so the law reads true
      // whoever the player is (D-08).
      moving: [...spriteSets.values()].filter((s) => s.crowd > 0 && s.moved).map((s) => s.file),
      // How many of the town's people are mid-step, which is how "they move around" is
      // told apart from "they stand still and the art plays anyway".
      walking: townsfolk.filter((p) => p.walking).length,
    }),
    /**
     * The people of this place, as the last frame drew them: which angle of their outfit
     * each one is showing, and where they are looking. This is what "they turn to face the
     * player" is checked against — a person's file changes as the eye moves around them.
     */
    people: () => townsfolk.map((person) => ({
      file: person.file,
      // Which family the archive gave this one (`game/peopleKinds.js`'s key, or null for the
      // armoured outfits), and whether they are drawn in their **talk** sheet right now.
      family: person.kind ?? null,
      talking: Boolean(person.talkingArt),
      actions: person.actions ? Object.values(person.actions).filter(Boolean) : [],
      down: Boolean(person.down),
      description: person.description ?? null,
      facing: person.facing,
      // **Whether this one is mid-step.** A walking person turns to face the way they are
      // going and shows their walk cycle, so "do they face the eye?" is a question about a
      // person who is standing — and a test that froze the world mid-step and then asked it
      // got a walk frame from every angle (the suite's own flake, and the reason this field
      // is here at all).
      walking: Boolean(person.walking),
      frame: person.renderFrame ?? null,
      mirrored: Boolean(person.renderMirrored),
      world: { x: person.world.x, z: person.world.z },
      view: PEOPLE_VIEWS.find((v) => viewFileFor(person.outfit, v) === person.file) ?? null,
      // Where this one is **going**, when they are on their way somewhere: the door their plan
      // named, the reason in the plan's own words, and how far along the walk they are. This is
      // what "the town's people go about their day" is checked against — a person mid-route is
      // a person with a destination, and the destination is the day plan's, not the walk's.
      route: person.route
        ? { goal: { row: person.route.goal.row, col: person.route.goal.col }, reason: person.route.reason, at: person.route.at, length: person.route.line.len }
        : null,
      place: { row: person.place.row, col: person.place.col },
      home: person.home ?? null,
      // **Whether their own day has them indoors right now** — which is why the street can be
      // empty of figures while the town still holds forty-eight people. Reported because
      // "nobody is out" and "the scene stopped stepping them" look identical from positions
      // alone, and the difference is the whole of the night defect it was measured for.
      atHome: Boolean(person.atHome),
      shop: Boolean(person.shop),
      // The trade this one's day is built from, as the living world reads it (`roleOf`): a
      // probe that wants to know *why* a street is empty at midnight has to be able to ask
      // which trades the town holds at all.
      role: roleOf(person),
      activity: currentActivity(person, clockNow()).activity,
    })),
    /**
     * The town's own walking, as numbers: how many people are on their way somewhere, where to,
     * and what the path book has been asked for. A test that watched a town for a minute would
     * otherwise have to infer all of this from positions alone.
     */
    townWalks: () => ({
      people: townsfolk.length,
      moving: townsfolk.filter((person) => person.route).length,
      keepers: townsfolk.filter((person) => person.shop).length,
      goals: townsfolk.filter((person) => person.route).map((person) => ({
        file: person.file, role: person.role, reason: person.route.reason,
        goal: { row: person.route.goal.row, col: person.route.goal.col },
        from: { row: person.place.row, col: person.place.col },
      })),
      departures: dbg.departures ?? 0,
      arrivals: dbg.arrivals ?? 0,
      // **The town's own pace**, so a test can hold the walk to it instead of guessing from two
      // samples of a moving crowd: metres a second, and the seconds one cell takes.
      pace: { metresPerSecond: TOWN_SPEED, secondsPerCell: TOWN_WALK_SECONDS },
      grid: dbg.townGrid ?? null,
      book: townWalk ? { known: townWalk.size(), waiting: townWalk.waiting(), spent: townWalk.spent() } : null,
    }),
    /**
     * Stop or resume the simulation; painting continues.
     *
     * For a test that must drive a timed animation — the weapon's swing is 5/16 s, and a
     * real frame can run it out between two round trips to the page.
     * @param {boolean} [on]
     */
    pause: (on = true) => { life.paused = Boolean(on); return life.paused; },
    /**
     * The menu, as `Escape` drives it — and what it says while it is up.
     *
     * @param {boolean} [on]  `true`/`false` to open/close, `undefined` to toggle
     */
    menu: (on) => {
      const open = toggleMenu(on);
      return open === null ? null : { open, paused: life.paused, ...(dbg.menuSnapshot ?? null) };
    },
    /** What the menu says, without opening or closing anything (see `menu`). */
    menuState: () => ({
      open: Boolean(life.menuOpen), paused: life.paused, confirm: menuConfirm, controls: menuControls,
      ...(dbg.menuSnapshot ?? null),
    }),
    /** Start over, exactly as the menu's own **Begin a new game** does. */
    newGame: () => newGame(),
    /** First or third person, exactly as `V` does. */
    setView: (next) => setView(next),
    /**
     * Walk to a monster, for a test that means to fight one.
     *
     * @param {number|'nearest'} [index]  the roster position, or `'nearest'`
     *   for the closest monster still standing — a fight that has to be won
     *   needs the next one when the one in front falls.
     */
    approach: (index = 0) => {
      const spawn = index === 'nearest'
        ? monsters.filter((s) => s.monster.health > 0)
          .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0]
        : monsters[index];
      if (!spawn || spawn.monster.health <= 0) return null;
      const cell = { row: spawn.place.row, col: spawn.place.col };
      // Stand one cell away along the clearest axis, facing it.
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const step = options.find(([dr, dc]) => walkableWorld(
        (cell.row + dr + 0.5) * CELL_SIZE, (cell.col + dc + 0.5) * CELL_SIZE,
      )) ?? options[0];
      const row = cell.row + step[0];
      const col = cell.col + step[1];
      current.motor.spawn((row + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (col + 0.5) * CELL_SIZE);
      cam.yaw = Math.atan2(spawn.world.x - (row + 0.5) * CELL_SIZE, spawn.world.z - (col + 0.5) * CELL_SIZE);
      stepMonsters(0);
      return {
        name: spawn.monster.name, at: { row, col },
        distance: spawn.distance ?? null,
        // **And whether it can see the player from there** (`sightClear`): a test that puts a
        // body behind a corner wants the wall test's own answer, not a guess from health.
        sees: Boolean(spawn.sees),
      };
    },
    /**
     * Put a named monster in front of the player, for a test of one particular fight.
     *
     * Its art is loaded on demand: a Lich does not wander into the Imperial Dungeons, so
     * requiring the level's own roster to contain it made "fight a lich" impossible to
     * test where the lich would never spawn.
     *
     * It stands **1.4 m** ahead, not "about two paces": a monster already in the fight
     * closes to `REACH × 0.7` = 2.1 m and stops there, so a monster placed at 2.2 was
     * further away than the one the player was already fighting and every swing went to
     * the older target. Inside that stopping distance the placed monster is the nearest
     * thing in front, which is what "put it in front of the player" has to mean.
     *
     * @param {string} id  a `MONSTERS` id
     */
    spawnMonster: async (id) => {
      const kind = MONSTERS.find((m) => m.id === String(id).toLowerCase());
      if (!kind) return null;
      const file = kind.sprite ? `${kind.sprite}1.CFA` : null;
      if (!file) return null;
      if (!await loadSpriteSet(file, 1)) return null;
      for (let action = 2; action <= 6; action++) await loadSpriteSet(`${kind.sprite}${action}.CFA`, 1);
      const feet = feetOf();
      const fx = Math.sin(cam.yaw);
      const fz = Math.cos(cam.yaw);
      const placed = 1.4;
      const monster = rollMonster(kind, battle);
      const spawn = {
        monster,
        file,
        place: { row: 0, col: 0 },
        world: { x: feet[0] + fx * placed, y: feet[1], z: feet[2] + fz * placed },
        nextAttack: monster.nextAttack,
        awake: true,
        distance: placed,
      };
      monsters.push(spawn);
      updateCombatHud();
      return { name: monster.name, health: monster.health, maxHealth: monster.maxHealth, file };
    },
    /** Deterministic test setup, using the same attack/damage rules as ordinary encounters. */
    prepareCombat: (index = monsters.length - 1, opts = {}) => {
      const spawn = monsters[index];
      if (!spawn || spawn.monster.health <= 0) return null;
      spawn.attack = null;
      spawn.nextAttack = 100;
      spawn.monster = { ...spawn.monster, ...(opts.health ? { health: opts.health, maxHealth: opts.health } : {}) };
      if (opts.nextAttack !== undefined) spawn.nextAttack = Math.max(0, Number(opts.nextAttack) || 0);
      // A fixture may also set a creature's *footing*: the poise meter's own arithmetic is
      // a unit test, and this seam exists so a browser can prove the *consequence* of a
      // break (a cancelled wind-up, a staggered body) against whatever wound lands.
      if (opts.poise !== undefined) spawn.poise = { poise: Math.max(1, opts.poise | 0), max: Math.max(1, opts.poise | 0) };
      // A prepared encounter is a *fresh* body: the earlier tests' fire is not its fire, so
      // its breathing money is refilled and any stagger it had been holding is released —
      // else a fixture "begins" an attack that a staggered body refuses to make, and the
      // test proves a nothing.
      spawn.stamina = { stamina: staminaMax(spawn.monster), max: staminaMax(spawn.monster) };
      spawn.stagger = 0;
      if (opts.charge !== undefined) spawn.monster.charge = Boolean(opts.charge);
      if (opts.begin) beginAttack(spawn, Math.hypot(feetOf()[0] - spawn.world.x, feetOf()[2] - spawn.world.z));
      return window.__debug.combat();
    },
    damageEnemy: (index, amount) => {
      const spawn = monsters[index];
      return spawn ? damageMonster(spawn, amount, 'test setup') : null;
    },
    /**
     * **Can two cells see each other?** The wall test itself, for a test of it (`sightClear`).
     *
     * Two *cells* rather than two points, because that is how the claim is put: a foe in the
     * next room and the player in this one. Both ends are measured at `SIGHT_EYE` above their
     * own floor, which is the height a blow comes from.
     *
     * @param {{row: number, col: number}} a @param {{row: number, col: number}} b
     * @returns {{sees: boolean, cells: number[][], height: number}|null}
     */
    sightBetween: (a, b) => {
      const level = current?.level;
      if (!level) return null;
      const at = (cell) => ({
        x: (Math.trunc(Number(cell?.row) || 0) + 0.5) * CELL_SIZE,
        y: (level.floorY ?? 1) * CELL_SIZE,
        z: (Math.trunc(Number(cell?.col) || 0) + 0.5) * CELL_SIZE,
      });
      const from = at(a);
      const to = at(b);
      return {
        sees: sightClear(from.x, from.y + SIGHT_EYE, from.z, to.x, to.y + SIGHT_EYE, to.z),
        cells: [[Math.trunc(Number(a?.row) || 0), Math.trunc(Number(a?.col) || 0)], [Math.trunc(Number(b?.row) || 0), Math.trunc(Number(b?.col) || 0)]],
        height: SIGHT_EYE,
      };
    },
    /** Take a blow from nowhere, for a test of the player's own health. */
    hurt: (damage, from = 'A test blow') => { hurtPlayer(Math.max(0, Number(damage) || 0), from); return { health: player.health, deaths: dbg.deaths ?? 0 }; },
    /** Fill the defence bar, so a test can fight with a body that is not already winded. */
    restoreStamina: () => { defence.stamina.stamina = staminaMax(player); defence.stamina.regenIn = 0; return defence.stamina.stamina; },
    /** Fill the player's health, for a fixture that must outlive a corridor of blows. */
    heal: () => { player = { ...player, health: player.maxHealth ?? player.health ?? 1 }; return player.health; },
    /** The sight test, exposed so a fixture can argue with the *same* ray the fight sees. */
    losProbe: (from, to) => sightClear(Number(from[0]), Number(from[1]), Number(from[2]), Number(to[0]), Number(to[1]), Number(to[2])),
    /** The player's own character, as the scene sees it. */
    player: () => (player ? JSON.parse(JSON.stringify(player)) : null),
    /** Put the camera at the objective cell, for a test that must not walk there. */
    teleportToObjective: () => {
      // A *done* objective is a stale one: the next one may be elsewhere (or the same
      // room), so ask again rather than teleport to what has already been taken.
      const objective = current.objective && !current.objective.done ? current.objective : refreshObjective();
      if (!objective) return null;
      current.motor.spawn((objective.cellX + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (objective.cellZ + 0.5) * CELL_SIZE);
      return { x: objective.cellX, z: objective.cellZ };
    },
    state: () => ({
      scene: 'interior',
      map: mapName,
      level: current.index,
      levelCount,
      // **The level's own name and size**, not the file's: a generated level is a 64×64
      // assembly of 32×32 pieces, so `mif` would report a quarter of the grid and the name
      // of one piece. Everything else about the state is the loaded level's already.
      levelName: current.rawLevel?.name ?? mif.levels[current.index].name,
      inf: current.infName,
      size: [current.level?.width ?? mif.width, current.level?.depth ?? mif.height],
      frames: dbg.frame,
      painted: dbg.painted,
      seconds: dbg.seconds,
      feet: Array.from(current.motor.pos),
      eye: current.motor.eyeAt(),
      yaw: cam.yaw,
      pitch: cam.pitch,
      grounded: current.motor.grounded,
      spawn: current.spawn,
      draws: renderer.stats?.draws ?? null,
      tris: current.built.model.indices.length / 3,
      colliderTris: current.built.collider.indices.length / 3,
      subMeshes: current.built.model.subMeshes.length,
      quads: current.built.stats.quads,
      // The storeys the level's `MAP2` mass was drawn as — one box and one roof per cell
      // that holds any (`game/mifMesh.js`), and the number of voxel layers they came to.
      // Null for a dungeon, whose `MAP2` is the stone above a ceiling and is not drawn.
      upperStoreys: current.built.stats.upperBoxes
        ? {
          boxes: current.built.stats.upperBoxes,
          layers: current.built.stats.upperLayers,
          roofs: current.built.stats.roofQuads,
        }
        : null,
      textures: current.uploaded,
      openSky: current.openSky,
      outdoor: current.outdoor,
      // The scenery: how many pictures the level places, and how many of them the `.INF`
      // says hang from the ceiling (`game/flats.js`) — the second number is 0 everywhere
      // but a dungeon, and it is what the ceiling-attachment rule is checked against.
      scenery: current.scenery ? { flats: current.scenery.flats.length, hanging: current.scenery.hanging,
        animated: (current.sceneryBatches ?? []).filter(s => s.frames > 1).map(s => ({ name: s.name, frames: s.frames, frame: s.batch.record })),
        missing: current.scenery.unresolved } : null,
      furniture: current.furniture ?? null,
      // The horizon the page is drawing: which climate's art, and how much of it.
      sky: skyArt ? { ...skyArt } : null,
      // Whether anything is falling out of it, and which pass draws it.
      weather: airWeather,
      precipitation: precip ? { mode: airWeather, particles: PRECIP_MAX_PARTICLES } : null,
      // ── the story this scene is taking part in ──
      questStage: chain.stages[quest.step]?.title ?? null,
      // The people, and the art that is loaded for this level: a town's population is
      // a scene-level fact, not only a combat one, so `state()` reports it too.
      townsfolk: townsfolk.length,
      monsters: monsters.filter((s) => s.monster.health > 0).length,
      spriteFiles: [...spriteSets.keys()],
      // How many billboards the last frame drew. Creatures and people go through one
      // pass, so "their art is uploaded" is not the claim "they are on screen" — the
      // first version of `townsfolk` checked the uploads and the people were invisible.
      figures: dbg.figures ?? 0,
      arrivalShown: document.getElementById('arrival')?.classList.contains('on') ?? false,
      objective: current.objective ? { what: current.objective.what, event: current.objective.event, done: current.objective.done, depth: current.objective.depth } : null,
      notice: dbg.notice,
      // Who this place is, when the player arrived by name rather than by URL file.
      location: place
        ? {
          name: place.name,
          kind: place.kind,
          province: place.province,
          climate: place.climate,
          coastal: place.coastal,
          citySeed: place.citySeed ?? null,
          dungeonSeed: place.dungeonSeed ?? null,
          mif: place.mif ?? mapName,
        }
        : null,
      // ── a generated dungeon's own bookkeeping ──
      // The assembled level's four pieces, the openings the pass sealed in the level's outer
      // wall, the passages it cut between regions, and the two cells that decide whether the
      // dungeon is playable at all: where the player arrives, and where the way out was
      // stamped (`game/dungeonPlan.js`). Reported because "can the player get out, and is the
      // level closed?" is a property of the *assembly*, and the browser suite has to be able
      // to ask it of the running game rather than trust a separate node run.
      generated: current.rawLevel?.generated
        ? {
          seed: generated?.seed ?? place?.dungeonSeed ?? null,
          quadrants: current.rawLevel.quadrants ?? [],
          pieces: current.rawLevel.name ?? null,
          sealed: current.rawLevel.sealed?.sealed ?? null,
          regions: current.rawLevel.passages?.regions ?? null,
          passages: current.rawLevel.passages?.passages ?? null,
          arrival: current.rawLevel.arrival ?? null,
          exit: current.rawLevel.exit ?? null,
        }
        : null,
      city: current.city
        ? {
          kind: cityRequest.kind,
          seed: cityRequest.seed,
          climate: cityRequest.climate,
          weather: cityRequest.weather,
          inf: current.infName,
          blocksPerSide: cityRequest.blocksPerSide,
          start: current.city.start,
          reserved: current.city.reserved,
          stamped: current.city.stats.stamped,
          cells: current.city.stats.cells,
          missing: current.city.missing,
          blocks: current.city.slots.filter((s) => s.mif).map((s) => s.mif),
        }
        : null,
      // The gate the player is standing in, if any — the way out of a city and the way
      // into one (see `gateAtPlayer`). Reported for every kind of level: on a city page
      // `to` is `wilderness`, on a wilderness page `to` is `city`, and everywhere else
      // it is null.
      gate: gateAtPlayer(),
      // The sampler in force on this level's world textures: the engine's ground dial
      // (`?ground=off|default|max`), which is what keeps a plain sharp to the tree line.
      sampler: current.sampler,
      // ── the wilderness, and the gate between it and the city ──
      // A wilderness page answers with the country it built: which blocks the window
      // covers, where the window is in the 4 096-cell grid, the cells and pictures of
      // its scenery, and which gate the player is standing in (if any). Everything a
      // browser test needs to say "this is the country outside Daggerfall" without
      // reading a pixel.
      wild: wildRequest ? {
        seed: wildGrid?.seed ?? null,
        inf: current.infName,
        blocks: current.wild?.blocks ?? [],
        missingBlocks: current.wild?.missing ?? [],
        cityBlocks: current.wild?.cityBlocks ?? [],
        originRow: current.wild?.originRow ?? null,
        originCol: current.wild?.originCol ?? null,
        cell: (() => {
          const feet = current.motor?.pos ?? [0, 0, 0];
          const row = Math.round(feet[0] / CELL_SIZE - 0.5);
          const col = Math.round(feet[2] / CELL_SIZE - 0.5);
          return { row: row + (current.wild?.originRow ?? 0), col: col + (current.wild?.originCol ?? 0) };
        })(),
        onCityCell: (() => {
          const feet = current.motor?.pos ?? [0, 0, 0];
          return isCityCell(
            Math.round(feet[0] / CELL_SIZE - 0.5) + (current.wild?.originRow ?? 0),
            Math.round(feet[2] / CELL_SIZE - 0.5) + (current.wild?.originCol ?? 0),
          );
        })(),
        gate: gateAtPlayer(),
        flats: current.scenery?.flats?.length ?? 0,
        flatBatches: (current.sceneryBatches ?? []).length,
        flatNames: flatRecordNames(current.scenery?.flats ?? []).slice(0, 16),
        flatUnresolved: current.scenery?.unresolved ?? 0,
        flatAnimated: current.scenery?.animated ?? 0,
      } : null,
      // ── the doors, and the building the player is inside ──
      // How many shop doors this city has, which kinds they are, and which one the player
      // is standing in (the whole point of the feature, and what a player can see).
      doors: current.doors?.length ?? 0,
      doorKinds: [...new Set((current.doors ?? []).map((d) => d.kind))].sort(),
      // One record per street door, for a suite that walks to a *kind* of shop and
      // presses `E` from its own cell: the count and kind list above cannot say where.
      doorList: (current.doors ?? []).map((d) => ({ row: d.row, col: d.col, kind: d.kind ?? null, name: d.name ?? null })),
      // The `0xB` doors of this level: where each one is, what it is, whether it is
      // locked and how far open (`game/doors.js`).
      leaves: (current.leaves ?? []).map((leaf) => ({
        row: leaf.row, col: leaf.col, kind: leaf.kind, panel: leaf.panel,
        locked: leaf.locked, lockLevel: leaf.lockLevel, open: Number(leaf.open.toFixed(3)), target: leaf.target,
      })),
      // What the map's own item flats left on the floor (`game/dungeonItems.js`).
      loot: (current.loot ?? []).map((spot) => ({
        kind: spot.kind, itemIndex: spot.itemIndex, name: spot.name,
        row: spot.row, col: spot.col, drawn: Boolean(spot.drawn), taken: Boolean(spot.taken),
        lock: spot.lock ?? null,
      })),
      pack: {
        gold: player.gold ?? 0,
        keys: (player.keys ?? []).map((key) => key.lock),
        weapon: player.weapon ?? null,
      },
      lastDoor: dbg.lastDoor ?? null,
      lastLoot: dbg.lastLoot ?? null,
      // What this level's `.INF` says may live in it (the item table's monsters).
      monsterRoster: (current.roster ?? []).map((entry) => entry.monster),
      // Who the map put in this building, by their own trade (`smith`, `bartender`, …).
      peopleSpots: (current.peopleSpots ?? []).map((spot) => ({ role: spot.role, row: spot.row, col: spot.col })),
      nearDoor: (() => {
        const found = doorNear();
        return found ? { ...found.door, paces: Math.round(found.distance) } : null;
      })(),
      inside: entryCell
        ? {
          file: mapName,
          kind: shopForInteriorFile(mapName)?.kind ?? null,
          name: shopForInteriorFile(mapName)?.name ?? null,
          // `street` is the city cell the player went in by; `exit` is the cell of *this*
          // map they leave by, which is where they arrived.
          street: { row: entryCell.row, col: entryCell.col },
          exit: exitCell ? { row: exitCell.row, col: exitCell.col } : null,
          back: backHref,
          atDoor: Boolean(exitCell) && atObjective({ cellX: exitCell.row, cellZ: exitCell.col }).distance <= DOOR_REACH,
          town: fromPlace?.name ?? null,
        }
        : null,
      shops: {
        // **The keeper, not whoever is first in the roster.** A house's family is drawn after
        // the room's own list and a temple's priest sits inside it, so "index zero" was only
        // ever the keeper by luck — the person is asked instead (`populateShop`'s `keeper`).
        keeper: (townsfolk.find((person) => person.shop) ?? townsfolk[0])?.shop ?? null,
        keeperBank: (townsfolk.find((person) => person.shop) ?? townsfolk[0])?.bank ?? null,
        keeperLine: (townsfolk.find((person) => person.shop) ?? townsfolk[0])?.line ?? null,
        keeperDescription: (townsfolk.find((person) => person.shop) ?? townsfolk[0])?.description ?? null,
        // What the *building* is (`game/shops.js`'s own kind for this interior's file) and
        // whether its doors are open at this hour — which a house and a noble house never are.
        kind: shopTrade(),
        open: isOpen(shopTrade(), clockNow()),
      },
      stats: current.level.stats,
      warnings: mif.levels[current.index].warnings,
      missingTextures: current.built.model.subMeshes
        .map((sm) => `${sm.textureArchive}_${sm.textureRecord}`)
        .filter((k) => !renderer.textures.has(k)),
      errors: errors.length,
      // The menu: whether it is up, and whether the world is stopped with it.
      menuOpen: Boolean(life.menuOpen),
      paused: life.paused,
      // The world map overlay: a dungeon's way back to the surface goes through it
      // (`leaveThePlace`), so whether it is up is the answer to "did the player get out?".
      mapOpen: Boolean(life.mapOpen),
    }),
    levels: () => mif.levels.map((l, i) => ({ index: i, name: l.name, inf: l.info.toUpperCase(), warnings: l.warnings })),
    loadLevel: async (i) => { await loadLevel(i); dbg.reloaded++; },
    /**
     * Load a level and run the simulation until the player has settled on its
     * floor, so a caller does not have to poll `grounded`.
     */
    loadLevelAndSettle: async (i, seconds = 0.6) => { await loadLevel(i); step(seconds); },
    teleport: (x, y, z) => { current.motor.spawn(x, y, z); },
    /** Teleport to a cell of the current level, on its floor. */
    teleportCell: (row, col) => { current.motor.spawn(row * CELL_SIZE + CELL_SIZE / 2, current.level.floorY * CELL_SIZE, col * CELL_SIZE + CELL_SIZE / 2); },
    look: (yaw, pitch = 0) => { cam.yaw = yaw; cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)); },
    input: (code, down = true) => { if (down) { if (!keys.has(code)) pressed.add(code); keys.add(code); } else keys.delete(code); },
    keys: () => Array.from(keys),
    /** Whether the crouch stance is down and the eye height the motor is using. */
    stance: () => ({ crouching: current.motor.crouching, eye: current.motor.eyeAt()[1] }),
    spawnPoint: () => ({ x: current.spawn.x * CELL_SIZE, y: current.spawn.y * CELL_SIZE, z: current.spawn.z * CELL_SIZE }),
    /**
     * The settlement's gate cells — the **openings in its wall** (see `gateCellAt`).
     *
     * Exposed because a test that wants to walk the gate has to *stand* at one, and which
     * cells those are is data: they are the gaps the skeleton's own wall leaves, two cells
     * wide, in the settlement's outermost line.
     * @param {number} limit
     */
    gateCells: (limit = 8) => {
      const level = current?.level;
      if (!level) return [];
      /** @type {{row: number, col: number}[]} */
      const out = [];
      for (const [lr, lc] of settlementWallCells()) {
        if (out.length >= limit) break;
        const origin = current?.wild ?? null;
        const row = origin ? lr - origin.originRow + CITY_ORIGIN : lr;
        const col = origin ? lc - origin.originCol + CITY_ORIGIN : lc;
        if (gateCellAt(row, col)) out.push({ row, col });
      }
      return out;
    },
    /** Find the nearest standable cell to a point, for tests that need a target. */
    cellAt: (row, col) => {
      const { level } = current;
      if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return null;
      const c = level.cells[row * level.width + col];
      // **A cell the level does not hold is not a cell.** The bounds test above passes anything
      // that is not a number (`NaN >= depth` and `undefined >= depth` are both false, so both
      // walk through it) and indexes the array with a non-integer, which answers `undefined` and
      // then throws on `c.kind`. In a *test seam* that is the worst shape a failure can take: the
      // suite that walked into it reports "page error in cellAt" instead of the number it was
      // measuring. Returning null keeps the seam total — and `state()` is what reports the
      // arrival a caller should have used in the first place.
      if (!c) return null;
      return {
        kind: c.kind, solid: c.solid, chasm: c.floor.chasm, ceiling: c.ceiling,
        floorTexture: c.floor.texture, sideTexture: c.sideTexture,
        // Which way this cell's stair goes, if it is one — the level's own `*LEVELUP` art
        // (`mifLevel.js`'s `stairKindOf`). A generated level's way out is a stamped one, so a
        // test that wants to walk at the exit has to be able to find it.
        stair: c.stair ? c.stair : null,
        // The mass above: how many voxel layers of building this cell holds over the
        // ceiling line (`game/mifLevel.js`), which is what a city's upper floors are.
        upperLayers: c.upperLayers, upperRaised: c.upperRaised,
      };
    },
    /**
     * What the character's experience has bought (`game/progression.js`): the level on the
     * sheet, the level the experience has earned, the distance to the next threshold, and the
     * points a pending level is holding.
     */
    progression: () => {
      const p = progressOf({ ...player, xp });
      return {
        level: player.level, earned: p.earned, xp, next: p.next, needed: p.needed, into: p.into,
        owed: pendingLevels({ ...player, xp }),
        attributes: ATTRIBUTES.map((a, i) => ({ key: a.key, abbr: a.abbr, value: player.attributes[i] })),
        maxHealth: player.maxHealth, health: player.health,
        maxSpellPoints: player.maxSpellPoints ?? null,
        panel: levelUp ? { open: panelIsOpen('levelup'), points: levelUp.points, left: levelUp.left, owed: levelUp.owed, allocation: { ...levelUp.allocation } } : null,
        lastLevel: dbg.levelUp ?? null,
        sources: { xp: XP_SOURCE, points: ATTRIBUTE_POINTS_SOURCE, health: HEALTH_GAIN_SOURCE, max: ATTRIBUTE_MAX_SOURCE },
      };
    },
    /**
     * Pay experience, as a kill does — the seam a test uses instead of killing forty rats.
     * `awardExperience` is the same door the fight pays through, so the level-up it opens is
     * the level-up a player meets.
     */
    awardXp: (amount) => awardExperience(amount, 'A hand of experience'),
    /** Whether a panel is on screen, for a test that has to know what a player can see. */
    advance: (seconds = 1) => { step(seconds); },
    shotPose: () => {
      const { motor } = current;
      const spawn = current.spawn;
      motor.spawn(spawn.x * CELL_SIZE, spawn.y * CELL_SIZE, spawn.z * CELL_SIZE);
      cam.yaw = Number(window.__debug.__shotYaw ?? 0);
      cam.pitch = -0.06;
    },
  });

  // ── the loop ───────────────────────────────────────────────────────────────
  let last = performance.now();
  let painted = 0;
  const shotMode = params.has('shot');
  if (shotMode) window.__debug.shotPose();

  /**
   * Advance the simulation by `dt` seconds.
   *
   * The motor is handed the **render frame** once, exactly as the engine's own hosts
   * do (`scenes/dungeon.js`: `player.update(dt, input, …)`): `PlayerMotor.update`
   * accumulates the frame itself and runs its own fixed steps (`_acc`, `FIXED_DT`
   * *inside*), and it reads its render-frame-only inputs — the crouch **edge**, the
   * speed-adjustment latches — once per call. The first version of this loop wrapped
   * the call in a host-side fixed-step `while`, which called `update` up to eight times
   * per rendered frame: every one of those calls consumed the same crouch press, so a
   * player below 60 fps armed crouch and stand alternately and `C` flickered instead of
   * toggling once. `FIXED_DT` is still the motor's step; it is simply the motor's.
   */
  function step(dt) {
    lookFilter.tick(dt, cam);
    const input = inputOf(keys, pressed);
    // Dodge distance/timing is independent of walking statistics and uses the same swept
    // capsule as normal movement. Turning the camera cannot redirect a committed roll.
    const rolling = defence.rollT < DODGE.seconds;
    if (rolling) { input.forward = 0; input.strafe = 0; input.back = false; input.run = false; input.jump = false; }
    current.motor.update(Math.min(dt, MAX_FRAME_DT), input, cam.yaw, cam.pitch);
    if (rolling) {
      const activeDt = Math.min(dt, DODGE.seconds - defence.rollT);
      const move = DODGE.distance / DODGE.seconds * activeDt;
      current.collider.move(current.motor.pos, defence.rollDirection[0] * move, 0, defence.rollDirection[1] * move);
    }
    pushPlayerFromPeople();
    // The country has to keep up with the player (see `maybeSlideWilderness`).
    maybeSlideWilderness();
    // …and the save keeps up with them too: in the wild, where they stand is the world's
    // own memory of them, refreshed a beat at a time so a closed tab lands them where
    // they walked, not where they arrived (`maybeSaveWildFoot`).
    maybeSaveWildFoot(dt);
    // The press edges are this frame's: they have been handed to the motor above
    // (its own `update` keeps the whole frame, steps or not), so they cannot leak
    // into the next frame as a second press.
    pressed.clear();
    // The fight runs on the frame's own clock, not the fixed step: a monster's swing is
    // a timer, and a timer does not need to be exact to be fair.
    swingCooldown = Math.max(0, swingCooldown - dt);
    defence.rollT += dt;
    defence.parryT += dt;
    stepStamina(defence.stamina, dt);
  // The guard is no longer free: held, it drains the same bar a roll and a parry pay into;
  // drained bare, it gives way, and it does not come back up until the bar has breath in it
  // again — which is what makes a long fight a fight about breathing, not about the button.
  if (guarding()) {
    if (!stepGuardStamina(defence.stamina, dt, true)) {
      if (!defence.guardBroken) showNotice('Your guard gives way — let it rest before raising it again.', 1600);
      defence.guardBroken = true;
    }
  } else if (defence.guardBroken && defence.stamina.stamina >= PARRY.stamina) {
    defence.guardBroken = false;
  }
    combatFx.step(dt);
    // The held heavy announces itself while the hold *runs*, not only when it lands: a
    // thread of amber sparks in front of the player, thicker as the charge fills, and a one
    // beat notice when it is fully charged — the wind-up the player's own attack gets, the
    // same language a monster's wind-up speaks.
    if (defence.charging) {
      const held = dbg.seconds - defence.chargeStart;
      const charge = chargeScale(held);
      // **The tell belongs to an ARMED heavy, not to the press.** A hold shorter than
      // `HEAVY.armSeconds` (0.18 s) is a light swing being wound, not a heavy: it has no
      // tell of its own, and a plain left click — which is exactly that, a press and
      // release inside the arm — must not spray anything. It did: the pulse ran from the
      // press's first frame, so a click put a burst of amber at the player's own chest
      // (reported as "random yellow particles come out of me when I left click").
      if (!charge.heavy) defence.chargePulse = 0;
      else {
        defence.chargePulse -= dt;
        if (defence.chargePulse <= 0) {
          defence.chargePulse = 0.12;
          const feet = feetOf();
          const fx = Math.sin(cam.yaw);
          const fz = Math.cos(cam.yaw);
          // …and it reads as a thread of sparks *ahead* of the player, clear of the camera:
          // the old point sat 0.9 m out at eye height, which in first person is the near
          // plane's own face.
          combatFx.burst(feet[0] + fx * 1.35, feet[1] + 1.05 + charge.progress * 0.25, feet[2] + fz * 1.35, 'charge', charge.heavy);
          // The tell is counted **on its own** (`dbg.chargeBursts`), because the scene's whole
          // burst tally also moves when a creature's blow lands, when a parry rings and when
          // a charge stamps dust — and a check that read the total could not tell the
          // player's own tell from somebody else's effect (measured: a light press "emitted"
          // a burst because a rat chose that 100 ms to hit).
          dbg.chargeBursts = (dbg.chargeBursts ?? 0) + 1;
        }
      }
      if (charge.heavy && !chargeFullShown) {
        chargeFullShown = true;
        showNotice('Heavy armed — release! (unblockable answer: roll)', 800);
      }
    } else chargeFullShown = false;
    // The camera's wound decays in about half a second.
    screenShake = Math.max(0, screenShake - dt * 2.2);
    if (dbg.seconds > defence.riposteUntil) { defence.riposte = 0; defence.riposteTarget = null; }
    // **Hit-stop dilates the world, not the fight's arithmetic.** While it holds, the
    // creatures and the folk move in slow motion — the arrest is felt — and the player
    // walks at full speed, because being slow *in* the hit-stop is the misread it punishes.
    const simDt = hitStop > 0 ? dt * 0.15 : dt;
    hitStop = Math.max(0, hitStop - dt);
    stepMonsters(simDt);
    stepHostileFolk(simDt);
    stepBoltsSim(simDt);
    // Water and lava, after the walk: where the player ended this step is what decides
    // whether they are in it (see `updateWater`).
    updateWater(dt);
    // …and the surfaces themselves flow on the same frame clock, so a paused scene is a
    // still pond (`stepSurfaces`).
    stepSurfaces(dt);
    // The doors swing on the same clock, for the same reason.
    stepDoors(dt);
    // …and the people of a settlement walk about it (`stepTownsfolk`).
    stepTownsfolk(dt);
    // The street's dead are cleared only after their own death art has played: a body is
    // out of the crowd and out of the fight the instant it falls (`p.down`), but it lies
    // where it fell for `FOLK_DIE_SECONDS` and only then leaves — the next visit does not
    // stand the player in front of a man they killed, and the killing was *seen*.
    if (townsfolk.some((p) => p.down && dbg.seconds - (p.downAt ?? 0) >= FOLK_DIE_SECONDS)) {
      townsfolk = townsfolk.filter((p) => !p.down || dbg.seconds - (p.downAt ?? 0) < FOLK_DIE_SECONDS);
    }
    for (const actor of [...townsfolk, ...monsters]) {
      stepActorAnimation(actor, { cycleMetres: WALK_CYCLE_METRES, maxStep: Math.max(1, MONSTER_SPEED * dt * 1.5) });
    }
    animClock += dt;
    // The swing, if one is playing, runs on the same clock. Which *frame* a figure shows
    // is decided in `liveBatches`, from whether that figure moved: a walk cycle belongs
    // to walking, and one frame counter for the whole level made every creature, guard
    // and townsperson walk on the spot while standing still.
    swingAnim = Math.max(0, swingAnim - dt);
    // The weapon's own clock: the draw, the swing, the hold and the sheath (the state
    // machine is Arena's, `game/weaponView.js`).
    weaponRig.step(dt);
    if (monsters.length && (dbg.frame & 7) === 0) updateCombatHud();
    if ((current.doors?.length || entryCell || current.city || wildRequest) && (dbg.frame & 7) === 0) refreshNearDoor();
    // The hour keeps walking: roughly once a second this asks whether the night the sky
    // was composed for has arrived or left (see `maybeRecomposeSky` on `ensureSky`).
    if ((dbg.frame & 63) === 0) maybeRecomposeSky();
    // ── walking into a stairway takes it ───────────────────────────────────────
    // The original's own rule: a stairway is a wall with its own art, and a player who walks
    // into it goes up or down — there is no key to press. `E` at one works too (`interact`),
    // which is what a player who stops to look will try; this is what a player who simply
    // walks at it gets. The reach is short (the player is almost touching the cell) and the
    // cooldown is what keeps an arrival from being read as another walk-into.
    stairCooldown = Math.max(0, stairCooldown - dt);
    if (!life.paused && current?.level) {
      // The HUD's own line changes as the player comes up to a stair and leaves it behind,
      // so the panel is rewritten when *that* changes rather than every frame.
      const seen = stairNear();
      const key = seen ? `${seen.row},${seen.col},${seen.cell.stair}` : '';
      if (key !== stairSeen) {
        stairSeen = key;
        dbg.stairSeen = key || null;
        updateCombatHud();
      }
      if (!stairCooldown && seen && seen.distance <= CELL_SIZE * 0.95) {
        stairCooldown = STAIR_COOLDOWN;
        void useStair(seen);
      }
    }
    dbg.seconds += dt;
    // ── walking onto a `*TRIG` cell fires it, once per level visit ────────────
    // The level's own rule (`game/levelTriggers.js`): the trigger's prose on the
    // notice, its `@SOUND` clip at the file's own rate — the same dev door and
    // autoplay law the fanfare walks. A cell already visited says nothing again,
    // which is the level's own way: its `~`-prefixed records are once-only tells.
    if (current?.triggers?.size && !life.paused) {
      const row = Math.floor(current.motor.pos[0] / CELL_SIZE);
      const col = Math.floor(current.motor.pos[2] / CELL_SIZE);
      const cellKey = `${row},${col}`;
      // **A walk-onto is a step, not an arrival.** Three rules, each one a defect that was
      // heard rather than seen ("I hear randomly the level up sound in my computer" — the
      // level's own `DRUMS.VOC` is exactly such a sting):
      //
      //   1. the cell must have *changed* — standing in a trigger cell is not firing it;
      //   2. the frame's movement must be a plausible **step** — the same law the walk cycle
      //      uses (`actorAnimation`: teleports do not advance a stride) — so the spawn cell a
      //      level drops the player on, and every `warp`, say nothing. The bound is in
      //      *cells* (no step crosses two of them in one frame, however long the frame is;
      //      a page under load runs frames of a second, where a walk is 1.7 m), and a
      //      teleport is several cells at once by definition;
      //   3. a **cooldown** between sounds, because a hall of trigger cells would otherwise
      //      machine-gun a clip every frame the player crosses one.
      const feet = feetOf();
      const stepped = lastTriggerFeet
        ? Math.hypot(feet[0] - lastTriggerFeet[0], feet[2] - lastTriggerFeet[2])
        : 0;
      lastTriggerFeet = feet;
      const hit = current.triggers.get(cellKey);
      if (hit && !firedTriggers.has(hit) && cellKey !== lastTriggerCell
        && stepped > 0.001 && stepped <= CELL_SIZE * 2) {
        firedTriggers.add(hit);
        lastTriggerCell = cellKey;
        const event = triggerEvent(current.inf, hit);
        dbg.trigger = { cell: cellKey, text: event.text?.kind ?? null, sound: event.sound };
        if (event.text) showNotice(event.text.text, 5000);
        if (event.sound && dbg.seconds - lastTriggerSoundAt >= TRIGGER_SOUND_COOLDOWN) {
          lastTriggerSoundAt = dbg.seconds;
          const folder = source?.arenaPath ?? params.get('arena') ?? null;
          void playVocFile(event.sound, { arenaPath: folder ?? 'C:/arenaproject/arena/ARENA', volume: TRIGGER_SOUND_VOLUME });
        }
      } else if (cellKey !== lastTriggerCell) {
        // Walking out of a cell (or through one that says nothing) is what lets the next
        // visit to a *fired* cell stay quiet without leaving the bookkeeping stale.
        lastTriggerCell = cellKey;
      }
    }
    dbg.frame++;
  }

  /**
   * **Keep the player inside the wilderness window.**
   *
   * The original keeps a 2×2-block window of the country around the player and re-centres it
   * a block at a time as they move — `ArenaWildUtils::getCenteredWildOrigin`, the function
   * `wildernessWindowOrigin` ports — which is how a 4096-cell-wide wilderness feels like one
   * place while only four blocks of it exist at a time. This build assembled the window
   * **once**, at boot, so it was a 128×128 island in the middle of nowhere: walk 32 cells out
   * of the settlement and the geometry ran out under the player's feet and they fell out of
   * the world — the "you can fall off the map" report, and the reason the country felt like a
   * backdrop rather than a place. Sliding the window is the fix, and it is cheap now that a
   * scene swap happens inside this page (`goInPlace`): the next window is the same country
   * assembled around the cell the player is standing on, and they arrive on exactly it.
   */
  function maybeSlideWilderness() {
    if (!wildRequest || !current?.wild || sliding || !life.alive) return;
    const { originRow, originCol } = current.wild;
    const feet = current.motor?.pos;
    if (!feet) return;
    const row = Math.round(feet[0] / CELL_SIZE - 0.5) + originRow;
    const col = Math.round(feet[2] / CELL_SIZE - 0.5) + originCol;
    const next = wildernessWindowOrigin(row, col);
    if (next.row === originRow && next.col === originCol) return;
    sliding = true;
    dbg.windowSlide = { at: { row, col }, from: [originRow, originCol], to: [next.row, next.col] };
    const onward = new URLSearchParams(params);
    onward.set('wild', `${row},${col}`);
    void goInPlace(onward);
  }

  /** How often the wild's own save keeps up with the walk, in seconds — GUESS: a tick a
   * player's tab wait will rarely miss. */
  const WILD_SAVE_EVERY = 4;
  /** Seconds until the wild's own save ticks again. */
  let wildSaveIn = WILD_SAVE_EVERY;

  /**
   * The wild's own save keeps up with the walk.
   *
   * A wilderness window is a *view* of a fixed grid: whatever the player does, their cell
   * of that grid is well-defined. Writing it four (GUESS) seconds at a time means a tab
   * closed in the deep country lands the player a few cells back at worst — a walk, not a
   * loss — while the once-per-slide write (`goInPlace` carries the URL) covers the slide.
   *
   * The write intentionally touches **only the last-location record** (`wild` is its own
   * field; see `game/save.js`), because the world's *state* — stones turned, chests looted
   * — is the world memory's business and already is.
   */
  function maybeSaveWildFoot(dt) {
    if (!wildRequest || !current?.motor?.pos) return;
    wildSaveIn -= Math.max(0, Number(dt) || 0);
    if (wildSaveIn > 0) return;
    wildSaveIn = WILD_SAVE_EVERY;
    const feet = current.motor.pos;
    const cell = {
      row: Math.round(feet[0] / CELL_SIZE - 0.5) + (current.wild?.originRow ?? 0),
      col: Math.round(feet[2] / CELL_SIZE - 0.5) + (current.wild?.originCol ?? 0),
    };
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? '{}');
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ ...saved, wild: cell }));
    } catch { /* storage refused; the world map's fallback applies */ }
  }

  /**
   * The level's own street grid, as a path book (`game/townPaths.js`), built on first use.
   *
   * A **city** is the only level with streets and doors to walk between; a dungeon or a
   * wilderness window answers null, and every person there keeps the idle step. The grid is the
   * decoded level the collider was built from, so a route a person walks is a route the player
   * could walk: the same cells, the same walls.
   *
   * @returns {ReturnType<typeof createPathBook>|null}
   */
  function townWalkBook() {
    if (townWalk) return townWalk;
    const level = current?.level;
    if (!level || !current?.doors?.length) return null;
    const nav = townGrid({
      level,
      // A doorway's own street cell is walkable even when the door leaf is solid: people walk
      // past a shop, and a shopkeeper has to reach their own counter.
      extraOpen: (row, col) => (current.doors ?? []).some((door) => door.row === row && door.col === col),
    });
    townWalk = createPathBook(nav);
    // **The grid itself is kept too**, not only the book over it: a wanderer's beat is a cell a
    // few paces from their own door (`livingWorld.streetGoal`), and the grid that says which
    // cells of this level can be stood on is the level's own — the same one the walk is planned
    // over, so a beat is standable rather than merely near.
    townWalkNav = nav;
    dbg.townGrid = { width: nav.width, depth: nav.depth, walkable: countWalkable(nav) };
    return townWalk;
  }

  /** How many cells of a grid a person can stand on — the path book's own denominator. */
  function countWalkable(nav) {
    let n = 0;
    for (let row = 0; row < nav.depth; row++) for (let col = 0; col < nav.width; col++) if (nav.open(row, col)) n++;
    return n;
  }

  /**
   * The people of a settlement **go about their day**: each one walks to the place their plan
   * sends them.
   *
   * Two passes live here, and the second is the one that makes a town a town rather than a
   * crowd of pacing figures:
   *
   *  1. **the idle step.** The first fix for "npcs dont move around" gave every person a wait
   *     and then one random cell of movement (`home` + a neighbour from their own seeded draw).
   *     It is still here, as the fallback for a person with nowhere to go — no door of their
   *     trade in this level, no path found, a town whose own data names no destination.
   *  2. **the day's walk.** The plan `game/livingWorld.js` already draws for a person
   *     (`dayPlanFor` → `currentActivity`) names *what* they are doing — working, praying,
   *     eating, drinking, going home to sleep — and `streetGoal` names *where* that is: the
   *     nearest door of their trade, their temple, the tavern, or their own home cell. The walk
   *     to it is a real path over the level's own streets (`game/townPaths.js`, the twin's
   *     `livingWorld/townPaths.js`): the person really walks there, turns at the corners and
   *     goes in, and a player who follows a smith at seven in the morning watches him cross the
   *     square to his own shop.
   *
   * The path book is asked for at most `PATH_ASKS_PER_FRAME` walks a frame and searches inside
   * `PATH_CELLS_PER_FRAME` cells (both in `townPaths.js`, both the twin's own kind of budget):
   * a town's morning is a hundred people changing their minds at once, and a hundred A*
   * searches in one frame is a hitch a player feels.
   *
   * The figure's *view* still turns to the eye (`liveBatches`), which is what "they look at
   * you" means; the walk cycle follows the movement, because the batch's own rule is that a
   * walk belongs to walking. A keeper stays where they are (`person.shop`) — a shopkeeper who
   * wandered off would leave the counter empty — and somebody mid-conversation stands and
   * faces the player, as before.
   *
   * @param {number} dt
   */
  /**
   * The walked line, begun where the person *stands* rather than at the centre of the cell they
   * were last placed in. A conversation holds a person mid-cell and `place` is rounded, so a
   * route built straight from `pathLine` snapped them up to 1.25 m on its first frame — the
   * reported "npcs teleport around".
   */
  function lineFrom(x, z, line) {
    const pts = [[x, z], ...line.pts];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, len: cum[cum.length - 1] ?? 0, cum };
  }

  /** Is anybody standing (not walking) close enough to a point that a walker would have to stop? */
  function personInWay(person, x, z) {
    for (const other of townsfolk) {
      if (other === person || other.down || other.shop || other.walking || other.atHome) continue;
      if (Math.hypot(other.world.x - x, other.world.z - z) < PERSON_CLEARANCE) return true;
    }
    return false;
  }

  /** Is another person already on this cell, or stepping onto it? */
  function occupiedCell(row, col, self) {
    return townsfolk.some((other) => other !== self && !other.down && !other.atHome
      && ((other.place?.row === row && other.place?.col === col)
        || (other.walk?.to?.row === row && other.walk?.to?.col === col)));
  }

  /**
   * The player does not walk through a person: if the feet are inside a body's radius, they are
   * set on its edge (where the wall allows). It runs after the motor, so the motor's own step is
   * what gets corrected, and the person is never moved.
   */
  function pushPlayerFromPeople() {
    if (!townsfolk.length || !current?.motor) return;
    const pos = current.motor.pos;
    const min = PERSON_RADIUS + PLAYER_RADIUS;
    for (const person of townsfolk) {
      // A person indoors is not a body the player can walk into: they are behind a door the
      // port has no interior for, and an invisible wall on the pavement is worse than nothing.
      if (person.shop || person.down || person.atHome) continue;
      const dx = pos[0] - person.world.x;
      const dz = pos[2] - person.world.z;
      const d = Math.hypot(dx, dz);
      if (d >= min || d === 0) continue;
      const nx = person.world.x + (dx / d) * min;
      const nz = person.world.z + (dz / d) * min;
      if (walkableWorld(nx, nz)) { pos[0] = nx; pos[2] = nz; }
    }
  }

  function stepTownsfolk(dt) {
    if (!townsfolk.length || !current?.level) return;
    const level = current.level;
    const standable = (row, col) => {
      if (row < 1 || col < 1 || row >= level.depth - 1 || col >= level.width - 1) return false;
      const cell = level.cells[row * level.width + col];
      if (!cell || cell.solid || cell.floor?.chasm) return false;
      if (cell.kind === 'entity' || (cell.entityFlatIndex ?? -1) >= 0) return false;
      // A person does not stand in a doorway either: the door swings there.
      if ((current.leaves ?? []).some((leaf) => leaf.row === row && leaf.col === col)) return false;
      return true;
    };
    // **Somebody being spoken to stands and looks at the player** — the hold is inside the
    // loop below, and it comes *before* the step rather than after it. A conversation is not
    // a pursuit: a person's step crosses a whole cell (2.5 m) in 0.75 s while the reach for
    // talking is 4 m, so somebody who finishes the step they happened to be on can walk out
    // of earshot *during their own sentence* — `talk()` then answers "there is nobody near
    // enough to speak to" in the middle of a conversation, which is how the browser suite
    // found this (asking twice answered nothing at all).
    const speakingTo = talking?.person ?? null;
    // The frame's own searching budget, spent once (see `townPaths.js`). The book is rebuilt
    // with every level (`populateTown`), so its grid is always this level's own streets.
    const walkBook = townWalkBook();
    walkBook?.frame();
    const clock = clockNow();
    for (const person of townsfolk) {
      if (person.shop) continue;
      // A person the regard ledger has turned against the player has dropped their day
      // (`stepHostileFolk` marks them and drives them): their walk is *abandoned* here rather
      // than finished, or they would stroll to the tavern while charging.
      if (person.hostile) {
        person.route = null;
        if (person.walk) person.walk.to = null;
        // The whole day is dropped when the town turns on the player (`stepHostileFolk`),
        // and the indoors flag belongs to the day: it goes with it, or a hostile man who
        // was at home when the town turned would be invisible while he charged.
        person.atHome = false;
        continue;
      }
      person.rng = person.rng ?? new ArenaRandom((Math.round(person.world.x * 71 + person.world.z * 131) + 4483) >>> 0);
      // **Nobody sets off on the frame they are placed.** A person who has never waited has
      // no `wait`, and the line below read that as 0 — so every person in a freshly built town
      // began their first step on the *same* frame: the whole street walking in lockstep the
      // moment the player arrived, and staying in step in bursts ever after. The first wait is
      // drawn from the person's own RNG, from a shorter window than the ones between steps: a
      // town should start to live in the first second of arriving, but not on one signal.
      if (person.wait === undefined) person.wait = person.rng.nextBelow(1000) / 1000 * TOWN_WAIT_MIN * 2;
      const walk = person.walk ?? (person.walk = { t: 0, from: null, to: null });
      if (person === speakingTo) {
        // **Stop where you stand and look at the player.** The step they are on is
        // *abandoned*, not finished (see `speakingTo`), and their current position becomes the
        // place they will step from when the conversation ends — so nothing snaps back to a
        // cell centre in front of the player.
        const eye = feetOf();
        person.facing = Math.atan2(eye[0] - person.world.x, eye[2] - person.world.z);
        if (walk.to) {
          const row = Math.round(person.world.x / CELL_SIZE - 0.5);
          const col = Math.round(person.world.z / CELL_SIZE - 0.5);
          person.place = { row, col };
          walk.to = null;
          walk.t = 0;
          walk.from = { row, col, x: person.world.x, z: person.world.z };
        }
        person.walking = false;
        continue;
      }
      // ── a step of the idle walk, in progress ───────────────────────────────
      //
      // **The idle step used to be a target nobody ever walked to.** `walk.to` was set at the
      // bottom of this loop and nothing read it back, so a person the fallback sent somewhere
      // stayed exactly where they were: the walk cycle, the ``walking`` flag and the cell in
      // `place` all agreed with a step that never happened, which is why a street could look
      // alive while its people never left their paving stone. What follows is the motion the
      // route walk already had — from the cell they were on to the one the draw picked, in the
      // same `TOWN_WALK_SECONDS` a route takes to cross a cell — with `place` becoming the new
      // cell only on arrival, so nobody is standing in a doorway they have not reached.
      if (walk.to) {
        walk.t = Math.min(TOWN_WALK_SECONDS, walk.t + dt);
        const from = walk.from ?? { x: person.world.x, z: person.world.z };
        const k = TOWN_WALK_SECONDS > 0 ? walk.t / TOWN_WALK_SECONDS : 1;
        person.world.x = from.x + (walk.to.x - from.x) * k;
        person.world.z = from.z + (walk.to.z - from.z) * k;
        person.walking = true;
        if (walk.t >= TOWN_WALK_SECONDS) {
          person.place = { row: walk.to.row, col: walk.to.col };
          person.world.x = walk.to.x;
          person.world.z = walk.to.z;
          walk.to = null;
          walk.t = 0;
          walk.from = { row: person.place.row, col: person.place.col, x: person.world.x, z: person.world.z };
          person.walking = false;
          person.wait = TOWN_WAIT_MIN + person.rng.nextBelow(1000) / 1000 * (TOWN_WAIT_MAX - TOWN_WAIT_MIN);
        }
        continue;
      }
      // ── the day's own walk, when there is a path to it ─────────────────────
      // Checked before the idle step, so a person with somewhere to be is *going* there. A
      // path is kept on the person (`person.route`) and walked to its end; only then is the
      // goal asked for again, which is what makes a person walk *to* the shop rather than
      // restarting the journey every frame.
      if (person.route) {
        const route = person.route;
        // Somebody standing in the way holds this person. Walkers do not shove the standing; a
        // route that stays blocked for three seconds is given up, and the day picks a new goal.
        const ahead = pointOnLine(route.line, Math.min(route.line.len, route.at + TOWN_SPEED * dt));
        if (personInWay(person, ahead.x, ahead.z)) {
          person.jammed = (person.jammed ?? 0) + dt;
          person.walking = false;
          if (person.jammed > 3) { person.route = null; person.jammed = 0; person.awaiting = 0; }
          continue;
        }
        person.jammed = 0;
        route.at = Math.min(route.line.len, route.at + TOWN_SPEED * dt);
        const point = pointOnLine(route.line, route.at);
        person.world.x = point.x;
        person.world.z = point.z;
        person.facing = point.yaw;
        person.walking = true;
        if (route.at >= route.line.len) {
          person.place = { row: route.goal.row, col: route.goal.col };
          person.route = null;
          person.walking = false;
          person.awaiting = 0;
          walk.from = { row: route.goal.row, col: route.goal.col, x: person.world.x, z: person.world.z };
          person.wait = TOWN_WAIT_MIN + person.rng.nextBelow(1000) / 1000 * (TOWN_WAIT_MAX - TOWN_WAIT_MIN);
          dbg.arrivals = (dbg.arrivals ?? 0) + 1;
        }
        continue;
      }
      person.wait = (person.wait ?? 0) - dt;
      if (person.wait > 0) continue;
      // ── what the day says to do next ───────────────────────────────────────
      //
      // **Three answers, and they are different answers.** `get` (and `want`) hand back the
      // walk's cells, `null` for "there is no way there", and `undefined` for **not answered
      // yet** — the search is queued and `run` at the end of this step is what performs it
      // (`game/townPaths.js`). Reading the last two as one thing is what the town's people did
      // at first: nobody ever *ran* the queue, so the book accumulated twenty-six unanswered
      // asks and every person fell through to the idle step for ever, which is the reported
      // "npcs dont move around" wearing a different hat.
      if (walkBook) {
        const goal = streetGoal(person, clock, { doors: current.doors ?? [], nav: townWalkNav });
        // The book's own ends are `[row, col]` pairs, not cells with names on them
        // (`game/townPaths.js`'s `keyOf` reads the two numbers): a person handed the book an
        // object and the search died on `from is not iterable`.
        const here = { row: person.place.row, col: person.place.col };
        // ── a person whose day says they are home **rests, and does not pace their door** ──
        //
        // Measured on Daggerfall at 23:00 (`.scratch/nightprobe.mjs`, 2026-10-15): 41 of the
        // town's 48 people moved more than 20 cm in twenty seconds and **not one of them moved
        // more than 2.5 m** — the whole street shuffling inside a cell. The cause is this loop's
        // own fall-through: the day plan puts them at `home`, `streetGoal` hands back the cell
        // they are standing on, the goal is therefore "already arrived", and the idle step below
        // then walks them *off* their doorstep — so the next ask sends them back.
        //
        // A person is at home to *be* home. They stand still for as long as their own plan's
        // block lasts (`currentActivity`'s `until`, which is the plan's own number rather than a
        // new constant), and when it ends the loop asks the day again — at dawn they walk to
        // work, at closing they walk home, and somebody whose block is thirty minutes long is
        // back to being a person in the street in thirty minutes. The night street is then what
        // Arena's is: quiet, with only the folk whose day keeps them out still walking.
        //
        // **The flag is `person.atHome`, and it is set here rather than cleared at the top of
        // the turn.** The first version of this branch cleared it at the top of every person's
        // turn and set it again only on the frame the day was asked — and the branch below it
        // (`if (person.wait > 0) continue`) means the day is asked *once* per rest block, so
        // the flag was true for exactly one frame in a night and false for the rest: the whole
        // town was in bed and every one of it was still drawn. Measured with `.scratch/nightprobe.mjs`
        // at 23:00 — "indoors 0" with "drawn 48". A flag that describes where somebody is for
        // the next six hours has to be written where the six hours are decided.
        const atHome = Boolean(goal) && /^home/.test(goal.reason ?? '')
          && goal.row === here.row && goal.col === here.col;
        person.atHome = atHome;
        if (atHome) {
          const activity = currentActivity(person, clock);
          const left = Math.max(0, Number(activity?.until ?? clock.minutes) - Number(clock.minutes ?? 0));
          person.wait = Math.max(TOWN_WAIT_MIN, secondsForMinutes(left));
          person.walking = false;
          // **And they are indoors, which the street has to show.** The port has no home
          // interiors to put them in (the install's own data records no doors for houses), so a
          // person at home is *not drawn* rather than drawn asleep on the pavement: the crowd
          // empties as the town goes to bed and fills again at dawn, which is what Arena's own
          // streets do. `townsfolk` still holds them — the regard ledger, a job and a name are
          // not removed by an hour — and `people()` reports the flag so a probe can tell "nobody
          // is out" from "the scene stopped stepping them".
          person.atHome = true;
          continue;
        }
        const from = [here.row, here.col];
        const to = [goal?.row, goal?.col];
        if (goal && (goal.row !== here.row || goal.col !== here.col)) {
          const cells = walkBook.get(from, to);
          if (Array.isArray(cells) && cells.length > 1) {
            person.route = { line: lineFrom(person.world.x, person.world.z, pathLine(cells, CELL_SIZE)), at: 0, goal, reason: goal.reason };
            person.facing = pointOnLine(person.route.line, 0).yaw;
            person.awaiting = 0;
            // A route replaces the step in progress rather than racing it: the walk above
            // reads `walk.to`, and a person with both would be interpolated towards a cell
            // along the idle step while their route moved them somewhere else.
            walk.to = null;
            person.walking = false;
            walk.from = { row: here.row, col: here.col, x: person.world.x, z: person.world.z };
            dbg.departures = (dbg.departures ?? 0) + 1;
            continue;
          }
          if (Array.isArray(cells)) {
            // The goal is the cell they are standing on: there is no walk to make, and the
            // town's own data has nothing further to say about them this hour.
            person.wait = TOWN_WAIT_MAX;
            continue;
          }
          // Waiting on the book. **Stand still** — a person who wandered off would ask again
          // from a new cell every step, which is a fresh search each time, and the walk they
          // were waiting for would arrive for a cell they had already left.
          if (walkBook.want(from, to) === undefined) {
            person.awaiting = (person.awaiting ?? 0) + 1;
            if (person.awaiting < TOWN_PATH_PATIENCE) {
              person.wait = TOWN_PATH_WAIT;
              continue;
            }
            person.awaiting = 0;
          }
        } else {
          person.awaiting = 0;
        }
      }
      // One step to a neighbour that can be stood on, chosen from the person's own draw.
      const home = walk.from ?? { row: person.place.row, col: person.place.col, x: person.world.x, z: person.world.z };
      // A step never goes into a cell another person is standing on or stepping into.
      const options = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) =>
        standable(home.row + dr, home.col + dc) && !occupiedCell(home.row + dr, home.col + dc, person));
      if (!options.length) { person.wait = TOWN_WAIT_MAX; continue; }
      const [dr, dc] = options[person.rng.nextBelow(options.length) % options.length];
      const row = home.row + dr;
      const col = home.col + dc;
      person.facing = Math.atan2(dr, dc);
      walk.from = home;
      walk.to = { row, col, x: (row + 0.5) * CELL_SIZE, z: (col + 0.5) * CELL_SIZE };
      walk.t = 0;
    }
    // **And now the searching.** The people above have *asked* the book for their walks (that
    // is what `want` does) and this is the frame's own slice of the work: `run` performs what
    // is queued inside the cells `frame` handed out, so a town's morning of a hundred people
    // changing their minds costs one bounded slice of searching a frame rather than a hundred
    // searches in one. It runs **after** the asks so this frame's own queue is included, which
    // is why a person's first step of a walk happens a frame after they decide to make it.
    walkBook?.run();
  }

  /**
   * Point every creature batch at its live monsters, and the player's own batch at the
   * player. Called from `paint`, because a batch follows what moved this frame.
   *
   * @returns {object[]} the batches to draw
   */
  function liveBatches() {
    const out = [];
    // **Everybody looks at the player.** A person's angle is one of the archive's five
    // views, and which one shows them best depends on where they are looking and where the
    // eye is: `viewFacing` is that answer. Without this a townsman keeps whatever angle the
    // roster handed out — the reported "npcs don't look at you, they have a static random
    // png that maybe pictures them turned back or to the side".
    const eye = feetOf();
    for (const person of townsfolk) {
      // **A person the player is speaking to answers in their own art.** The archive ships a
      // talk sheet for the town's generic men and women (`MLGEN0#T.CFA`, `FMGEN0#.CFA`) —
      // loaded with the rest of their family (`loadPeopleActions`) — and while the panel is
      // open the figure stands in it and its frames run on their own clock below. A family
      // whose talk sheet this install lacks keeps the standing frame it always had.
      const talk = person.actions?.talk
        && talking?.person === person
        && spriteSets.has(person.actions.talk) ? person.actions.talk : null;
      person.talkingArt = talk;
      const file = talk ?? (person.attack
        ? viewFileFor(person.outfit, 1).replace('WLK.CFA', 'ATT.CFA')
        : viewFileFor(person.outfit, viewFacing(person.facing, person.world.x, person.world.z, eye[0], eye[2])));
      if (spriteSets.has(file)) person.file = file;
    }
    // Resolve each actor's frame first, then batch only identical file/frame/facing draws.
    // Stationary neighbours never inherit another actor's stride.
    let figures = 0;
    const groups = new Map();
    for (const actor of [...monsters, ...townsfolk]) {
      // **Somebody at home is not on the street.** Their day put them indoors
      // (`stepTownsfolk`'s rest branch), the port has no home interior to put them in, and a
      // figure standing on its own doorstep all night is exactly what "the town is frozen"
      // looks like. They keep their ledger, their trade, their name and their sheet —
      // `townsfolk` still holds them, `townsfolk()` reports them with `atHome`, and `file` is
      // still the sheet they would be showing — they are simply not part of the street's crowd
      // until their day sends them out again. Skipped here rather than by emptying `file`,
      // because the sheet a person *has* is what the roster's own checks read.
      if (actor.atHome) continue;
      let file = actor.file;
      // A fallen person draws their own death sheet for as long as the body lasts: the
      // family's `die` file when this install ships one (`peopleKinds.js`).
      if (actor.down && actor.actions?.die && spriteSets.has(actor.actions.die)) file = actor.actions.die;
      if (actor.monster?.sprite) {
        const action = actor.death ? 6 : actor.attack ? 1 : viewFacing(actor.facing ?? 0, actor.world.x, actor.world.z, eye[0], eye[2]);
        const candidate = `${actor.monster.sprite}${action}.CFA`;
        if (spriteSets.has(candidate)) file = candidate;
      }
      const set = spriteSets.get(file);
      if (!set) continue;
      // A talking figure runs its talk sheet's frames on a steady clock — a talk is not a
      // stride, so it must not be driven by metres walked (`actorFrame`'s own law) — and a
      // fallen one runs its death sheet once, then holds the last pose until it is cleared.
      const frames = Math.max(1, set.cfa.frames.length);
      const frame = actor.down
        ? Math.min(frames - 1, Math.floor(((dbg.seconds - (actor.downAt ?? dbg.seconds)) / FOLK_DIE_SECONDS) * frames))
        : actor.talkingArt
          ? Math.floor(dbg.seconds * TALK_FRAMES_PER_SECOND) % frames
          : actorFrame(actor, frames, { attack: actor.attack });
      const mirrored = !actor.attack && !actor.death && actorMirrored(actor.facing ?? 0, actor.world.x, actor.world.z, eye[0], eye[2]);
      actor.renderFrame = `${file}#${frame}`;
      actor.renderMirrored = mirrored;
      const key = `${file}#${frame}:${mirrored ? 1 : 0}`;
      let group = groups.get(key);
      if (!group) groups.set(key, group = { set, frame, mirrored, actors: [] });
      group.actors.push(actor);
    }
    // **Two counters, because one sheet can be two things at once.** `live` is "how many
    // figures this batch is drawing this frame", and the player's own two sets are set back to
    // zero at the end of this function because they are drawn by name below rather than as part
    // of the crowd. `crowd` is "how many of those are the town's folk and the creatures", and it
    // is never zeroed for the player: a person and the player can share **one `.CFA`** (a
    // person's sheet is `<index><armour><action>.CFA` — `05CHNWLK.CFA` is townsman five in chain
    // — and the player's own back view is `<view><armour><action>.CFA` with view `05`, so a
    // player in chain and that townsman resolve to one string and one uploaded set), and zeroing
    // the shared count hid a walk that had really happened. Measured 2026-10-15: the single
    // stray of forty-six drawn batches was `05CHNWLK.CFA#3`, the player's own sheet, drawn for
    // the crowd at a walk frame while `moving` could not see anybody in it move
    // (`docs/DEFECTS.md` D-08).
    for (const set of spriteSets.values()) { set.live = 0; set.crowd = 0; set.moved = false; }
    const drawnFrames = [];
    for (const [key, group] of groups) {
      const { set, frame, mirrored, actors } = group;
      const cache = set.frameBatches ??= new Map();
      let batch = cache.get(key);
      if (!batch || batch._quads < actors.length) {
        if (batch) renderer.destroyBillboardBatch(batch);
        batch = renderer.createBillboardBatch(CREATURE_ARCHIVE, `${set.file}#${frame}`,
          { w: mirrored ? -set.size.w : set.size.w, h: set.size.h },
          actors.map((actor) => [actor.world.x, actor.world.y, actor.world.z]), { dynamic: true });
        cache.set(key, batch);
      }
      renderer.moveBillboardBatch(batch, actors.map((actor) => [actor.world.x, actor.world.y, actor.world.z]));
      batch.indexCount = actors.length * 6;
      set.live += actors.length;
      set.crowd += actors.length;
      set.moved ||= actors.some((actor) => actor.motion?.moving);
      set.batch.record = `${set.file}#${frame}`;
      drawnFrames.push(batch.record);
      out.push(batch);
      figures += actors.length;
    }
    dbg.drawnFrames = drawnFrames;
    dbg.figures = figures;
    // The player's own two sets are drawn by name below, so they are not "live" yet.
    if (playerSet) playerSet.live = 0;
    if (attackSet) attackSet.live = 0;
    if (view === 'third' && playerSet) {
      const feet = feetOf();
      // The stride's own length this frame, which is also what "is the player walking" means: a
      // step smaller than a couple of millimetres is the motor settling, not a stride.
      const walked = lastFeet ? Math.hypot(feet[0] - lastFeet[0], feet[2] - lastFeet[2]) : 0;
      const walking = walked > 0.004;
      lastFeet = feet;
      // **A blow has a picture here too.** The third person used to keep the standing frame
      // through the whole swing, so pressing `F` while watching yourself did nothing on
      // screen: "attacking animation is bugged in third person". The archive ships the
      // attack action as its own sheet — `01…ATT.CFA`, three frames, facing the viewer,
      // because Arena only ever drew a blow from the player's own eyes — so the swing swaps
      // the billboard to that sheet for its `SWING_ANIM_SECONDS`, then back to the walk.
      // The walk cycle holds during it, so the blow reads as a blow and not as walking
      // through one.
      const swinging = swingAnim > 0;
      const set = swinging && attackSet ? attackSet : playerSet;
      renderer.moveBillboardBatch(set.batch, [[feet[0], feet[1], feet[2]]]);
      set.batch.indexCount = 6;
      const frames = set.cfa.frames.length;
      const progress = swinging && attackSet ? (SWING_ANIM_SECONDS - swingAnim) / SWING_ANIM_SECONDS : 0;
      // The player's own walk is stride-driven too, for the same reason the town's is: the
      // figure's feet and the ground under them have to agree, and a clock cannot know that.
      set.phase = walking
        ? ((set.phase ?? 0) + walked * frames / WALK_CYCLE_METRES) % frames
        : 0;
      const step = swinging && attackSet
        ? Math.min(frames - 1, Math.max(0, Math.floor(progress * frames)))
        : (walking ? Math.floor(set.phase) % frames : 0);
      set.batch.record = `${set.file}#${step}`;
      set.live = 1;
      dbg.playerFrame = `${set.file}#${step}`;
      out.push(set.batch);
    }
    return out;
  }

  /**
   * Draw the rain or the snow — the twin project's precipitation volume, driven by the
   * level's own weather letter (`game/arenaSky.js`).
   *
   * Built on first use rather than at load: a dungeon never asks for it, a clear day never
   * asks for it, and the pass owns a program, a VAO and a 1000-particle buffer that nothing
   * should pay for until it is raining. The camera basis handed over is the **same right
   * vector the billboards are drawn against** (`[cos yaw, 0, −sin yaw]`), so the volume is
   * square to the view however the player turns.
   *
   * @param {Float32Array} proj    the frame's own mirrored projection
   * @param {Float32Array} view    the frame's own view matrix
   * @param {number[]} eye
   */
  function drawWeather(proj, view, eye) {
    if (!precip) {
      try {
        precip = new PrecipitationRenderer(renderer.gl, {});
      } catch (err) {
        // A driver that cannot compile the pass must not take the level down with it: the
        // sky says it is raining and no rain falls, which is a missing effect, not a crash.
        data.warn(`precipitation: ${err.message}`);
        airWeather = null;
        return;
      }
    }
    precip.draw(airWeather, proj, view, eye, [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)], dbg.seconds);
    // MANDATORY after a foreign pass, exactly as after the sky: the pass binds its own
    // program and VAO and clears CULL_FACE/depthMask/alpha as it leaves, and the renderer
    // has to be told none of its own state is bound any more.
    renderer.markForeignPass();
  }

  function paint() {
    // A level swap tears the old GL payloads down between frames; a paint in that gap has
    // nothing coherent to draw and would sample a freed VAO. Skip, don't crash.
    if (!current) return;
    const motor = current.motor;
    const feet = Array.from(motor.pos);
    const fov = fieldOfView();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const proj = mirrorProjectionX(perspective(fov, aspect, 0.05, 800));
    // A shake is a perturbation of the *view*, never of the aim: the input's own yaw and
    // pitch are untouched, so the wound reads on screen without the mouse fighting it.
    const shakeYaw = screenShake > 0
      ? Math.sin(dbg.seconds * 47.0) * 0.035 * screenShake : 0;
    const shakePitch = screenShake > 0
      ? Math.sin(dbg.seconds * 61.0) * 0.028 * screenShake : 0;
    const viewYaw = cam.yaw + shakeYaw;
    const viewPitch = cam.pitch + shakePitch;
    const fwd = [Math.sin(viewYaw) * Math.cos(viewPitch), Math.sin(viewPitch), Math.cos(viewYaw) * Math.cos(viewPitch)];
    // Third person: the eye steps back along the *level* view direction (yaw only, so the
    // camera does not slide under the floor when the player looks up), and up a little.
    const eye = view === 'third'
      ? [feet[0] - Math.sin(viewYaw) * 3.6, feet[1] + 1.55, feet[2] - Math.cos(viewYaw) * 3.6]
      : motor.eyeAt();
    const view16 = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], UP_Y);

    // The sun first: the frame's light and the sun's own direction, before anything is drawn
    // with them. `applyDaylight` answers null on a level with no hour (a dungeon), and the
    // direction then stays what it always was — straight up, which is what a torchlit room
    // with no sky should light by.
    const light = applyDaylight();
    const localLights = nearestSceneLights(current.lightSources ?? [], feet,
      { night: isNight(clockNow().minutes), seconds: dbg.seconds, carried: !current.outdoor });
    renderer.setPointLights(sceneLightsEnabled ? localLights.positions : new Float32Array(), null, localLights.colours);
    dbg.pointLights = sceneLightsEnabled ? localLights.count : 0;
    renderer.beginFrame(proj, view16, light ? light.sunDir : [0, 1, 0], WORLD_FRAME);
    if (current.openSky) {
      sky.draw(viewYaw, viewPitch, fov, aspect);
      // MANDATORY after a foreign pass: the sky binds its own program and VAO, and
      // without this the mesh below draws with the sky's program still bound.
      renderer.markForeignPass();
    }
    renderer.drawMesh(current.mesh, identityMat, null);
    // The doors, each in its own transform, before the surfaces: a shut door is part of
    // the opaque world and hides whatever is behind it.
    drawDoors();
    // The chasms' own surfaces, exactly where the engine's water pass wants them: after
    // all opaque geometry (a surface is alpha-blended and does not write depth).
    drawSurfaces();
    // The creatures, the player and the level's own scenery last, on top of the
    // world, facing the camera: the trees and rocks are part of the level and never
    // move (`current.sceneryBatches`, built once at load), the figures follow what
    // moved this frame (`liveBatches`).
    const batches = liveBatches();
    const flats = (current.sceneryBatches ?? []).map((s) => {
      if (s.frames > 1) s.batch.record = `${s.name}#${Math.floor(dbg.seconds * 12) % s.frames}`;
      return s.batch;
    });
    for (const record of current.lootBatches ?? []) {
      if (record.frames > 1) record.batch.record = `loot#${record.name}#${Math.floor(dbg.seconds * 12) % record.frames}`;
    }
    // The loot the map left: a key, a chest, a treasure pile, a corpse — drawn like the
    // scenery, and dropped from the draw once the player has taken it.
    const lootBatches = (current.lootBatches ?? [])
      .filter((record) => record.spots.some((spot) => !spot.taken))
      .map((record) => record.batch);
    if (batches.length || flats.length || lootBatches.length) {
      renderer.drawBillboards([...flats, ...lootBatches, ...batches], [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)], UP_Y);
      renderer.markForeignPass();
    }
    // ── the weather falls last, over the whole world ───────────────────────
    //
    // And last for a reason: the volume is depth-tested against everything already drawn but
    // writes no depth and is alpha-blended, so a wall between the player and a raindrop still
    // hides it while the drops in the open air blend over the sky, the ground and the trees
    // alike. Drawing it before the geometry would put the world in front of all of it, and
    // drawing it before `resolveFrame` would drop it out of the post pass every other pixel
    // in the frame goes through.
    if (airWeather) drawWeather(proj, view16, eye);
    const right = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const air = atmosphere.geometry(current.lightSources ?? [], feet,
      { seconds: dbg.seconds, night: isNight(clockNow().minutes), carried: !current.outdoor, enabled: atmosphereEnabled }, right);
    if (air.length) {
      combatFxPass ??= new CombatFxPass(renderer.gl);
      combatFxPass.draw(air, proj, view16);
      renderer.markForeignPass();
    }
    combatFx.setBolts(bolts);
    const effects = combatFx.geometry([...monsters, ...townsfolk], right);
    if (effects.length) {
      combatFxPass ??= new CombatFxPass(renderer.gl);
      combatFxPass.draw(effects, proj, view16);
      renderer.markForeignPass();
    }
    renderer.resolveFrame();
    // The weapon last, over the resolved world (it is a 2D layer, not a world pass).
    drawWeaponView();
  }

  /**
   * Draw the weapon the player is holding, in the first person.
   *
   * The art is Arena's own: one frame of the weapon's `.CIF`, at the pixel the frame's header
   * names, on a screen that was 320×200, fitted inside the window at ONE uniform scale and
   * pinned to its bottom. Index 0 is the cutout (the layer is transparent where the sheet is),
   * and nothing is drawn at all when the weapon is sheathed, when this install has no sheet for
   * it, or in the third person.
   *
   * @returns {{frame: number, x: number, y: number, w: number, h: number}|null}
   */
  function drawWeaponView() {
    const el = document.getElementById('weapon');
    if (!el) return null;
    // The layer is the **whole window**, not the view band: the art is placed in the
    // original's own 320×200 screen coordinates, so the surface it is drawn on has to be
    // that screen's size (see `weaponView.js`'s `placeWeapon`), and the art's bottom edge
    // then lands on the status line itself.
    const w = window.innerWidth || el.clientWidth || canvas.clientWidth;
    const h = window.innerHeight || el.clientHeight || canvas.clientHeight;
    if (!w || !h) return null;
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    const ctx = el.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const index = view === 'first' ? weaponRig.frame : null;
    const art = index === null ? null : weaponArt.get(index);
    if (!art) { weaponOnScreen = null; dbg.weaponDrawn = null; return null; }
    // The weapon stands on the status line, in its own right-hand margin — `placeWeapon` is
    // the law, measured off the install's six sheets (every frame's `yOffset + height` is
    // 147, the top of the original's status area), and the port's status line is the top
    // edge of its own HUD panel. Until this rule the art was pinned to a 320×200 box at the
    // *bottom of the window*, so on a tall or short window it hung in the middle of the
    // frame with its blade running behind the HUD text ("sword is floating midscreen with
    // no handle"); its grip is drawn off the art's own right edge in Arena, so the thing a
    // player reads as "the handle" is only ever as visible as the art's nearness to the
    // right of the *screen*, which is what the rule restores.
    const place = placeWeapon(art, { width: w, height: h, baseline: statusLine() });
    // Pixel art: a scaled frame is the original's own pixels, not a smoothed guess.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.canvas, place.x, place.y, place.w, place.h);
    weaponOnScreen = { frame: index, x: place.x, y: place.y, w: place.w, h: place.h, right: place.right, bottom: place.bottom, scale: place.scale, baseline: statusLine() };
    dbg.weaponDrawn = weaponOnScreen;
    return weaponOnScreen;
  }

  /**
   * Arena's own screen scale for this window: the whole 320×200 screen fitted inside it.
   *
   * One factor for both axes (`weaponView.js`'s law), and the same one the renderer's own
   * 3D framing uses, so the art on the 2D layer and the world behind it agree about how
   * big a pixel is.
   *
   * @returns {number} pixels per original screen pixel
   */
  function screenScale() {
    const w = window.innerWidth || canvas.clientWidth || SCREEN.width;
    const h = window.innerHeight || canvas.clientHeight || SCREEN.height;
    return Math.max(0.1, Math.min(w / SCREEN.width, h / SCREEN.height));
  }

  /**
   * The line the weapon's art stands on, and the view band's bottom edge.
   *
   * **147 of the original's 200 screen lines**, scaled — the line `ART_BASELINE` was
   * measured at across all six of the install's weapon sheets. The status band (53 lines,
   * `P1.IMG`) is below it. So this is not "wherever the HUD text happens to start": a
   * panel that happens to be ten lines tall used to *define* the line, which put the blade
   * in the middle of the screen — the reported "sword is floating midscreen". The line is
   * the geometry's, and the HUD is laid out in the band below it.
   *
   * @returns {number}
   */
  function statusLine() {
    return Math.round(ART_BASELINE * screenScale());
  }

  /**
   * The view band: the **whole window**, with the status band an overlay on it.
   *
   * The original cut its 3D view off at line 147 of a 320×200 screen and filled the 53
   * lines below with the status bar. The port used to copy that literally — the canvas was
   * `147 × screenScale()` pixels tall and the bottom quarter of the window was bare page
   * background, which is the reported "a black band where the GUI is covers almost half the
   * screen". The band is now the window's own size and the status band is drawn over the
   * world (`index.html`).
   *
   * `statusLine()` still answers with 147 of the original's lines, so the weapon keeps
   * standing on the line the install's own sheets put it on, and the HUD's own panels are
   * laid out in the band below it.
   *
   * @returns {number} the status line, in pixels
   */
  function fitViewBand() {
    // Nothing to size: the canvas is the window (its CSS says 100vw × 100vh), and a scene
    // that wrote an inline height here would be the black band again.
    return statusLine();
  }

  function frame(now) {
    // A replaced scene stops at its own loop: `dispose()` (a travel to another map, or a
    // shop door's page) sets this and the old game is gone for good.
    if (!life.alive) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // `__debug.pause` stops the *simulation* and keeps painting. It exists so a test can
    // drive a timed animation frame by frame: the weapon rig's swing is 5/16 of a second,
    // and between two CDP round trips the real clock can run a whole one out, which made
    // the weapon checks pass or fail on how busy the machine was.
    if (!life.paused) step(dt);
    // The view band first: `paint` reads the canvas's own client size for its aspect, and
    // the renderer resizes its backing store from it, so the band has to be right before
    // the world is drawn into it.
    fitViewBand();
    paint();
    dbg.painted = ++painted;
    if (shotMode && painted === 5) { window.__shotReady = true; dbg.shotReady = true; }
    requestAnimationFrame(frame);
  }

  status(`${mapName} ready`);
  requestAnimationFrame(frame);
  return { loadLevel, state: () => window.__debug.state() };
}
