/**
 * Radar Mandats — préparation de la BDNB pour la page statique  (v2)
 *
 * La BDNB répartit ses informations sur plusieurs tables reliées par
 * batiment_groupe_id. Ce script fait les jointures et produit, par commune,
 * un fichier léger : pour chaque adresse, l'année de construction, le nombre
 * de niveaux, le nombre de logements, le nombre de lots de copropriété et la
 * parcelle cadastrale.
 *
 * Utilisation :
 *   node filtrer-bdnb.js ./bdnb_11 ./bdnb_34 ./bat
 *
 * Les dossiers d'entrée sont les extractions CSV décompressées de bdnb.io.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");

const COMMUNES = [
  "Béziers","Boujan-sur-Libron","Lieuran-lès-Béziers","Corneilhan","Thézan-lès-Béziers","Maraussan",
  "Lignan-sur-Orb","Murviel-lès-Béziers","Cazouls-lès-Béziers","Puimisson","Puissalicon","Magalas",
  "Abeilhan","Servian","Bassan","Pailhès","Cessenon-sur-Orb","Sauvian","Sérignan","Valras-Plage",
  "Portiragnes","Vias","Lespignan","Nissan-lez-Enserune","Montady","Colombiers","Poilhes","Maureilhan",
  "Capestang","Vendres","Cers","Villeneuve-lès-Béziers","Aigues-Vives","Agel","Aigne","Beaufort",
  "Oupia","Minerve","La Caunette","Saint-Jean-de-Minervois","Olonzac","Azillanet","Cesseras","Siran",
  "La Livinière","Félines-Minervois","Pouzols-Minervois","Pépieux","Azille","Homps","La Redorte",
  "Tourouzelle","Paraza","Saint-Nazaire-d'Aude","Argens-Minervois","Roubia","Castelnau-d'Aude",
  "Raissac-d'Aude","Saint-Marcel-sur-Aude","Narbonne","Montredon-des-Corbières","Montbrun-des-Corbières",
  "Escales","Névian","Marcorignan","Moussan","Vinassan","Armissan","Coursan","Rieux-Minervois",
  "Puichéric","Bize-Minervois","Ginestas","Argeliers","Sainte-Valière","Cuxac-d'Aude",
  "Lézignan-Corbières","Canet","Fleury","Salles-d'Aude","Gruissan","Boutenac","Saint-André-de-Roquelongue"
];

const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const sansArticle = (v) => norm(v).replace(/^(la|le|les|l) /, "");
const slug = (v) => sansArticle(v).replace(/\s+/g, "-");
const cible = new Set(COMMUNES.map(sansArticle));

function ouvrir(f) {
  const brut = fs.createReadStream(f);
  return f.endsWith(".gz") ? brut.pipe(zlib.createGunzip()) : brut;
}
function decoupe(l, sep) {
  const out = []; let cur = "", g = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') { g = !g; continue; }
    if (c === sep && !g) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur); return out;
}
/* Parcourt un CSV en ne gardant que les colonnes demandées. */
async function parcourir(fichier, colonnes, surLigne) {
  if (!fs.existsSync(fichier)) { console.log(`   (absent : ${path.basename(fichier)})`); return 0; }
  const rl = readline.createInterface({ input: ouvrir(fichier), crlfDelay: Infinity });
  let idx = null, sep = ",", n = 0;
  for await (const ligne of rl) {
    if (!idx) {
      sep = (ligne.match(/;/g) || []).length > (ligne.match(/,/g) || []).length ? ";" : ",";
      const e = decoupe(ligne, sep).map((x) => x.trim());
      idx = {}; colonnes.forEach((c) => { idx[c] = e.indexOf(c); });
      const manquantes = colonnes.filter((c) => idx[c] < 0);
      if (manquantes.length) console.log(`   colonnes absentes dans ${path.basename(fichier)} : ${manquantes.join(", ")}`);
      continue;
    }
    const c = decoupe(ligne, sep);
    const o = {};
    colonnes.forEach((k) => { o[k] = idx[k] >= 0 ? c[idx[k]] : ""; });
    surLigne(o); n++;
  }
  return n;
}
const F = (v) => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; };

