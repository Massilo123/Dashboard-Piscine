#!/usr/bin/env python3
"""
Synchronise TOUS les clients MongoDB vers iCloud Contacts (groupe "Clients Piscine").
Chaque contact est préfixé "CLI " dans son nom pour identifier les clients.
Usage : python sync_contacts_to_icloud.py
"""

import sys
sys.stdout.reconfigure(encoding="utf-8")

import requests
import uuid
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from requests.auth import HTTPBasicAuth
from pymongo import MongoClient

# ── Configuration ────────────────────────────────────────────────────────────
SQUARE_TOKEN    = "EAAAl5gSQK3Asi-npLm22-80r3X0nm-Z_eWj7sFydjnRT5QJaF14TmaV9YnYdBcx"
ICLOUD_USER     = "massilsebaa123@hotmail.com"
ICLOUD_APP_PASS = "pcwr-twpj-jerm-qebt"
MONGODB_URI     = "mongodb+srv://massilseba:Massilo123@piscine.zpig8.mongodb.net/clients"
GROUP_NAME      = "Clients Piscine"
# ─────────────────────────────────────────────────────────────────────────────

CARDDAV_DISCOVERY = "https://contacts.icloud.com"


def make_url(base: str, href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href.rstrip("/")
    parsed = urlparse(base)
    return f"{parsed.scheme}://{parsed.netloc}{href.rstrip('/')}"


# ── 1. Catalogue Square — correspondance service_variation_id → type de piscine ──

SQUARE_HEADERS = {
    "Authorization": f"Bearer {SQUARE_TOKEN}",
    "Content-Type": "application/json",
    "Square-Version": "2024-01-17",
}

def extract_pool_type(service_name: str) -> str:
    name = service_name.lower()
    if "hors terre" in name:
        return "Hors terre"
    if "creus" in name:
        return "Creusée"
    return ""

def build_catalog_index() -> dict:
    print("Chargement du catalogue Square...")
    resp = requests.get(
        "https://connect.squareup.com/v2/catalog/list?types=ITEM,ITEM_VARIATION",
        headers=SQUARE_HEADERS
    )
    objects = resp.json().get("objects", [])

    item_pool = {}
    for obj in objects:
        if obj["type"] == "ITEM":
            name = obj.get("item_data", {}).get("name", "")
            pool = extract_pool_type(name)
            if pool:
                item_pool[obj["id"]] = pool

    variation_pool = {}
    for obj in objects:
        if obj["type"] == "ITEM":
            item_id = obj["id"]
            pool = item_pool.get(item_id, "")
            for var in obj.get("item_data", {}).get("variations", []):
                variation_pool[var["id"]] = pool

    found = sum(1 for p in variation_pool.values() if p)
    print(f"  → {len(variation_pool)} variation(s) catalogue, {found} avec type de piscine")
    return variation_pool

def build_pool_type_index(catalog_index: dict) -> dict:
    from datetime import datetime, timedelta
    from collections import defaultdict

    print("Récupération des bookings Square (mois par mois depuis 2024)...")
    bookings = []
    start = datetime(2024, 1, 1)
    end_global = datetime.utcnow() + timedelta(days=60)

    while start < end_global:
        end = min(start + timedelta(days=30), end_global)
        params = {
            "limit": 100,
            "start_at_min": start.strftime("%Y-%m-%dT00:00:00Z"),
            "start_at_max": end.strftime("%Y-%m-%dT23:59:59Z"),
        }
        cursor = None
        while True:
            if cursor:
                params["cursor"] = cursor
            resp = requests.get(
                "https://connect.squareup.com/v2/bookings",
                headers=SQUARE_HEADERS, params=params
            )
            data = resp.json()
            batch = data.get("bookings", [])
            bookings.extend(batch)
            cursor = data.get("cursor")
            if not cursor or not batch:
                break
        start = end + timedelta(days=1)

    print(f"  → {len(bookings)} booking(s) total récupéré(s)")

    by_customer = defaultdict(list)
    for b in bookings:
        cid = b.get("customer_id")
        if cid:
            by_customer[cid].append(b)

    customer_pool = {}
    for cid, cust_bookings in by_customer.items():
        sorted_b = sorted(cust_bookings, key=lambda b: b.get("start_at", ""), reverse=True)
        for booking in sorted_b[:3]:
            for seg in booking.get("appointment_segments", []):
                var_id = seg.get("service_variation_id", "")
                pool = catalog_index.get(var_id, "")
                if pool:
                    customer_pool[cid] = pool
                    break
            if cid in customer_pool:
                break

    print(f"  → {len(customer_pool)} client(s) avec type de piscine identifié(s)")
    return customer_pool


# ── 2. MongoDB — tous les clients ─────────────────────────────────────────────

def fetch_mongodb_clients():
    """Retourne tous les clients depuis MongoDB sous forme de liste de dicts normalisés."""
    print("Récupération de tous les clients MongoDB...")
    mongo = MongoClient(MONGODB_URI)
    db = mongo.get_default_database()
    raw = list(db["clients"].find({}))
    mongo.close()

    clients = []
    for doc in raw:
        clients.append({
            "id":           doc.get("squareId") or str(doc["_id"]),
            "square_id":    doc.get("squareId", ""),
            "given_name":   doc.get("givenName", ""),
            "family_name":  doc.get("familyName", ""),
            "phone_number": doc.get("phoneNumber", ""),
            "address": {
                "address_line_1": doc.get("addressLine1", ""),
                "locality":       doc.get("city", ""),
                "postal_code":    "",
                "administrative_district_level_1": "",
            },
            "email_address": "",
            "company_name":  "",
        })

    print(f"  → {len(clients)} client(s) trouvé(s)")
    return clients


# ── 3. CardDAV iCloud ─────────────────────────────────────────────────────────

def propfind(session, url, body, depth="0"):
    resp = session.request(
        "PROPFIND", url, data=body,
        headers={"Depth": depth, "Content-Type": "application/xml"},
    )
    resp.raise_for_status()
    return ET.fromstring(resp.text)


def get_carddav_principal(session):
    body = """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>"""
    root = propfind(session, CARDDAV_DISCOVERY, body)
    ns = {"d": "DAV:"}
    href = root.find(".//d:current-user-principal/d:href", ns)
    if href is None:
        raise RuntimeError("Impossible de trouver le principal CardDAV")
    return make_url(CARDDAV_DISCOVERY, href.text)


def get_addressbook_home(session, principal_url):
    body = """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><card:addressbook-home-set/></d:prop>
</d:propfind>"""
    root = propfind(session, principal_url, body)
    ns = {"d": "DAV:", "card": "urn:ietf:params:xml:ns:carddav"}
    href = root.find(".//card:addressbook-home-set/d:href", ns)
    if href is None:
        raise RuntimeError("Impossible de trouver addressbook-home-set")
    return make_url(principal_url, href.text)


def get_default_addressbook(session, home_url):
    body = """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"""
    root = propfind(session, home_url, body, depth="1")
    ns = {"d": "DAV:", "card": "urn:ietf:params:xml:ns:carddav"}
    for response in root.findall("d:response", ns):
        href_el = response.find("d:href", ns)
        rt = response.find(".//card:addressbook", ns)
        name_el = response.find(".//d:displayname", ns)
        if href_el is not None and rt is not None:
            name = name_el.text if name_el is not None else "?"
            url = make_url(home_url, href_el.text)
            print(f"  → Carnet utilisé : '{name}' ({url})")
            return url
    raise RuntimeError("Aucun carnet d'adresses trouvé dans iCloud")


# ── 4. Contacts existants ─────────────────────────────────────────────────────

def list_existing_contacts(session, book_url):
    body = """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getetag/>
    <d:getcontenttype/>
  </d:prop>
</d:propfind>"""
    root = propfind(session, book_url, body, depth="1")
    ns = {"d": "DAV:"}
    contacts = {}
    for response in root.findall("d:response", ns):
        href_el = response.find("d:href", ns)
        etag_el = response.find(".//d:getetag", ns)
        ct_el   = response.find(".//d:getcontenttype", ns)
        if href_el is None or etag_el is None:
            continue
        ct = (ct_el.text or "") if ct_el is not None else ""
        href_text = href_el.text
        if href_text.endswith(".vcf") or "text/vcard" in ct or "text/x-vcard" in ct:
            uid = href_text.split("/")[-1].replace(".vcf", "")
            contacts[uid] = (make_url(book_url, href_text), etag_el.text)
    return contacts


def delete_legacy_contacts(session, book_url, existing: dict):
    """
    Supprime uniquement les contacts créés par l'ancien run du script :
    - UID ne commence PAS par 'cli-'
    - ET le contenu vCard a un FN qui commence par 'CLI '
    Cela préserve tous les contacts personnels, même ceux nommés 'CLI quelquechose'.
    """
    candidates = {uid: info for uid, info in existing.items()
                  if not uid.startswith("cli-") and uid != GROUP_UID}
    if not candidates:
        print("  → Aucun ancien contact à supprimer")
        return

    print(f"  → Vérification de {len(candidates)} contact(s) candidat(s)...")
    to_delete = []
    for uid, (href_url, _) in candidates.items():
        resp = session.get(href_url, headers={"Accept": "text/vcard"})
        if resp.status_code != 200:
            continue
        # Chercher la ligne FN dans le vCard
        for line in resp.text.splitlines():
            if line.startswith("FN:"):
                fn_value = line[3:].strip()
                if fn_value.startswith("CLI "):
                    to_delete.append((uid, href_url))
                break

    if not to_delete:
        print("  → Aucun doublon trouvé à supprimer")
        return

    print(f"  → Suppression de {len(to_delete)} doublon(s) issu(s) de l'ancien run...")
    deleted = 0
    for uid, href_url in to_delete:
        resp = session.delete(href_url)
        if resp.status_code in (200, 204):
            deleted += 1
    print(f"  → {deleted} doublon(s) supprimé(s)")


# ── 5. vCard contact ──────────────────────────────────────────────────────────

def normalize_phone(p: str) -> str:
    digits = re.sub(r'\D', '', p or '')
    return digits[1:] if len(digits) == 11 and digits.startswith('1') else digits

def customer_to_vcard(c, appointment_extras: dict = {}):
    given  = (c.get("given_name")  or "").strip()
    family = (c.get("family_name") or "").strip()
    full   = f"{given} {family}".strip()
    phone  = (c.get("phone_number") or "").strip()
    norm   = normalize_phone(phone)

    # UID basé sur le numéro de téléphone normalisé — évite tout doublon avec
    # des contacts non-clients qui auraient le même nom mais pas le même numéro
    if norm:
        uid = f"cli-{norm}"
    else:
        uid = f"cli-{c.get('id', str(uuid.uuid4()))}"

    display_name = f"CLI {full}" if full else uid

    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"UID:{uid}",
        f"FN:{display_name}",
        f"N:{family};{given};;CLI;",
    ]
    email = (c.get("email_address") or "").strip()
    if email:
        lines.append(f"EMAIL;TYPE=INTERNET:{email}")
    phone = (c.get("phone_number") or "").strip()
    if phone:
        lines.append(f"TEL;TYPE=CELL:{phone}")
    company = (c.get("company_name") or "").strip()
    if company:
        lines.append(f"ORG:{company}")

    sq_addr   = c.get("address", {}) or {}
    addr_line = (sq_addr.get("address_line_1") or "").strip()
    locality  = (sq_addr.get("locality") or "").strip()
    postal    = (sq_addr.get("postal_code") or "").strip()
    province  = (sq_addr.get("administrative_district_level_1") or "").strip()
    if addr_line or locality:
        lines.append(f"ADR;TYPE=HOME:;;{addr_line};{locality};{province};{postal};CA")

    pool_type = (appointment_extras.get("pool_type") or "").strip()
    if pool_type:
        lines.append(f"NOTE:Piscine {pool_type}")

    lines.append("END:VCARD")
    return uid, "\r\n".join(lines)


