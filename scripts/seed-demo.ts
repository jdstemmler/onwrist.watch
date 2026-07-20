import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/lib/server/db';
import { users, watches } from '../src/lib/server/db/schema';
import { createSession, putOn } from '../src/lib/server/sessions';
import { hashPassword } from '../src/lib/server/passwords';
import { savePhoto } from '../src/lib/server/photos';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'demo-assets');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://onwrist:scratch@localhost:55432/onwrist'
});
const db = createDb(pool);
await migrate(db, { migrationsFolder: 'drizzle' });

// Scratch-only script: the demo account uses a fixed, public password, so
// refuse any database that already has users — same guard as seed.ts. Run
// against production this would mint a real known-credential account.
if ((await db.select({ id: users.id }).from(users)).length > 0) {
	console.error('Database is not empty — refusing to seed. Reset the scratch DB to reseed.');
	await pool.end();
	process.exit(1);
}

const [demoUser] = await db
	.insert(users)
	.values({
		email: 'demo@onwrist.watch',
		passwordHash: await hashPassword('demo-preview'),
		emailVerifiedAt: new Date(),
		isDemo: true
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
const rand = mulberry32(7);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const COLLECTION = [
	{
		photo: 'speedmaster',
		brand: 'Omega',
		model: 'Speedmaster Professional',
		nickname: 'Speedy',
		referenceNo: '311.30.42.30.01.005',
		dialColor: 'black',
		movement: 'manual',
		caseMm: 42,
		lugMm: 20,
		pricePaidCents: 650000,
		purchaseDate: '2022-05-14',
		boxPapers: 'both'
	},
	{
		photo: 'datejust',
		brand: 'Rolex',
		model: 'Datejust 36',
		nickname: 'Datejust',
		referenceNo: '16013',
		dialColor: 'champagne',
		movement: 'automatic',
		caseMm: 36,
		lugMm: 20,
		pricePaidCents: 780000,
		purchaseDate: '2021-03-02',
		boxPapers: 'both'
	},
	{
		photo: 'submariner',
		brand: 'Rolex',
		model: 'Submariner',
		nickname: 'Sub',
		referenceNo: '16610',
		dialColor: 'black',
		movement: 'automatic',
		caseMm: 40,
		lugMm: 20,
		pricePaidCents: 950000,
		purchaseDate: '2020-09-18',
		boxPapers: 'both'
	},
	{
		photo: 'grandseiko',
		brand: 'Grand Seiko',
		model: 'Hi-Beat 36000',
		nickname: 'Grand Seiko',
		referenceNo: 'SBGH',
		dialColor: 'silver',
		movement: 'automatic',
		caseMm: 41,
		lugMm: 20,
		pricePaidCents: 620000,
		purchaseDate: '2023-08-11',
		boxPapers: 'both'
	},
	{
		photo: 'cartier',
		brand: 'Cartier',
		model: 'Tank',
		nickname: 'Tank',
		referenceNo: null,
		dialColor: 'ivory',
		movement: 'quartz',
		caseMm: 25.5,
		lugMm: 16,
		pricePaidCents: 320000,
		purchaseDate: '2024-02-14',
		boxPapers: 'box'
	},
	{
		photo: 'seamaster',
		brand: 'Omega',
		model: 'Seamaster',
		nickname: 'Seamaster',
		referenceNo: null,
		dialColor: 'blue',
		movement: 'automatic',
		caseMm: 41,
		lugMm: 20,
		pricePaidCents: 480000,
		purchaseDate: '2022-12-25',
		boxPapers: 'both'
	},
	{
		photo: 'hamilton',
		brand: 'Hamilton',
		model: 'Khaki Field Mechanical',
		nickname: 'Field',
		referenceNo: 'H69439931',
		dialColor: 'green',
		movement: 'manual',
		caseMm: 38,
		lugMm: 20,
		pricePaidCents: 52000,
		purchaseDate: '2020-06-15',
		boxPapers: 'box'
	},
	{
		photo: 'skx007',
		brand: 'Seiko',
		model: 'SKX007',
		nickname: 'Beater',
		referenceNo: null,
		dialColor: 'black',
		movement: 'automatic',
		caseMm: 42.5,
		lugMm: 22,
		pricePaidCents: 25000,
		purchaseDate: '2019-03-20',
		boxPapers: 'none'
	},
	{
		photo: 'gshock',
		brand: 'Casio',
		model: 'G-Shock GW-M5610',
		nickname: 'Square',
		referenceNo: null,
		dialColor: 'black',
		movement: 'quartz',
		caseMm: 43,
		lugMm: 16,
		pricePaidCents: 12000,
		purchaseDate: '2018-11-01',
		boxPapers: 'box'
	}
] as const;

const ids: number[] = [];
for (const w of COLLECTION) {
	const { photo, ...watchFields } = w;
	const [row] = await db.insert(watches).values({ ...watchFields, userId: demoUser.id }).returning();
	ids.push(row.id);

	const buf = fs.readFileSync(path.join(ASSETS_DIR, `${photo}.jpg`));
	const file = new File([buf], `${photo}.jpg`, { type: 'image/jpeg' });
	await savePhoto(db, demoUser.id, row.id, file);
}

// Favorites get worn more: weight by position (earlier = more worn).
const weighted = ids.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id));

const NOTES = [
	'dinner out', 'weekend errands', 'office day', 'date night', 'travel day',
	'gym then brunch', 'first wear after service', 'lazy Sunday'
];

const DAY = 86_400_000;
const anchor = new Date(Number(process.env.SEED_ANCHOR_MS ?? Date.now()));
const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

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
		const mid = at(20, Math.floor(rand() * 60));
		const end = at(29, Math.floor(rand() * 90)); // 9-10:30 PM Pacific
		await createSession(db, demoUser.id, { watchId, startedAt: start, endedAt: mid, note });
		await createSession(db, demoUser.id, {
			watchId: pick(weighted.filter((i) => i !== watchId)),
			startedAt: mid,
			endedAt: end
		});
	} else if (rand() < 0.04) {
		// overnight: worn late, off early the next morning
		await createSession(db, demoUser.id, { watchId, startedAt: start, endedAt: at(37, 0), note: note ?? 'late night' });
	} else {
		await createSession(db, demoUser.id, {
			watchId,
			startedAt: start,
			endedAt: at(28, Math.floor(rand() * 150)),
			note
		});
	}
	sessions++;
}

// Currently wearing something — nice "on wrist" state for screenshots.
await putOn(db, demoUser.id, { watchId: ids[0], at: new Date(anchor.getTime() - 3 * 3_600_000), source: 'web' });

console.log(
	`Seeded demo user (${demoUser.email}) with ${ids.length} watches, ${ids.length} photos, and ~${sessions} wear days (one session still open).`
);
await pool.end();