async function traiter(dossier, bat) {
  const P = (f) => {
    const a = path.join(dossier, f), b = a + ".gz";
    return fs.existsSync(a) ? a : b;
  };
  console.log(`\n${dossier}`);

  /* 1. les bâtiments des communes visées */
  const garde = {};
  let n = await parcourir(P("batiment_groupe.csv"),
    ["batiment_groupe_id", "libelle_commune_insee"], (r) => {
      if (!cible.has(sansArticle(r.libelle_commune_insee))) return;
      garde[r.batiment_groupe_id] = { commune: r.libelle_commune_insee };
    });
  console.log(`   batiment_groupe : ${n.toLocaleString("fr-FR")} lignes → ${Object.keys(garde).length.toLocaleString("fr-FR")} bâtiments retenus`);

  /* 2. leur adresse principale */
  await parcourir(P("batiment_groupe_adresse.csv"),
    ["batiment_groupe_id", "libelle_adr_principale_ban"], (r) => {
      const g = garde[r.batiment_groupe_id];
      if (g && r.libelle_adr_principale_ban) g.adr = r.libelle_adr_principale_ban;
    });

  /* 2 bis. si l'adresse principale est peu renseignée, on passe par la table de liaison */
  const sansAdr = Object.values(garde).filter((g) => !g.adr).length;
  const total = Object.keys(garde).length;
  if (total && sansAdr / total > 0.4) {
    console.log(`   adresse principale absente sur ${Math.round(sansAdr / total * 100)} % des bâtiments → passage par adresse.csv`);
    const parCle = {};
    await parcourir(P("rel_batiment_groupe_adresse.csv"),
      ["batiment_groupe_id", "cle_interop_adr"], (r) => {
        if (garde[r.batiment_groupe_id] && !garde[r.batiment_groupe_id].adr && r.cle_interop_adr)
          (parCle[r.cle_interop_adr] = parCle[r.cle_interop_adr] || []).push(r.batiment_groupe_id);
      });
    await parcourir(P("adresse.csv"),
      ["cle_interop_adr", "numero", "rep", "type_voie", "nom_voie", "libelle_adresse", "libelle_commune"], (r) => {
        const ids = parCle[r.cle_interop_adr];
        if (!ids) return;
        const lib = r.libelle_adresse ||
          [r.numero, r.rep, r.type_voie, r.nom_voie].filter(Boolean).join(" ");
        if (!lib) return;
        ids.forEach((id) => { if (garde[id] && !garde[id].adr) garde[id].adr = lib; });
      });
  }

  /* 3. caractéristiques du bâti */
  await parcourir(P("batiment_groupe_ffo_bat.csv"),
    ["batiment_groupe_id", "nb_niveau", "annee_construction", "nb_log"], (r) => {
      const g = garde[r.batiment_groupe_id];
      if (!g) return;
      g.an = F(r.annee_construction); g.niv = F(r.nb_niveau); g.log = F(r.nb_log);
    });

  /* 4. copropriétés : nombre de lots */
  await parcourir(P("batiment_groupe_rnc.csv"),
    ["batiment_groupe_id", "nb_lot_tot"], (r) => {
      const g = garde[r.batiment_groupe_id];
      if (g) g.lots = F(r.nb_lot_tot);
    });

  /* 5. parcelle cadastrale */
  await parcourir(P("rel_batiment_groupe_parcelle.csv"),
    ["batiment_groupe_id", "parcelle_id", "parcelle_principale"], (r) => {
      const g = garde[r.batiment_groupe_id];
      if (!g || !r.parcelle_id) return;
      if (!g.parc || r.parcelle_principale === "true" || r.parcelle_principale === "1") g.parc = r.parcelle_id;
    });

  /* regroupement par commune */
  let avecAdr = 0;
  Object.values(garde).forEach((g) => {
    if (!g.adr) return;
    avecAdr++;
    const k = slug(g.commune);
    const d = bat[k] || (bat[k] = { commune: g.commune, adr: {}, parc: {} });
    const cle = norm(g.adr.replace(/\s+\d{5}\s.*$/, ""));
    if (!cle) return;
    d.adr[cle] = [g.an || 0, g.niv || 0, g.log || 0, g.lots || 0, g.parc || ""];
    if (g.parc) d.parc[g.parc] = cle;
  });
  console.log(`   bâtiments avec adresse : ${avecAdr.toLocaleString("fr-FR")}`);
}

(async () => {
  const args = process.argv.slice(2);
  const sortie = args.length > 1 ? args[args.length - 1] : "./bat";
  const dossiers = args.length > 1 ? args.slice(0, -1) : ["."];
  fs.mkdirSync(sortie, { recursive: true });
  const bat = {};
  for (const d of dossiers) await traiter(d, bat);

  const index = []; let poids = 0;
  Object.keys(bat).sort().forEach((k) => {
    const d = bat[k];
    const f = path.join(sortie, k + ".json");
    fs.writeFileSync(f, JSON.stringify({ adr: d.adr, parc: d.parc }));
    const o = fs.statSync(f).size; poids += o;
    index.push({ slug: k, commune: d.commune, adresses: Object.keys(d.adr).length,
                 parcelles: Object.keys(d.parc).length, octets: o });
  });
  fs.writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 1));
  console.log(`\n${index.length} communes écrites dans ${sortie} — ${(poids / 1048576).toFixed(1)} Mo`);
  index.sort((a, b) => b.adresses - a.adresses).slice(0, 5)
    .forEach((x) => console.log(`   ${x.commune} : ${x.adresses.toLocaleString("fr-FR")} adresses, ${Math.round(x.octets / 1024)} Ko`));
  const absentes = COMMUNES.filter((c) => !index.some((i) => sansArticle(i.commune) === sansArticle(c)));
  if (absentes.length) console.log(`\ncommunes sans résultat : ${absentes.join(", ")}`);
})();
