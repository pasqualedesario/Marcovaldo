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
  png: string;
  svg: string;
  pdf: string;
  otf: string;
  otfBusy: string;
  specimensAria: string;
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

const MARCOVALDO_SPECIMENS: ReadonlyArray<SpecimenBlock> = [
  {
    sizePt: 112,
    text: 'funghi,\nveri funghi'
  },
  {
    sizePt: 56,
    text: 'Il vento, venendo in città\nda lontano, le porta\ndoni inconsueti.'
  },
  {
    sizePt: 26,
    text:
      'Il vento, venendo in città da lontano, le porta doni inconsueti,\n' +
      'di cui s’accorgono solo poche anime sensibili,\n' +
      'come i raffreddati del fieno,\n' +
      'che starnutano per pollini di fiori d’altre terre.'
  },
  {
    sizePt: 24,
    text:
      'Aveva questo Marcovaldo un occhio poco adatto alla vita di città:\n' +
      'cartelli, semafori, vetrine, insegne luminose, manifesti,\n' +
      'per studiati che fossero a colpire l’attenzione,\n' +
      'mai fermavano il suo sguardo\n' +
      'che pareva scorrere sulle sabbie del deserto.'
  },
  {
    sizePt: 12,
    text:
      'Marcovaldo tornò a casa; la moglie gli diede il resto della paga settimanale\n' +
      'perché andasse a fare la spesa. Gli raccomandò: «Guarda che i prezzi\n' +
      'sono aumentati; non spendere più del dovuto!»'
  },
  {
    sizePt: 8,
    text:
      'La città di Marcovaldo era cinta di avvelenate croste: i muri delle case,\n' +
      'le lastre dei marciapiedi, i tubi delle grondaie e dei tram, le sbarre\n' +
      'e le ringhiere. Tra queste croste, a intervalli, spuntavano le piante,\n' +
      'non diverse, eppure diverse: polle di un’altra storia.'
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
  odd_pinnate: 'Imparipennata',
  palmate: 'Palmata',
  bipinnate: 'Bipennata'
});

const SHAPE_EN = morphDict(LEAF_SHAPES, {
  odd_pinnate: 'Odd-pinnate'
});

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
  png: '↓ PNG',
  svg: '↓ SVG',
  pdf: '↓ PDF',
  otf: '↓ OTF',
  otfBusy: 'OTF…',
  specimensAria: 'Specimen tipografici',
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
  png: '↓ PNG',
  svg: '↓ SVG',
  pdf: '↓ PDF',
  otf: '↓ OTF',
  otfBusy: 'OTF…',
  specimensAria: 'Type specimens',
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
