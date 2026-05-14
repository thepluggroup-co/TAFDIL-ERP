const supabase = require('../config/supabase');
const { getRecapMensuel } = require('./pointageService');

// ============================================================
// Calcul IRPP progressif camerounais
// ============================================================
function calculerIRPP(base_annuelle, tranches) {
  let irpp = 0;
  let reste = base_annuelle;

  for (const tranche of tranches) {
    if (reste <= 0) break;
    const plancher = tranche.de;
    const plafond = tranche.a !== null ? tranche.a : Infinity;
    const largeur = plafond - plancher;
    const montant_dans_tranche = Math.min(reste, largeur);
    if (montant_dans_tranche <= 0) continue;
    irpp += montant_dans_tranche * tranche.taux;
    reste -= montant_dans_tranche;
  }

  return Math.round(irpp);
}

// ============================================================
// Montant en lettres (XAF)
// ============================================================
function montantEnLettres(n) {
  const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingts', 'quatre-vingt-dix'];

  const val = Math.round(n);
  if (val === 0) return 'zéro franc CFA';

  function infMille(num) {
    if (num === 0) return '';
    if (num < 20) return UNITS[num];
    const dizaine = Math.floor(num / 10);
    const unite = num % 10;
    if (dizaine === 7 || dizaine === 9) {
      return TENS[dizaine - 1] + (unite === 1 ? '-et-' : '-') + UNITS[10 + unite];
    }
    return TENS[dizaine] + (unite > 0 ? (unite === 1 && dizaine !== 8 ? '-et-' : '-') + UNITS[unite] : '');
  }

  const millions = Math.floor(val / 1000000);
  const milliers = Math.floor((val % 1000000) / 1000);
  const reste = val % 1000;
  const centaines_str = (num) => {
    if (num === 0) return '';
    const c = Math.floor(num / 100);
    const r = num % 100;
    const prefix = c === 1 ? 'cent' : (c > 1 ? UNITS[c] + ' cent' : '');
    return prefix + (r > 0 ? ' ' + infMille(r) : (c > 1 && r === 0 ? 's' : ''));
  };

  let res = '';
  if (millions > 0) res += (millions === 1 ? 'un million' : centaines_str(millions) + ' millions') + ' ';
  if (milliers > 0) res += (milliers === 1 ? 'mille' : centaines_str(milliers) + ' mille') + ' ';
  if (reste > 0) res += centaines_str(reste);
  return res.trim() + ' francs CFA';
}

