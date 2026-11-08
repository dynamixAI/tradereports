import { useEffect, useRef, useState } from 'react';
import { startMachine, type MachineHandle } from './machine';

// canvas for the 3D machine; shows nothing if the device can't do 3D
export default function Machine({ dark, calm }: { dark: boolean; calm: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<MachineHandle | null>(null);
  const [failed, setFailed] = useState(false);

  // start again whenever motion is switched on or off; the theme effect keeps colours in step
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const h = startMachine(el, { dark, calm });
    if (!h) {
      setFailed(true);
      return;
    }
    handle.current = h;
    return () => {
      h.stop();
      handle.current = null;
    };
  }, [calm]);

  useEffect(() => {
    handle.current?.setDark(dark);
  }, [dark]);

  if (failed) return null;
  return <canvas ref={canvas} className="stage" aria-hidden="true" />;
}
