import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/lib/server/db';
import { users, watches } from '../src/lib/server/db/schema';
import { refreshDemoHistory } from '../src/lib/server/demo';
import { hashPassword } from '../src/lib/server/passwords';
import { savePhoto } from '../src/lib/server/photos';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'demo-assets');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://onwrist:scratch@localhost:55432/onwrist'
});
const db = createDb(pool);
await migrate(db, { migrationsFolder: 'drizzle' });

// Refuse if a demo account already exists (runtime keeps its history fresh;
// re-provisioning would duplicate watches/photos). Provisioning into a live,
// non-empty database is legitimate exactly once per instance — require an
// explicit env opt-in so a stray local run against production can't happen.
if ((await db.select({ id: users.id }).from(users).where(eq(users.isDemo, true)).limit(1)).length > 0) {
	console.error('A demo user already exists — nothing to do.');
	await pool.end();
	process.exit(1);
}
if (
	(await db.select({ id: users.id }).from(users)).length > 0 &&
	process.env.SEED_DEMO_ALLOW_EXISTING !== '1'
) {
	console.error('Database is not empty — set SEED_DEMO_ALLOW_EXISTING=1 to provision the demo into a live database.');
	await pool.end();
	process.exit(1);
}

const [demoUser] = await db
	.insert(users)
	.values({
		email: 'demo@onwrist.watch',
		passwordHash: await hashPassword(crypto.randomBytes(32).toString('base64url')),
		emailVerifiedAt: new Date(),
		isDemo: true,
		staleSessionHours: 168
	})
	.returning();

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

await refreshDemoHistory(db, demoUser.id, new Date(Number(process.env.SEED_ANCHOR_MS ?? Date.now())));

console.log(`Provisioned demo user (${demoUser.email}) with ${ids.length} watches and photos; wear history anchored at now.`);
await pool.end();
