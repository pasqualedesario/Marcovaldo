import {
  LEAF_MARGINS,
  LEAF_SHAPES
} from './core/modules/morphology/catalog';

export type Lang = 'it' | 'en';

export type SpecimenBlock = {
  sizePt: number;
  /** Unique specimen text; use `\n` for soft line breaks. */
  text: string;
};

export type Dict = {
  font: string;
  faceSans: string;
  faceSerif: string;
  scale: string;
  tracking: string;
  textAria: string;
  shapesAria: string;
  marginsAria: string;
  reshuffle: string;
  download: string;
  downloadAria: string;
  png: string;
  svg: string;
  pdf: string;
  otf: string;
  otfBusy: string;
  otfStatic: string;
  otfStaticBusy: string;
  growthPlay: string;
  growthPause: string;
  specimensAria: string;
  about: string;
  aboutGenerator: string;
  aboutLead: string;
  brandHome: string;
  creditsFrom: string;
  creditsAuthor: string;
  creditsTitle: string;
  creditsPub: string;
  creditsMorph: string;
  creditsMorphUrl: string;
  creditsBy: string;
  creditsType: string;
  fontMissing: string;
  glyphMissing: string;
  typeHint: string;
  points: string;
  langSwitch: string;
  siteUrl: string;
  bootHint: string;
  bootCmd: string;
  bootOpen: string;
  params: Record<string, string>;
  shapes: Record<string, string>;
  margins: Record<string, string>;
  specimens: ReadonlyArray<SpecimenBlock>;
};

/**
 * Specimen excerpts from Calvino’s Marcovaldo — ASCII-safe for FOSS Modern ∩ FOSS Serif
 * (no accented letters; both faces lack Latin diacritics in the subsetted files).
 */
const MARCOVALDO_SPECIMENS: ReadonlyArray<SpecimenBlock> = [
  {
    sizePt: 112,
    text: 'La neve!'
  },
  {
    sizePt: 56,
    text: 'Il freddo ha mille forme\ne mille modi di muoversi\nnel mondo.'
  },
  {
    sizePt: 26,
    text:
      'Gli itinerari che gli uccelli seguono migrando,\n' +
      'verso sud o verso nord, d\'autunno o a primavera,\n' +
      'traversano di rado la citta.\n' +
      'Gli stormi tagliano il cielo alti sopra i campi.'
  },
  {
    sizePt: 24,
    text:
      'Quel mattino lo sveglio il silenzio.\n' +
      'Marcovaldo si tiro su dal letto\n' +
      'col senso di qualcosa di strano nell\'aria.\n' +
      'Aperse la finestra: la citta non c\'era piu,\n' +
      'era stata sostituita da un foglio bianco.'
  },
  {
    sizePt: 12,
    text:
      'I rumori della citta che le notti d\'estate entrano dalle finestre aperte\n' +
      'nelle stanze di chi non puo dormire per il caldo, i rumori veri della citta\n' +
      'notturna, si fanno udire quando a una cert\'ora l\'anonimo frastuono dei\n' +
      'motori dirada e tace, e dal silenzio vengon fuori discreti, nitidi, graduati\n' +
      'secondo la distanza, un passo di nottambulo, il fruscio della bici d\'una\n' +
      'guardia notturna, uno smorzato lontano schiamazzo.'
  },
  {
    sizePt: 8,
    text:
      'Per chi ha in uggia la casa inospitale, il rifugio preferito nelle serate fredde\n' +
      'e sempre il cinema. La passione di Marcovaldo erano i film a colori, sullo\n' +
      'schermo grande che permette d\'abbracciare i piu vasti orizzonti: praterie,\n' +
      'montagne rocciose, foreste equatoriali, isole dove si vive coronati di fiori.\n' +
      'Vedeva il film due volte, usciva solo quando il cinema chiudeva; e col\n' +
      'pensiero continuava ad abitare quei paesaggi e a respirare quei colori.\n' +
      'Ma il rincasare nella sera piovigginosa, l\'aspettare alla fermata il tram\n' +
      'numero 30, il constatare che la sua vita non avrebbe conosciuto altro\n' +
      'scenario che tram, semafori, locali al seminterrato, fornelli a gas, roba\n' +
      'stesa, magazzini e reparti d\'imballaggio, gli facevano svanire lo splendore\n' +
      'del film in una tristezza sbiadita e grigia.'
  }
];

function labelize(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function morphDict(
  ids: readonly string[],
  overrides: Record<string, string> = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) out[id] = overrides[id] ?? labelize(id);
  return out;
}

const SHAPE_IT = morphDict(LEAF_SHAPES, {
  acicular: 'Aciculare',
  linear: 'Lineare',
  lanceolate: 'Lanceolata',
  elliptic: 'Ellittica',
  ovate: 'Ovata',
  obovate: 'Obovata',
  orbicular: 'Orbicolare',
  reniform: 'Reniforme',
  cordate: 'Cordata',
  deltoid: 'Deltoide',
  hastate: 'Astata',
  sagittate: 'Sagittata',
  falcate: 'Falcata',
  flabellate: 'Flabellata',
  lobed: 'Lobata',
  pinnatisect: 'Pinnatisetta',
  palmatifid: 'Palmatifida',
  trifoliate: 'Trifogliata',
  palmate: 'Palmata'
});

