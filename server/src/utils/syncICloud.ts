/**
 * syncICloud.ts
 * Synchronise tous les clients MongoDB vers iCloud Contacts (groupe "Clients Piscine").
 * Portage TypeScript du script Python sync_contacts_to_icloud.py — tourne nativement
 * dans le serveur Node.js, sans dépendance Python.
 */

import Client from '../models/Client';
import squareClient from '../config/square';

// ── Configuration ─────────────────────────────────────────────────────────────
const ICLOUD_USER     = process.env.ICLOUD_USER     || 'massilsebaa123@hotmail.com';
const ICLOUD_APP_PASS = process.env.ICLOUD_APP_PASS || 'pcwr-twpj-jerm-qebt';
const GROUP_NAME      = 'Clients Piscine';
const GROUP_UID       = 'piscine-clients-group-massil';
const CARDDAV_BASE    = 'https://contacts.icloud.com';
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function basicAuth(): string {
    return 'Basic ' + Buffer.from(`${ICLOUD_USER}:${ICLOUD_APP_PASS}`).toString('base64');
}

function makeUrl(base: string, href: string): string {
    if (href.startsWith('http://') || href.startsWith('https://')) return href.replace(/\/$/, '');
    const url = new URL(base);
    return `${url.protocol}//${url.host}${href.replace(/\/$/, '')}`;
}

function normalizePhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function extractPoolType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('hors terre')) return 'Hors terre';
    if (lower.includes('creus')) return 'Creusée';
    return '';
}

// ── CardDAV PROPFIND ──────────────────────────────────────────────────────────

async function propfind(url: string, body: string, depth = '0'): Promise<string> {
    const resp = await fetch(url, {
        method: 'PROPFIND',
        headers: {
            'Authorization': basicAuth(),
            'Depth': depth,
            'Content-Type': 'application/xml',
        },
        body,
    });
    if (!resp.ok) throw new Error(`PROPFIND ${url} → HTTP ${resp.status}`);
    return resp.text();
}

// Extrait le texte d'un tag XML (supporte les namespaces)
function extractXmlTag(xml: string, localName: string): string | null {
    const regex = new RegExp(`<[^>]*:?${localName}[^>]*>([^<]+)<\\/[^>]*:?${localName}>`, 'i');
    const m = xml.match(regex);
    return m ? m[1].trim() : null;
}

// Découpe le XML en blocs <response>...</response>
function splitResponses(xml: string): string[] {
    return xml.match(/<[^>]*:response[^>]*>[\s\S]*?<\/[^>]*:response>/gi) || [];
}

// ── Découverte CardDAV ────────────────────────────────────────────────────────

