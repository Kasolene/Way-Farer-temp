/**
 * Radar Mandats — préparation de la BDNB pour la page statique
 *
 * La BDNB (Base de Données Nationale des Bâtiments, CSTB) décrit chaque
 * bâtiment : année de construction, nombre de niveaux, nombre de logements.
 * Croisée avec les adresses, elle permet d'éliminer les rues dont le bâti
 * ne correspond pas au bien recherché.
 *
 * Étape 1 — inspecter (les noms de colonnes changent selon le millésime) :
 *   node filtrer-bdnb.js --inspect ./bdnb_34
 *   → affiche les tables trouvées et leurs colonnes. Envoyer cette sortie.
 *
 * Étape 2 — filtrer :
 *   node filtrer-bdnb.js ./bdnb_11 ./bdnb_34 ./bat
 *   → écrit un fichier JSON par commune dans ./bat
 *
 * Les dossiers passés en entrée sont les extractions décompressées
 * téléchargées sur https://bdnb.io/download/ (format CSV, par département).
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

/* ---------- communes du périmètre Laborie ---------- */
const COMMUNES = [
  "Béziers", "Boujan-sur-Libron", "Lieuran-lès-Béziers", "Corneilhan", "Thézan-lès-Béziers",
  "Maraussan", "Lignan-sur-Orb", "Murviel-lès-Béziers", "Cazouls-lès-Béziers", "Puimisson",
  "Puissalicon", "Magalas", "Abeilhan", "Servian", "Bassan", "Pailhès", "Cessenon-sur-Orb",
  "Sauvian", "Sérignan", "Valras-Plage", "Portiragnes", "Vias", "Lespignan", "Nissan-lez-Enserune",
  "Montady", "Colombiers", "Poilhes", "Maureilhan", "Capestang", "Vendres", "Cers",
  "Villeneuve-lès-Béziers", "Aigues-Vives", "Agel", "Aigne", "Beaufort", "Oupia", "Minerve",
  "La Caunette", "Saint-Jean-de-Minervois", "Olonzac", "Azillanet", "Cesseras", "Siran",
  "La Livinière", "Félines-Minervois", "Pouzols-Minervois", "Pépieux", "Azille", "Homps",
  "La Redorte", "Tourouzelle", "Paraza", "Saint-Nazaire-d'Aude", "Argens-Minervois", "Roubia",
  "Castelnau-d'Aude", "Raissac-d'Aude", "Saint-Marcel-sur-Aude", "Narbonne",
  "Montredon-des-Corbières", "Montbrun-des-Corbières", "Escales", "Névian", "Marcorignan",
  "Moussan", "Vinassan", "Armissan", "Coursan", "Rieux-Minervois", "Puichéric", "Bize-Minervois",
  "Ginestas", "Argeliers", "Sainte-Valière", "Cuxac-d'Aude", "Lézignan-Corbières", "Canet",
  "Fleury", "Salles-d'Aude", "Gruissan", "Boutenac", "Saint-André-de-Roquelongue"
];