const SHAPE_EN = morphDict(LEAF_SHAPES);

const MARGIN_IT = morphDict(LEAF_MARGINS, {
  entire: 'Intero',
  ciliate: 'Ciliato',
  crenate: 'Crenato',
  dentate: 'Dentato',
  serrate: 'Serrato',
  sinuate: 'Sinuato',
  undulate: 'Ondulato',
  spiny: 'Spinoso'
});

const MARGIN_EN = morphDict(LEAF_MARGINS);

const IT: Dict = {
  font: 'Carattere',
  faceSans: 'Sans',
  faceSerif: 'Serif',
  scale: 'Scala',
  tracking: 'Tracking',
  textAria: 'Testo specimen',
  shapesAria: 'Forma',
  marginsAria: 'Margine',
  reshuffle: 'Random',
  download: 'Download',
  downloadAria: 'Download',
  png: 'PNG',
  svg: 'SVG',
  pdf: 'PDF',
  otf: 'VF',
  otfBusy: 'VF…',
  otfStatic: 'OTF',
  otfStaticBusy: 'OTF…',
  growthPlay: 'Play crescita',
  growthPause: 'Pausa crescita',
  specimensAria: 'Specimen tipografici',
  about: 'About',
  aboutGenerator: 'Generatore',
  aboutLead: 'Marcovaldo is a WIP generative botanical type concept',
  brandHome: 'Torna al generatore',
  creditsFrom: 'Estratti da:',
  creditsAuthor: 'Calvino, I. (1963).',
  creditsTitle: 'Marcovaldo ovvero Le stagioni in città',
  creditsPub: 'Einaudi.',
  creditsMorph: 'Morfologia fogliare:',
  creditsMorphUrl: 'https://it.wikipedia.org/wiki/Foglia#Morfologia',
  creditsBy: 'Design + Development:',
  creditsType: 'Composto in:',
  fontMissing: 'Font non trovato',
  glyphMissing: 'Glifo non disponibile',
  typeHint: 'Scrivi…',
  points: 'punti',
  langSwitch: 'English',
  siteUrl: 'https://pasqualedesario.eu/#it',
  bootHint: 'Non aprire questo HTML come file. Avvia il server di sviluppo:',
  bootCmd: 'cd marcovaldo && npm run dev',
  bootOpen: 'Poi apri',
  params: {
    growth: 'Crescita'
  },
  shapes: SHAPE_IT,
  margins: MARGIN_IT,
  specimens: MARCOVALDO_SPECIMENS
};

const EN: Dict = {
  font: 'Typeface',
  faceSans: 'Sans',
  faceSerif: 'Serif',
  scale: 'Scale',
  tracking: 'Tracking',
  textAria: 'Specimen text',
  shapesAria: 'Shape',
  marginsAria: 'Margin',
  reshuffle: 'Random',
  download: 'Download',
  downloadAria: 'Download',
  png: 'PNG',
  svg: 'SVG',
  pdf: 'PDF',
  otf: 'VF',
  otfBusy: 'VF…',
  otfStatic: 'OTF',
  otfStaticBusy: 'OTF…',
  growthPlay: 'Play growth',
  growthPause: 'Pause growth',
  specimensAria: 'Type specimens',
  about: 'About',
  aboutGenerator: 'Generator',
  aboutLead: 'Marcovaldo is a WIP generative botanical type concept',
  brandHome: 'Back to generator',
  creditsFrom: 'Excerpts from:',
  creditsAuthor: 'Calvino, I. (1963).',
  creditsTitle: 'Marcovaldo, or The Seasons in the City',
  creditsPub: 'Einaudi.',
  creditsMorph: 'Leaf morphology:',
  creditsMorphUrl: 'https://en.wikipedia.org/wiki/Leaf_shape',
  creditsBy: 'Design + Development:',
  creditsType: 'Typeset in:',
  fontMissing: 'Font not found',
  glyphMissing: 'Glyph unavailable',
  typeHint: 'Type…',
  points: 'points',
  langSwitch: 'Italiano',
  siteUrl: 'https://pasqualedesario.eu/?lang=en',
  bootHint: 'Do not open this HTML as a file. Start the dev server:',
  bootCmd: 'cd marcovaldo && npm run dev',
  bootOpen: 'Then open',
  params: {
    growth: 'Growth'
  },
  shapes: SHAPE_EN,
  margins: MARGIN_EN,
  specimens: MARCOVALDO_SPECIMENS
};

const DICTS: Record<Lang, Dict> = { it: IT, en: EN };

let lang: Lang = (localStorage.getItem('mv-lang') as Lang) || 'it';

export function getLang(): Lang {
  return lang;
}

export function t(): Dict {
  return DICTS[lang];
}

export function setLang(next: Lang): void {
  lang = next;
  localStorage.setItem('mv-lang', next);
  document.documentElement.lang = next;
}

export function toggleLang(): Lang {
  setLang(lang === 'it' ? 'en' : 'it');
  return lang;
}

/** All localized morphology labels (detect still-default specimen text). */
export function allMorphLabels(): string[] {
  const out: string[] = [];
  for (const dict of Object.values(DICTS)) {
    for (const map of [dict.shapes, dict.margins]) {
      for (const label of Object.values(map)) out.push(label);
    }
  }
  return out;
}