// ============================================================
// Moteur de calcul bulletin
// ============================================================
async function calculerBulletin({ employe_id, annee, mois }) {
  // 1. Récupérer l'employé
  const { data: employe, error: emp_err } = await supabase
    .from('employes')
    .select('id, nom, prenom, matricule, salaire_base_xaf, cnps_numero_affiliation, poste, departement')
    .eq('id', employe_id)
    .single();

  if (emp_err || !employe) throw new Error('Employé introuvable');

  // 2. Récupérer les paramètres de paie actifs pour l'année
  const { data: params } = await supabase
    .from('parametres_paie')
    .select('*')
    .eq('annee', annee)
    .eq('actif', true)
    .single();

  const p = params || {
    cnps_vieillesse_salarie: 0.028,
    plafond_cnps_xaf: 750000,
    cnps_vieillesse_patron: 0.042,
    cnps_at_patron: 0.035,
    cnps_family_patron: 0.070,
    tranches_irpp: [
      { de: 0, a: 2000000, taux: 0.10 },
      { de: 2000001, a: 3000000, taux: 0.155 },
      { de: 3000001, a: 5000000, taux: 0.20 },
      { de: 5000001, a: 10000000, taux: 0.245 },
      { de: 10000001, a: null, taux: 0.35 },
    ],
    abattement_irpp_pct: 0.30,
    cac_taux: 0.10,
  };

  // 3. Récap pointages du mois
  const recap = await getRecapMensuel(employe_id, annee, mois);

  // 4. Taux horaire de base
  const salaire_base = parseFloat(employe.salaire_base_xaf);
  const taux_horaire = salaire_base / 173.33; // 40h × 4.33 semaines

  // 5. Heures supplémentaires
  const heures_sup = recap.heures_sup_total;
  const montant_heures_sup = Math.round(heures_sup * taux_horaire * 1.25); // 25% par défaut

  // 6. Primes du mois
  const { data: primes_rows } = await supabase
    .from('primes_mensuelles')
    .select('*')
    .eq('employe_id', employe_id)
    .eq('annee', annee)
    .eq('mois', mois);

  const primes_detail = primes_rows || [];
  const primes_total = primes_detail.reduce((s, pr) => s + parseFloat(pr.montant_xaf || 0), 0);

  // 7. Avantages en nature (transport fixe si prime transport)
  const avantages_nature = 0; // Configuré via primes si applicable

  // ÉTAPE 1 — SALAIRE BRUT
  const salaire_brut = salaire_base + montant_heures_sup + primes_total + avantages_nature;

  // ÉTAPE 2 — CNPS SALARIÉ
  const base_cnps = Math.min(salaire_brut, parseFloat(p.plafond_cnps_xaf));
  const cnps_vieillesse_sal = Math.round(base_cnps * parseFloat(p.cnps_vieillesse_salarie));
  const total_retenues_sal_cnps = cnps_vieillesse_sal;

  // ÉTAPE 3 — IRPP
  const salaire_imposable_annuel = (salaire_brut - cnps_vieillesse_sal) * 12;
  const base_irpp = Math.round(salaire_imposable_annuel * (1 - parseFloat(p.abattement_irpp_pct)));
  const irpp_annuel = calculerIRPP(base_irpp, p.tranches_irpp);
  const irpp_mensuel = Math.round(irpp_annuel / 12);
  const cac_mensuel = Math.round(irpp_mensuel * parseFloat(p.cac_taux));
  const total_irpp = irpp_mensuel + cac_mensuel;

  // ÉTAPE 4 — SALAIRE NET
  // Avances sur salaire du mois
  const { data: avances_rows } = await supabase
    .from('avances_salaire')
    .select('montant_xaf')
    .eq('employe_id', employe_id)
    .eq('annee', annee)
    .eq('mois', mois)
    .eq('rembourse', false);

  const avances_deduites = (avances_rows || []).reduce((s, a) => s + parseFloat(a.montant_xaf || 0), 0);
  const total_retenues = total_retenues_sal_cnps + total_irpp;
  const salaire_net = Math.round(salaire_brut - total_retenues - avances_deduites);

  // ÉTAPE 5 — CHARGES PATRONALES
  const base_cnps_pat = Math.min(salaire_brut, parseFloat(p.plafond_cnps_xaf));
  const cnps_vieillesse_pat = Math.round(base_cnps_pat * parseFloat(p.cnps_vieillesse_patron));
  const cnps_at_pat = Math.round(salaire_brut * parseFloat(p.cnps_at_patron));
  const cnps_family_pat = Math.round(base_cnps_pat * parseFloat(p.cnps_family_patron));
  const total_charges_pat = cnps_vieillesse_pat + cnps_at_pat + cnps_family_pat;
  const cout_total_employeur = Math.round(salaire_brut + total_charges_pat);

  return {
    employe,
    annee,
    mois,
    // Bruts
    salaire_base,
    heures_normales: recap.heures_normales_total,
    heures_sup,
    montant_heures_sup,
    primes_total: Math.round(primes_total),
    primes_detail,
    avantages_nature,
    salaire_brut: Math.round(salaire_brut),
    // CNPS sal
    base_cnps,
    cnps_vieillesse_sal,
    total_retenues_sal_cnps,
    // IRPP
    salaire_imposable_annuel: Math.round(salaire_imposable_annuel),
    base_irpp,
    irpp_annuel,
    irpp_mensuel,
    cac_mensuel,
    total_irpp,
    // Net
    total_retenues,
    avances_deduites: Math.round(avances_deduites),
    salaire_net,
    salaire_net_lettres: montantEnLettres(salaire_net),
    // Charges pat
    cnps_vieillesse_pat,
    cnps_at_pat,
    cnps_family_pat,
    total_charges_pat,
    cout_total_employeur,
    // Pointage recap
    jours_travailles: recap.jours_travailles,
    absences_impact_paie: recap.absences_impact_paie,
  };
}

/**
 * Sauvegarde (upsert) un bulletin calculé en base.
 */