const norm = (v) => String(v ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const slug = (v) => norm(v).replace(/^(la|le|les|l) /, "").replace(/\s+/g, "-");
const cible = new Set(COMMUNES.map((c) => norm(c).replace(/^(la|le|les|l) /, "")));

/* ---------- lecture CSV tolérante (séparateur détecté, .csv ou .csv.gz) ---------- */
function ouvrir(fichier) {
  const brut = fs.createReadStream(fichier);
  return fichier.endsWith(".gz") ? brut.pipe(zlib.createGunzip()) : brut;
}
function decoupe(ligne, sep) {
  const out = []; let cur = "", guil = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') { guil = !guil; continue; }
    if (c === sep && !guil) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
async function lire(fichier, surLigne, maxLignes) {
  const rl = readline.createInterface({ input: ouvrir(fichier), crlfDelay: Infinity });
  let entete = null, sep = ",", n = 0;
  for await (const ligne of rl) {
    if (!entete) {
      sep = (ligne.match(/;/g) || []).length > (ligne.match(/,/g) || []).length ? ";" : ",";
      entete = decoupe(ligne, sep).map((x) => x.trim());
      continue;
    }
    surLigne(decoupe(ligne, sep), entete);
    if (maxLignes && ++n >= maxLignes) break;
  }
  return entete;
}

/* ---------- repérage des colonnes, quel que soit le millésime ---------- */
const MOTIFS = {
  id:        /^(batiment_groupe_id|batiment_id|id)$/i,
  annee:     /ann?ee.*(construction|constr)|periode.*construction/i,
  niveaux:   /nb_niveau|nombre.*niveau|nb_etage|hauteur/i,
  logements: /nb_log|nombre.*logement/i,
  commune:   /libelle_commune|nom_commune|commune(?!.*code)/i,
  insee:     /code_commune_insee|code_insee|code_commune/i,
  adresse:   /libelle_adresse|adresse_complete|^adresse$|libelle_voie|nom_voie/i,
  numero:    /^(numero|num_voie|numero_voie)$/i
};
const trouve = (entete, quoi) => entete.findIndex((c) => MOTIFS[quoi].test(c));

async function inspecter(dossier) {
  const fichiers = fs.readdirSync(dossier).filter((f) => /\.csv(\.gz)?$/i.test(f));
  console.log(`${fichiers.length} fichiers CSV dans ${dossier}\n`);
  for (const f of fichiers) {
    const chemin = path.join(dossier, f);
    let entete = null, apercu = null;
    await lire(chemin, (c, e) => { if (!apercu) { entete = e; apercu = c; } }, 1);
    if (!entete) continue;
    const interet = Object.keys(MOTIFS).filter((k) => trouve(entete, k) >= 0);
    console.log(`— ${f}`);
    console.log(`   colonnes (${entete.length}) : ${entete.slice(0, 14).join(", ")}${entete.length > 14 ? " …" : ""}`);
    if (interet.length) console.log(`   utile ici : ${interet.join(", ")}`);
    console.log("");
  }
  console.log("Envoyer cette sortie à Olivier pour caler l'étape 2.");
}

async function filtrer(dossiers, sortie) {
  fs.mkdirSync(sortie, { recursive: true });
  const parCommune = {};
  let lus = 0, gardes = 0;

  for (const dossier of dossiers) {
    const fichiers = fs.readdirSync(dossier).filter((f) => /\.csv(\.gz)?$/i.test(f));
    /* on cherche la table qui porte à la fois une adresse et une caractéristique de bâti */
    for (const f of fichiers) {
      const chemin = path.join(dossier, f);
      let entete = null;
      await lire(chemin, (c, e) => { if (!entete) entete = e; }, 1);
      if (!entete) continue;
      const iAdr = trouve(entete, "adresse"), iCom = trouve(entete, "commune");
      const iAn = trouve(entete, "annee"), iNiv = trouve(entete, "niveaux"), iLog = trouve(entete, "logements");
      if (iAdr < 0 || (iAn < 0 && iNiv < 0 && iLog < 0)) continue;
      console.log(`  lecture de ${f}`);
      await lire(chemin, (c) => {
        lus++;
        const commune = iCom >= 0 ? c[iCom] : "";
        const k = slug(commune);
        if (!cible.has(norm(commune).replace(/^(la|le|les|l) /, ""))) return;
        const adr = (c[iAdr] || "").trim();
        if (!adr) return;
        const an = iAn >= 0 ? parseInt(c[iAn], 10) : 0;
        const niv = iNiv >= 0 ? parseInt(c[iNiv], 10) : 0;
        const log = iLog >= 0 ? parseInt(c[iLog], 10) : 0;
        if (!an && !niv && !log) return;
        (parCommune[k] = parCommune[k] || { commune, bat: {} }).bat[norm(adr)] =
          [an || 0, niv || 0, log || 0];
        gardes++;
      });
    }
  }

  const index = [];
  let poids = 0;
  Object.keys(parCommune).sort().forEach((k) => {
    const d = parCommune[k];
    const fichier = path.join(sortie, k + ".json");
    fs.writeFileSync(fichier, JSON.stringify(d.bat));
    const o = fs.statSync(fichier).size; poids += o;
    index.push({ slug: k, commune: d.commune, batiments: Object.keys(d.bat).length, octets: o });
  });
  fs.writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 1));
  console.log(`\n${lus.toLocaleString("fr-FR")} lignes lues, ${gardes.toLocaleString("fr-FR")} retenues`);
  console.log(`${index.length} communes écrites dans ${sortie} — ${(poids / 1048576).toFixed(1)} Mo`);
  if (!index.length) console.log("Aucune donnée retenue : relancer avec --inspect et envoyer la sortie.");
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === "--inspect") {
    await inspecter(args[1] || ".");
    return;
  }
  const sortie = args.length > 1 ? args[args.length - 1] : "./bat";
  const dossiers = args.length > 1 ? args.slice(0, -1) : ["."];
  await filtrer(dossiers, sortie);
})();
