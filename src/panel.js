/**
 * The panel of sliders: the sea, the sky and the view, each a few presets
 * and the sliders under them. `createPanel(root, sections, onChange)` builds
 * it into `root`; `onChange(key, value)` hears every change, a slider's as it
 * is dragged; `set(values)` moves the sliders (a preset does) without
 * calling back.
 *
 * A section is { title, presets: [[label, onPick]], sliders: [{ key, label,
 * min, max, step, value, show(v) }], toggles: [{ key, label, value }] }.
 */
export function createPanel(root, sections, onChange) {
  const inputs = new Map(), outputs = new Map(), shows = new Map(), chips = new Map();

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const head = el('button', 'panel-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'true');
  head.append(el('span', 'panel-title', 'Sea & sky'), el('span', 'panel-caret', '▾'));
  const body = el('div', 'panel-body');
  head.addEventListener('click', () => {
    const open = root.classList.toggle('closed') === false;
    head.setAttribute('aria-expanded', String(open));
  });
  root.append(head, body);

  for (const section of sections) {
    const box = el('section', 'panel-section');
    box.append(el('h2', null, section.title));
    if (section.presets) {
      const row = el('div', 'chips');
      for (const [label, pick] of section.presets) {
        const chip = el('button', 'chip', label);
        chip.type = 'button';
        chip.addEventListener('click', () => {
          for (const c of row.children) c.classList.toggle('on', c === chip);
          pick();
        });
        chips.set(`${section.title}:${label}`, chip);
        row.append(chip);
      }
      box.append(row);
    }
    for (const s of section.sliders ?? []) {
      const id = `slider-${s.key}`;
      const line = el('div', 'slider');
      const label = el('label', null, s.label);
      label.htmlFor = id;
      const out = el('output');
      out.htmlFor = id;
      const input = el('input');
      Object.assign(input, { type: 'range', id, min: s.min, max: s.max, step: s.step ?? 'any', value: s.value });
      const show = s.show ?? ((v) => v.toFixed(2));
      out.textContent = show(Number(s.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = show(v);
        // A slider moved by hand is no longer the preset.
        for (const c of box.querySelectorAll('.chip')) c.classList.remove('on');
        onChange(s.key, v);
      });
      line.append(label, out, input);
      box.append(line);
      inputs.set(s.key, input);
      outputs.set(s.key, out);
      shows.set(s.key, show);
    }
    for (const t of section.toggles ?? []) {
      const line = el('label', 'toggle');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = t.value;
      input.addEventListener('change', () => onChange(t.key, input.checked));
      line.append(input, el('span', null, t.label));
      box.append(line);
      inputs.set(t.key, input);
    }
    body.append(box);
  }

  // The arrow keys move a focused slider; they shouldn't also paddle the float.
  root.addEventListener('keydown', (e) => e.stopPropagation());
  root.addEventListener('keyup', (e) => e.stopPropagation());

  return {
    set(values) {
      for (const [key, v] of Object.entries(values)) {
        const input = inputs.get(key);
        if (!input) continue;
        if (input.type === 'checkbox') input.checked = Boolean(v);
        else {
          input.value = v;
          outputs.get(key).textContent = shows.get(key)(Number(v));
        }
      }
    },
    /** Lights the chip `label` in section `title`, and no other there. */
    choose(title, label) {
      for (const [key, chip] of chips) if (key.startsWith(`${title}:`)) chip.classList.toggle('on', key === `${title}:${label}`);
    },
  };
}
