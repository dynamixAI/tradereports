import { useEffect, useRef, useState } from 'react';
import { EXAMPLE_FEATURES, formatValue } from '../features';

const FLIP_EVERY = 2600; // ms between results
const TURN = 450; // ms for half a flip
const TILT = 22; // degrees the card leans
const SLIDE = 150; // px it moves between left and right

// counts up from 0 to the target, like a meter
function useRolling(target: number, calm: boolean): number {
  const [shown, setShown] = useState(calm ? target : 0);
  useEffect(() => {
    if (calm) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setShown(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, calm]);
  return shown;
}

// one example result at a time, flipping and tilting left then right
export function FlipCard({ calm }: { calm: boolean }) {
  const [at, setAt] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const feature = EXAMPLE_FEATURES[at] ?? { label: '', value: 0, money: false };
  const shown = useRolling(feature.value, calm);

  useEffect(() => {
    if (calm) {
      card.current?.style.removeProperty('transform');
      return;
    }
    let side = 1;
    let timer = 0;
    // how far the card slides sideways; none on narrow screens
    const shift = () => ((card.current?.parentElement?.clientWidth ?? 0) > 600 ? SLIDE : 0);
    const place = (deg: number, x: number, animate: boolean) => {
      const el = card.current;
      if (!el) return;
      el.style.transition = animate ? '' : 'none';
      el.style.transform = `perspective(700px) translateX(${x}px) rotateY(${deg}deg) rotateX(6deg)`;
    };
    const flip = () => {
      // turn edge-on, swap the result, then land on the other side, tilted the other way
      const from = side > 0 ? 0 : shift();
      const to = side > 0 ? shift() : 0;
      place(side > 0 ? 90 : -90, (from + to) / 2, true);
      timer = window.setTimeout(() => {
        setAt((i) => (i + 1) % EXAMPLE_FEATURES.length);
        place(side > 0 ? -90 : 90, (from + to) / 2, false);
        void card.current?.offsetWidth;
        place(side > 0 ? TILT : -TILT, to, true);
        side = -side;
      }, TURN);
    };
    const every = window.setInterval(flip, FLIP_EVERY);
    return () => {
      clearInterval(every);
      clearTimeout(timer);
    };
  }, [calm]);

  return (
    <div className="flip" ref={card} aria-label="Example results the tool gives">
      <span className="eg">Example</span>
      <small>{feature.label}</small>
      <b>{formatValue(shown, feature.money)}</b>
      <div className="dots" aria-hidden="true">
        {EXAMPLE_FEATURES.map((f, i) => (
          <i key={f.label} className={i === at ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