async function sauvegarderBulletin(calcul) {
  const payload = {
    employe_id:             calcul.employe.id,
    annee:                  calcul.annee,
    mois:                   calcul.mois,
    salaire_base:           calcul.salaire_base,
    heures_normales:        calcul.heures_normales,
    heures_sup:             calcul.heures_sup,
    montant_heures_sup:     calcul.montant_heures_sup,
    primes_total:           calcul.primes_total,
    avantages_nature:       calcul.avantages_nature,
    salaire_brut:           calcul.salaire_brut,
    base_cnps:              calcul.base_cnps,
    cnps_vieillesse_sal:    calcul.cnps_vieillesse_sal,
    total_retenues_sal_cnps: calcul.total_retenues_sal_cnps,
    salaire_imposable_annuel: calcul.salaire_imposable_annuel,
    base_irpp:              calcul.base_irpp,
    irpp_annuel:            calcul.irpp_annuel,
    irpp_mensuel:           calcul.irpp_mensuel,
    cac_mensuel:            calcul.cac_mensuel,
    total_irpp:             calcul.total_irpp,
    total_retenues:         calcul.total_retenues,
    avances_deduites:       calcul.avances_deduites,
    salaire_net:            calcul.salaire_net,
    cnps_vieillesse_pat:    calcul.cnps_vieillesse_pat,
    cnps_at_pat:            calcul.cnps_at_pat,
    cnps_family_pat:        calcul.cnps_family_pat,
    total_charges_pat:      calcul.total_charges_pat,
    cout_total_employeur:   calcul.cout_total_employeur,
    primes_detail:          calcul.primes_detail,
    detail_calcul:          { salaire_net_lettres: calcul.salaire_net_lettres },
    statut:                 'BROUILLON',
    updated_at:             new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('bulletins_paie')
    .upsert(payload, { onConflict: 'employe_id,annee,mois' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Génère le journal de paie pour tous les employés actifs d'un mois.
 */
async function genererJournalPaie(annee, mois) {
  const { data: employes } = await supabase
    .from('employes')
    .select('id')
    .eq('statut', 'ACTIF');

  const bulletins = [];
  const erreurs = [];

  for (const e of (employes || [])) {
    try {
      const calcul = await calculerBulletin({ employe_id: e.id, annee, mois });
      const bulletin = await sauvegarderBulletin(calcul);
      bulletins.push(bulletin);
    } catch (err) {
      erreurs.push({ employe_id: e.id, erreur: err.message });
    }
  }

  // Agréger totaux
  const total_brut = bulletins.reduce((s, b) => s + parseFloat(b.salaire_brut), 0);
  const total_net = bulletins.reduce((s, b) => s + parseFloat(b.salaire_net), 0);
  const total_charges_pat = bulletins.reduce((s, b) => s + parseFloat(b.total_charges_pat), 0);
  const total_cnps_sal = bulletins.reduce((s, b) => s + parseFloat(b.total_retenues_sal_cnps), 0);
  const total_irpp = bulletins.reduce((s, b) => s + parseFloat(b.total_irpp), 0);

  const { data: journal, error } = await supabase
    .from('journaux_paie')
    .upsert({
      annee,
      mois,
      statut: 'BROUILLON',
      total_employes: bulletins.length,
      total_brut: Math.round(total_brut),
      total_net: Math.round(total_net),
      total_charges_pat: Math.round(total_charges_pat),
      total_cnps_sal: Math.round(total_cnps_sal),
      total_irpp: Math.round(total_irpp),
      bulletins_ids: bulletins.map(b => b.id),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'annee,mois' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { journal, bulletins, erreurs };
}

/**
 * Valider le journal (DG) → statut VALIDÉ.
 */
async function validerJournal(journal_id, valide_par) {
  // Valider tous les bulletins du journal
  const { data: journal } = await supabase
    .from('journaux_paie')
    .select('*')
    .eq('id', journal_id)
    .single();

  if (!journal) throw new Error('Journal introuvable');

  await supabase
    .from('bulletins_paie')
    .update({ statut: 'VALIDE', valide_par, updated_at: new Date().toISOString() })
    .in('id', journal.bulletins_ids || []);

  const { data, error } = await supabase
    .from('journaux_paie')
    .update({
      statut: 'VALIDE',
      valide_par_dg: valide_par,
      date_validation: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', journal_id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Données déclaration CNPS mensuelle.
 */
async function getDeclarationCNPS(annee, mois) {
  const { data: bulletins, error } = await supabase
    .from('bulletins_paie')
    .select(`
      salaire_brut, cnps_vieillesse_sal, cnps_vieillesse_pat,
      cnps_at_pat, cnps_family_pat, total_charges_pat,
      employe:employe_id (
        matricule, nom, prenom, cnps_numero_affiliation,
        date_naissance, date_embauche
      )
    `)
    .eq('annee', annee)
    .eq('mois', mois)
    .in('statut', ['VALIDE', 'PAYE']);

  if (error) throw new Error(error.message);
  return (bulletins || []).map(b => ({
    matricule_cnps: b.employe?.cnps_numero_affiliation || '',
    nom: b.employe?.nom || '',
    prenom: b.employe?.prenom || '',
    matricule_interne: b.employe?.matricule || '',
    salaire_brut: b.salaire_brut,
    cotisation_salarie: b.cnps_vieillesse_sal,
    cotisation_patronale: parseFloat(b.cnps_vieillesse_pat) + parseFloat(b.cnps_family_pat),
    at_patron: b.cnps_at_pat,
    total_patronal: b.total_charges_pat,
  }));
}

/**
 * Tableau de bord masse salariale.
 */
async function getMasseSalariale() {
  const { data, error } = await supabase
    .from('v_masse_salariale')
    .select('*')
    .limit(24);

  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = {
  calculerBulletin,
  sauvegarderBulletin,
  genererJournalPaie,
  validerJournal,
  getDeclarationCNPS,
  getMasseSalariale,
  montantEnLettres,
};