async function getBookUrl(): Promise<string> {
    // 1. current-user-principal
    const principalXml = await propfind(CARDDAV_BASE, `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);

    const pMatch = principalXml.match(
        /<[^>]*current-user-principal[^>]*>\s*<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i
    );
    if (!pMatch) throw new Error('CardDAV: impossible de trouver le principal');
    const principalUrl = makeUrl(CARDDAV_BASE, pMatch[1].trim());

    // 2. addressbook-home-set
    const homeXml = await propfind(principalUrl, `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><card:addressbook-home-set/></d:prop>
</d:propfind>`);

    const hMatch = homeXml.match(
        /<[^>]*addressbook-home-set[^>]*>\s*<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i
    );
    if (!hMatch) throw new Error('CardDAV: impossible de trouver addressbook-home-set');
    const homeUrl = makeUrl(principalUrl, hMatch[1].trim());

    // 3. Premier carnet d'adresses
    const booksXml = await propfind(homeUrl, `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><d:displayname/><d:resourcetype/></d:prop>
</d:propfind>`, '1');

    for (const block of splitResponses(booksXml)) {
        if (block.toLowerCase().includes('addressbook')) {
            const href = block.match(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/i);
            if (href) {
                const bookUrl = makeUrl(homeUrl, href[1].trim());
                return bookUrl.endsWith('/') ? bookUrl : bookUrl + '/';
            }
        }
    }
    throw new Error('CardDAV: aucun carnet d\'adresses trouvé');
}

// ── Contacts existants ────────────────────────────────────────────────────────

async function listExistingContacts(bookUrl: string): Promise<Record<string, string>> {
    const xml = await propfind(bookUrl, `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontenttype/></d:prop></d:propfind>`, '1');

    const contacts: Record<string, string> = {};
    for (const block of splitResponses(xml)) {
        const hrefMatch = block.match(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/i);
        const etagMatch = block.match(/<[^>]*:getetag[^>]*>([^<]+)<\/[^>]*:getetag>/i);
        if (!hrefMatch || !etagMatch) continue;
        const href = hrefMatch[1].trim();
        if (href.endsWith('.vcf')) {
            const uid = href.split('/').pop()!.replace('.vcf', '');
            contacts[uid] = etagMatch[1].trim();
        }
    }
    return contacts;
}

// Supprime les contacts de l'ancien schéma d'UID (Square ID / MongoDB _id)
async function deleteLegacyContacts(bookUrl: string, existing: Record<string, string>): Promise<void> {
    const candidates = Object.keys(existing).filter(
        uid => !uid.startsWith('cli-') && uid !== GROUP_UID
    );
    if (!candidates.length) return;

    let deleted = 0;
    for (const uid of candidates) {
        const url = `${bookUrl}${uid}.vcf`;
        const resp = await fetch(url, {
            headers: { 'Authorization': basicAuth(), 'Accept': 'text/vcard' }
        });
        if (resp.status !== 200) continue;
        const text = await resp.text();
        const fnMatch = text.match(/^FN:(.+)$/m);
        if (fnMatch && fnMatch[1].trim().startsWith('CLI ')) {
            const del = await fetch(url, { method: 'DELETE', headers: { 'Authorization': basicAuth() } });
            if ([200, 204].includes(del.status)) deleted++;
        }
    }
    if (deleted > 0) console.log(`🗑️  ${deleted} ancien(s) contact(s) supprimé(s)`);
}

// ── vCard contact ─────────────────────────────────────────────────────────────

function customerToVCard(c: any, poolType: string): { uid: string; vcard: string } {
    const given  = (c.givenName  || '').trim();
    const family = (c.familyName || '').trim();
    const full   = `${given} ${family}`.trim();
    const phone  = (c.phoneNumber || '').trim();
    const norm   = normalizePhone(phone);

    const uid         = norm ? `cli-${norm}` : `cli-${c.squareId || String(c._id)}`;
    const displayName = full ? `CLI ${full}` : uid;

    const lines: string[] = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:${uid}`,
        `FN:${displayName}`,
        `N:${family};${given};;CLI;`,
    ];
    if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
    const addr = (c.addressLine1 || '').trim();
    const city = (c.city || '').trim();
    if (addr || city) lines.push(`ADR;TYPE=HOME:;;${addr};${city};;;CA`);
    if (poolType) lines.push(`NOTE:Piscine ${poolType}`);
    lines.push('END:VCARD');

    return { uid, vcard: lines.join('\r\n') };
}

// ── vCard groupe ──────────────────────────────────────────────────────────────

function buildGroupVCard(memberUids: string[]): string {
    return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:${GROUP_UID}`,
        `FN:${GROUP_NAME}`,
        'X-ADDRESSBOOKSERVER-KIND:group',
        ...memberUids.map(uid => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${uid}`),
        'END:VCARD',
    ].join('\r\n');
}

// ── PUT vCard ─────────────────────────────────────────────────────────────────

async function putVCard(url: string, vcard: string): Promise<boolean> {
    const resp = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': basicAuth(),
            'Content-Type': 'text/vcard; charset=utf-8',
        },
        body: Buffer.from(vcard, 'utf-8'),
    });
    return [200, 201, 204].includes(resp.status);
}

// ── Square : catalogue + bookings ─────────────────────────────────────────────

async function buildCatalogIndex(): Promise<Record<string, string>> {
    const variationPool: Record<string, string> = {};
    const itemPool: Record<string, string> = {};

    for await (const obj of squareClient.catalog.list({ types: ['ITEM', 'ITEM_VARIATION'] })) {
        if ((obj as any).type === 'ITEM') {
            const name = (obj as any).itemData?.name || '';
            const pool = extractPoolType(name);
            if (pool) itemPool[(obj as any).id] = pool;
        }
    }

    for await (const obj of squareClient.catalog.list({ types: ['ITEM'] })) {
        const pool = itemPool[(obj as any).id] || '';
        for (const v of (obj as any).itemData?.variations || []) {
            variationPool[v.id] = pool;
        }
    }

    return variationPool;
}

