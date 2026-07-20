import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/lib/server/db';
import { users, watches } from '../src/lib/server/db/schema';
import { createSession, putOn } from '../src/lib/server/sessions';
import { hashPassword } from '../src/lib/server/passwords';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://onwrist:scratch@localhost:55432/onwrist'
});
const db = createDb(pool);
await migrate(db, { migrationsFolder: 'drizzle' });

if ((await db.select().from(watches)).length > 0) {
	console.error('Database is not empty — refusing to seed. Reset the scratch DB to reseed.');
	await pool.end();
	process.exit(1);
}

const [seedUser] = await db
	.insert(users)
	.values({
		email: 'seed@onwrist.local',
		passwordHash: await hashPassword('seed-password-dev'),
		emailVerifiedAt: new Date()
	})
	.returning();

// Deterministic PRNG so reseeding is reproducible.
function mulberry32(a: number) {
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const COLLECTION = [
	{ brand: 'Omega', model: 'Speedmaster Professional', nickname: 'Speedy', dialColor: 'black', movement: 'manual', caseMm: 42, lugMm: 20, pricePaidCents: 520000, purchaseDate: '2022-05-14', boxPapers: 'both' },
	{ brand: 'Rolex', model: 'Datejust 36', nickname: null, dialColor: 'silver', movement: 'automatic', caseMm: 36, lugMm: 20, pricePaidCents: 750000, purchaseDate: '2021-11-02', boxPapers: 'both' },
	{ brand: 'Seiko', model: 'SKX007', nickname: 'Beater', dialColor: 'black', movement: 'automatic', caseMm: 42.5, lugMm: 22, pricePaidCents: 25000, purchaseDate: '2019-03-20', boxPapers: 'none' },
	{ brand: 'Grand Seiko', model: 'SBGA211', nickname: 'Snowflake', dialColor: 'white', movement: 'automatic', caseMm: 41, lugMm: 20, pricePaidCents: 580000, purchaseDate: '2023-08-11', boxPapers: 'both' },
	{ brand: 'Tudor', model: 'Black Bay 58', nickname: 'BB58', dialColor: 'black', movement: 'automatic', caseMm: 39, lugMm: 20, pricePaidCents: 380000, purchaseDate: '2022-12-25', boxPapers: 'both' },
	{ brand: 'Cartier', model: 'Tank Must', nickname: null, dialColor: 'white', movement: 'quartz', caseMm: 33.7, lugMm: 19, pricePaidCents: 290000, purchaseDate: '2024-02-14', boxPapers: 'both' },
	{ brand: 'Casio', model: 'G-Shock DW-5600', nickname: 'Square', dialColor: 'black', movement: 'quartz', caseMm: 43, lugMm: 16, pricePaidCents: 5000, purchaseDate: '2018-06-01', boxPapers: 'box' },
	{ brand: 'Hamilton', model: 'Khaki Field Mechanical', nickname: 'Field', dialColor: 'green', movement: 'manual', caseMm: 38, lugMm: 20, pricePaidCents: 52000, purchaseDate: '2020-09-15', boxPapers: 'box' },
	{ brand: 'Longines', model: 'Spirit Zulu Time', nickname: 'Zulu', dialColor: 'blue', movement: 'automatic', caseMm: 42, lugMm: 21, pricePaidCents: 310000, purchaseDate: '2024-07-04', boxPapers: 'both' },
	{ brand: 'Citizen', model: 'Promaster Tough', nickname: 'Tank (the other one)', dialColor: 'grey', movement: 'solar', caseMm: 42, lugMm: 20, pricePaidCents: 30000, purchaseDate: '2021-04-10', boxPapers: 'none' },
	{ brand: 'Nomos', model: 'Tangente 38', nickname: null, dialColor: 'white', movement: 'manual', caseMm: 37.5, lugMm: 19, pricePaidCents: 210000, purchaseDate: '2023-03-30', boxPapers: 'both' },
	{ brand: 'Apple', model: 'Watch Ultra 2', nickname: 'Gym watch', dialColor: 'digital', movement: 'other', caseMm: 49, lugMm: 22, pricePaidCents: 79900, purchaseDate: '2024-10-01', boxPapers: 'box' }
] as const;

const ids: number[] = [];
for (const w of COLLECTION) {
	ids.push((await db.insert(watches).values({ ...w, userId: seedUser.id }).returning())[0].id);
}

// Favorites get worn more: weight by position (earlier = more worn).
const weighted = ids.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id));

const NOTES = [
	'dinner with my wife', 'camping weekend', 'yard work day', 'office day',
	'date night', 'travel day', 'kid soccer tournament', 'first wear after service'
];

const DAY = 86_400_000;
const anchor = new Date(Number(process.env.SEED_ANCHOR_MS ?? Date.now()));
const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

// The open session goes on at anchor − 3h. Generated history must end
// before that: day-1 evening sessions can otherwise run past it (normal
// days end up to ~06:30 UTC "today"; camping overnights even later) and
// 409 the final putOn when seeding in the late evening or overnight.
const openStart = new Date(anchor.getTime() - 3 * 3_600_000);
const capMs = openStart.getTime() - 60_000;
const clamp = (d: Date) => new Date(Math.min(d.getTime(), capMs));

let sessions = 0;
for (let daysAgo = 120; daysAgo >= 1; daysAgo--) {
	if (rand() < 0.08) continue; // no-watch day
	const day = startOfDay(new Date(anchor.getTime() - daysAgo * DAY));
	const at = (h: number, extraMin: number) => new Date(day.getTime() + h * 3_600_000 + extraMin * 60_000);
	const watchId = pick(weighted);
	const start = at(14, Math.floor(rand() * 90)); // ~6:30-8:00 AM Pacific in UTC
	const note = rand() < 0.15 ? pick(NOTES) : undefined;

	if (rand() < 0.12) {
		// midday swap: two back-to-back sessions
		const mid = clamp(at(20, Math.floor(rand() * 60)));
		const end = clamp(at(29, Math.floor(rand() * 90))); // 9-10:30 PM Pacific
		if (mid <= start) continue; // whole day would collide with the open session
		await createSession(db, seedUser.id, { watchId, startedAt: start, endedAt: mid, note });
		if (end > mid) {
			await createSession(db, seedUser.id, {
				watchId: pick(weighted.filter((i) => i !== watchId)),
				startedAt: mid,
				endedAt: end
			});
		}
	} else if (rand() < 0.04) {
		// camping: worn overnight, off early next morning (before next day's ~6:30 AM start)
		const end = clamp(at(37, 0));
		if (end <= start) continue;
		await createSession(db, seedUser.id, { watchId, startedAt: start, endedAt: end, note: 'camping' });
	} else {
		const end = clamp(at(28, Math.floor(rand() * 150)));
		if (end <= start) continue;
		await createSession(db, seedUser.id, { watchId, startedAt: start, endedAt: end, note });
	}
	sessions++;
}

// Currently wearing something (put on this morning).
await putOn(db, seedUser.id, { watchId: ids[0], at: openStart, source: 'web' });

console.log(`Seeded ${ids.length} watches and ~${sessions} wear days (one session still open).`);
await pool.end();
