import type { FaceId } from '../lib/typefaces';
import { FACE_IDS, isFaceId } from '../lib/typefaces';

type Opts = {
  buttons: HTMLButtonElement[];
  getFace: () => FaceId;
  onChange: (face: FaceId) => void;
};

/** Sans / Serif as two independent chips. */
export function mountFaceChips(opts: Opts): { sync: () => void } {
  const { buttons, getFace, onChange } = opts;

  const sync = () => {
    const current = getFace();
    for (const btn of buttons) {
      const id = btn.dataset.face ?? '';
      const on = isFaceId(id) && id === current;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.face ?? '';
      if (!isFaceId(id) || id === getFace()) return;
      onChange(id);
      sync();
    });
  }

  if (!FACE_IDS.includes(getFace())) onChange(FACE_IDS[0]!);
  sync();
  return { sync };
}
