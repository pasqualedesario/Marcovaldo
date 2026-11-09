import catalog from './typefaces.json';

export type FaceId = keyof typeof catalog.faces;

type FaceDef = {
  id: FaceId;
  label: string;
  family: string;
  file: string;
  woff2: string;
  weight: number;
};

export const TYPEFACES_URL = catalog.url;
export const DEFAULT_FACE = catalog.defaultFace as FaceId;
export const FACE_IDS = Object.keys(catalog.faces) as FaceId[];

const FACES: Record<FaceId, FaceDef> = catalog.faces as Record<FaceId, FaceDef>;

export function isFaceId(id: string): id is FaceId {
  return id in FACES;
}

export function faceDef(id: FaceId = DEFAULT_FACE): FaceDef {
  return FACES[isFaceId(id) ? id : DEFAULT_FACE];
}

/** Absolute asset URL under the Vite base. */
export function faceAssetUrl(rel: string, base = import.meta.env.BASE_URL): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${rel.replace(/^\//, '')}`;
}
