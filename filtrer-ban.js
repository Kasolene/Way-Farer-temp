/**
 * Radar Mandats — préparation des adresses pour la page statique
 *
 * Lit les fichiers de la Base Adresse Nationale déjà téléchargés
 * (adresses-11.csv.gz et adresses-34.csv.gz), ne garde que les communes
 * du périmètre Laborie, et écrit un fichier JSON compact par commune.
 *
 * Utilisation :
 *   node filtrer-ban.js <dossier-des-csv-gz> <dossier-de-sortie>
 * Exemple :
 *   node filtrer-ban.js ./data/ban ./ban
 *
 * Sortie : un fichier ./ban/<slug>.json par commune, plus ./ban/index.json
 * Chaque adresse est un tableau compact : [numero, voie, lat, lon]
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");

const COMMUNES = [
  // Béziers et couronne (34)
  "Béziers", "Boujan-sur-Libron", "Lieuran-lès-Béziers", "Corneilhan", "Thézan-lès-Béziers",
  "Maraussan", "Lignan-sur-Orb", "Murviel-lès-Béziers", "Cazouls-lès-Béziers", "Puimisson",
  "Puissalicon", "Magalas", "Abeilhan", "Servian", "Bassan", "Pailhès", "Cessenon-sur-Orb",
  "Sauvian", "Sérignan", "Valras-Plage", "Portiragnes", "Vias", "Lespignan", "Nissan-lez-Enserune",
  "Montady", "Colombiers", "Poilhes", "Maureilhan", "Capestang", "Vendres", "Cers", "Villeneuve-lès-Béziers",
  // Minervois (34)
  "Aigues-Vives", "Agel", "Aigne", "Beaufort", "Oupia", "Minerve", "La Caunette",
  "Saint-Jean-de-Minervois", "Olonzac", "Azillanet", "Cesseras", "Siran", "La Livinière",
  "Félines-Minervois",
  // Minervois et Narbonnais (11)
  "Pouzols-Minervois", "Pépieux", "Azille", "Homps", "La Redorte", "Tourouzelle", "Paraza",
  "Saint-Nazaire-d'Aude", "Argens-Minervois", "Roubia", "Castelnau-d'Aude", "Raissac-d'Aude",
  "Saint-Marcel-sur-Aude", "Narbonne", "Montredon-des-Corbières", "Montbrun-des-Corbières",
  "Escales", "Névian", "Marcorignan", "Moussan", "Vinassan", "Armissan", "Coursan",
  "Rieux-Minervois", "Puichéric", "Bize-Minervois", "Ginestas", "Argeliers", "Sainte-Valière",
  "Cuxac-d'Aude", "Lézignan-Corbières", "Canet", "Fleury", "Salles-d'Aude", "Gruissan",
  "Boutenac", "Saint-André-de-Roquelongue"
];

const norm = (v) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

const slug = (v) => norm(v).replace(/\s+/g, "-");

const cible = new Set(COMMUNES.map(norm));

async function lireFichier(fichier, parCommune) {
  const flux = fs.createReadStream(fichier).pipe(zlib.createGunzip());
  const lignes = readline.createInterface({ input: flux, crlfDelay: Infinity });
  let entete = null, idx = {}, lus = 0, gardes = 0;

  for await (const ligne of lignes) {
    if (!entete) {
      entete = ligne.split(";");
      ["numero", "rep", "nom_voie", "nom_commune", "code_postal", "lat", "lon"]
        .forEach((c) => { idx[c] = entete.indexOf(c); });
      continue;
    }
    lus++;
    const c = ligne.split(";");
    const commune = c[idx.nom_commune];
    if (!cible.has(norm(commune))) continue;
    const lat = parseFloat(c[idx.lat]), lon = parseFloat(c[idx.lon]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const numero = [c[idx.numero], c[idx.rep]].filter(Boolean).join(" ").trim();
    const voie = (c[idx.nom_voie] || "").trim();
    if (!voie) continue;
    const k = slug(commune);
    if (!parCommune[k]) parCommune[k] = { commune, cp: c[idx.code_postal] || "", adresses: [] };
    parCommune[k].adresses.push([numero, voie, +lat.toFixed(6), +lon.toFixed(6)]);
    gardes++;
  }
  console.log(`  ${path.basename(fichier)} : ${lus.toLocaleString("fr-FR")} lignes lues, ${gardes.toLocaleString("fr-FR")} retenues`);
}

(async () => {
  const entree = process.argv[2] || "./data/ban";
  const sortie = process.argv[3] || "./ban";
  fs.mkdirSync(sortie, { recursive: true });

  const parCommune = {};
  for (const dep of ["11", "34"]) {
    const f = path.join(entree, `adresses-${dep}.csv.gz`);
    if (!fs.existsSync(f)) { console.log(`  fichier absent : ${f}`); continue; }
    await lireFichier(f, parCommune);
  }

  const index = [];
  let total = 0;
  Object.keys(parCommune).sort().forEach((k) => {
    const d = parCommune[k];
    const vu = new Set(), uniques = [];
    d.adresses.forEach((a) => {
      const c = a[0] + "|" + norm(a[1]);
      if (vu.has(c)) return;
      vu.add(c); uniques.push(a);
    });
    fs.writeFileSync(path.join(sortie, k + ".json"), JSON.stringify(uniques));
    const poids = fs.statSync(path.join(sortie, k + ".json")).size;
    index.push({ slug: k, commune: d.commune, cp: d.cp, adresses: uniques.length, octets: poids });
    total += poids;
  });
  fs.writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 1));

  console.log(`\n${index.length} communes écrites dans ${sortie}`);
  console.log(`poids total : ${(total / 1048576).toFixed(1)} Mo`);
  const manquantes = COMMUNES.filter((c) => !index.some((i) => norm(i.commune) === norm(c)));
  if (manquantes.length) console.log(`communes sans adresse trouvée : ${manquantes.join(", ")}`);
})();