import type { FaceId } from '../lib/typefaces';
import { FACE_IDS, isFaceId } from '../lib/typefaces';

type Opts = {
  chip: HTMLElement;
  buttons: HTMLButtonElement[];
  getFace: () => FaceId;
  onChange: (face: FaceId) => void;
};

/** Sans / serif face toggle — desktop + mobile. */
export function mountFaceSwitch(opts: Opts): void {
  const { chip, buttons, getFace, onChange } = opts;

  const sync = () => {
    const current = getFace();
    for (const btn of buttons) {
      const id = btn.dataset.face ?? '';
      const on = isFaceId(id) && id === current;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    chip.dataset.face = current;
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
}