# ── 6. vCard groupe ───────────────────────────────────────────────────────────

GROUP_UID = "piscine-clients-group-massil"

def build_group_vcard(member_uids):
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"UID:{GROUP_UID}",
        f"FN:{GROUP_NAME}",
        "X-ADDRESSBOOKSERVER-KIND:group",
    ]
    for uid in member_uids:
        lines.append(f"X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:{uid}")
    lines.append("END:VCARD")
    return "\r\n".join(lines)


# ── 7. PUT contact / groupe ───────────────────────────────────────────────────

def put_vcard(session, url, vcard_data):
    resp = session.put(
        url, data=vcard_data.encode("utf-8"),
        headers={"Content-Type": "text/vcard; charset=utf-8"},
    )
    return resp.status_code in (200, 201, 204)


# ── 8. Main ───────────────────────────────────────────────────────────────────

def main():
    # Charger tous les clients depuis MongoDB
    customers = fetch_mongodb_clients()
    if not customers:
        print("Aucun client trouvé dans MongoDB, arrêt.")
        return

    # Type de piscine depuis Square (utilise squareId comme clé)
    catalog_index = build_catalog_index()
    pool_index    = build_pool_type_index(catalog_index)  # {square_id: pool_type}

    session = requests.Session()
    session.auth = HTTPBasicAuth(ICLOUD_USER, ICLOUD_APP_PASS)

    print("Connexion à iCloud CardDAV...")
    principal = get_carddav_principal(session)
    home      = get_addressbook_home(session, principal)
    book_url  = get_default_addressbook(session, home)
    if not book_url.endswith("/"):
        book_url += "/"

    existing = list_existing_contacts(session, book_url)
    print(f"  → {len(existing)} contact(s) déjà présent(s)")

    # Nettoyer les doublons issus de l'ancien UID scheme (Square ID / MongoDB _id)
    delete_legacy_contacts(session, book_url, existing)

    added = updated = failed = 0
    member_uids = []

    for c in customers:
        # Résoudre le type de piscine via squareId
        square_id = c.get("square_id", "") or c.get("id", "")
        pool_type = pool_index.get(square_id, "")
        extras    = {"pool_type": pool_type}

        uid, vcard = customer_to_vcard(c, extras)
        member_uids.append(uid)
        url = f"{book_url}{uid}.vcf"
        ok = put_vcard(session, url, vcard)
        if ok:
            if uid in existing:
                updated += 1
            else:
                added += 1
        else:
            failed += 1

    group_vcard = build_group_vcard(member_uids)
    group_url   = f"{book_url}{GROUP_UID}.vcf"
    put_vcard(session, group_url, group_vcard)
    print(f"  → Groupe '{GROUP_NAME}' créé/mis à jour avec {len(member_uids)} membres")

    print(f"\nSynchronisation terminée !")
    print(f"  Ajoutés    : {added}")
    print(f"  Mis à jour : {updated}")
    print(f"  Échecs     : {failed}")
    print(f"\nSur ton iPhone, ouvre Contacts → groupe '{GROUP_NAME}' — tous les noms commencent par 'CLI'.")


if __name__ == "__main__":
    main()