async function buildPoolTypeIndex(catalogIndex: Record<string, string>): Promise<Record<string, string>> {
    const byCustomer: Record<string, any[]> = {};

    const start = new Date('2024-01-01T00:00:00Z');
    const endGlobal = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    let cursor = new Date(start);
    while (cursor < endGlobal) {
        const segEnd = new Date(Math.min(cursor.getTime() + 30 * 24 * 60 * 60 * 1000, endGlobal.getTime()));
        for await (const booking of squareClient.bookings.list({
            startAtMin: cursor.toISOString(),
            startAtMax: segEnd.toISOString(),
            limit: 100,
        })) {
            const cid = (booking as any).customerId;
            if (cid) {
                if (!byCustomer[cid]) byCustomer[cid] = [];
                byCustomer[cid].push(booking);
            }
        }
        cursor = new Date(segEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const customerPool: Record<string, string> = {};
    for (const [cid, bookings] of Object.entries(byCustomer)) {
        const sorted = bookings.sort((a, b) =>
            ((b as any).startAt || '').localeCompare((a as any).startAt || '')
        );
        for (const booking of sorted.slice(0, 3)) {
            for (const seg of (booking as any).appointmentSegments || []) {
                const pool = catalogIndex[seg.serviceVariationId || ''];
                if (pool) { customerPool[cid] = pool; break; }
            }
            if (customerPool[cid]) break;
        }
    }
    return customerPool;
}

// ── Sync d'un seul client (rapide, ~5 sec) ───────────────────────────────────
// Utilisé après un webhook customer.created / customer.updated.
// Un nouveau client n'a pas encore de bookings → pool type vide pour l'instant ;
// il sera rempli lors de la prochaine sync complète (manuelle ou planifiée).

export async function syncSingleClient(squareId: string): Promise<void> {
    // 1. Récupérer le client dans MongoDB
    const c = await Client.findOne({ squareId });
    if (!c) { console.warn(`⚠️  syncSingleClient: client ${squareId} introuvable dans MongoDB`); return; }

    // 2. Connexion iCloud
    const bookUrl  = await getBookUrl();
    const existing = await listExistingContacts(bookUrl);

    // 3. Construire et envoyer la vCard (sans pool type pour un nouveau client)
    const { uid, vcard } = customerToVCard(c.toObject(), '');
    const ok = await putVCard(`${bookUrl}${uid}.vcf`, vcard);
    if (!ok) { console.error(`❌ syncSingleClient: PUT échoué pour ${uid}`); return; }

    // 4. Mettre à jour le groupe avec ce nouveau membre
    const allUids = new Set(Object.keys(existing).filter(u => u.startsWith('cli-') && u !== GROUP_UID));
    allUids.add(uid);
    await putVCard(`${bookUrl}${GROUP_UID}.vcf`, buildGroupVCard([...allUids]));

    console.log(`✅ Contact iCloud ${existing[uid] ? 'mis à jour' : 'ajouté'} : ${uid}`);
}

// ── Sync complète (tous les clients + types de piscine) ───────────────────────

export async function syncICloud(): Promise<void> {
    // 1. Clients MongoDB
    const clients = await Client.find({});
    console.log(`  → ${clients.length} client(s) trouvé(s)`);

    // 2. Types de piscine depuis Square
    const catalogIndex = await buildCatalogIndex();
    const poolIndex    = await buildPoolTypeIndex(catalogIndex);

    // 3. Connexion iCloud CardDAV
    const bookUrl  = await getBookUrl();
    const existing = await listExistingContacts(bookUrl);
    console.log(`  → ${Object.keys(existing).length} contact(s) existant(s) dans iCloud`);

    // 4. Nettoyage anciens contacts
    await deleteLegacyContacts(bookUrl, existing);

    // 5. Push de tous les clients
    let added = 0, updated = 0, failed = 0;
    const memberUids: string[] = [];

    for (const c of clients) {
        const poolType = poolIndex[(c as any).squareId || ''] || '';
        const { uid, vcard } = customerToVCard(c.toObject(), poolType);
        memberUids.push(uid);
        const ok = await putVCard(`${bookUrl}${uid}.vcf`, vcard);
        if (ok) { existing[uid] ? updated++ : added++; }
        else failed++;
    }

    // 6. Mise à jour du groupe
    await putVCard(`${bookUrl}${GROUP_UID}.vcf`, buildGroupVCard(memberUids));

    console.log(`✅ Sync iCloud — Ajoutés: ${added}, Mis à jour: ${updated}, Échecs: ${failed}`);
}
