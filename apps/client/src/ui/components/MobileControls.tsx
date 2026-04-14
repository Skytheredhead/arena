import { useCallback, useEffect, useRef, useState } from 'react';
import { CYBER } from '../cyberTheme';

interface JoystickState {
  active: boolean;
  pointerId: number | null;
  x: number;
  y: number;
}

interface MobileControlsProps {
  visible: boolean;
  portrait: boolean;
  onMoveChange: (moveX: number, moveZ: number) => void;
  onLookChange: (lookX: number, lookY: number) => void;
  onFireChange: (held: boolean) => void;
}

const STICK_RADIUS = 46;

const clampStick = (dx: number, dy: number): { x: number; y: number } => {
  const len = Math.hypot(dx, dy);
  if (len <= STICK_RADIUS || len === 0) return { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
  return { x: (dx / len), y: (dy / len) };
};

function StickBase({
  side,
  state,
  divRef,
  onDown,
  onMove,
  onUp,
}: {
  side: 'left' | 'right';
  state: JoystickState;
  divRef: React.RefObject<HTMLDivElement | null>;
  onDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUp:   (e: React.PointerEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  const active = state.active;
  return (
    <div
      ref={divRef}
      style={{
        position: 'absolute',
        bottom: '28px',
        [side]: '24px',
        width: '108px',
        height: '108px',
        borderRadius: '999px',
        border: `1px solid ${active ? CYBER.a : CYBER.border}`,
        background: active
          ? `radial-gradient(circle,${CYBER.a}18,${CYBER.bg}cc 70%)`
          : `radial-gradient(circle,rgba(0,245,255,0.06),${CYBER.bg}aa 70%)`,
        boxShadow: active
          ? `0 0 20px ${CYBER.a}44, inset 0 0 20px ${CYBER.a}11`
          : `0 0 8px ${CYBER.a}18, inset 0 0 8px rgba(0,0,0,0.4)`,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'border-color .15s, box-shadow .15s, background .15s',
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* Thumb */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '44px',
        height: '44px',
        borderRadius: '999px',
        transform: `translate(calc(-50% + ${state.x * STICK_RADIUS}px), calc(-50% + ${state.y * STICK_RADIUS}px))`,
        background: active
          ? `radial-gradient(circle at 35% 35%,${CYBER.textBright},${CYBER.a} 40%,${CYBER.a3}cc)`
          : `radial-gradient(circle at 35% 35%,${CYBER.textDim}cc,${CYBER.a}66 40%,${CYBER.a3}55)`,
        boxShadow: active
          ? `0 0 14px ${CYBER.a}88, 0 4px 12px rgba(0,0,0,0.4)`
          : `0 4px 12px rgba(0,0,0,0.3)`,
        transition: 'background .15s, box-shadow .15s',
      }} />

      {/* Corner tick marks */}
      {[0, 90, 180, 270].map(deg => (
        <div
          key={deg}
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '8px', height: '2px',
            background: CYBER.a,
            opacity: 0.35,
            transformOrigin: '-46px 50%',
            transform: `rotate(${deg}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function MobileControls({
  visible,
  portrait,
  onMoveChange,
  onLookChange,
  onFireChange,
}: MobileControlsProps): React.JSX.Element | null {
  const [moveStick, setMoveStick] = useState<JoystickState>({ active: false, pointerId: null, x: 0, y: 0 });
  const [lookStick, setLookStick] = useState<JoystickState>({ active: false, pointerId: null, x: 0, y: 0 });
  const [firing, setFiring] = useState(false);
  const moveRef = useRef<HTMLDivElement | null>(null);
  const lookRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible || portrait) {
      onMoveChange(0, 0);
      onLookChange(0, 0);
      onFireChange(false);
      setMoveStick({ active: false, pointerId: null, x: 0, y: 0 });
      setLookStick({ active: false, pointerId: null, x: 0, y: 0 });
      setFiring(false);
    }
  }, [onFireChange, onLookChange, onMoveChange, portrait, visible]);

  const updateStick = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    element: HTMLDivElement | null,
    setState: React.Dispatch<React.SetStateAction<JoystickState>>,
    onChange: (x: number, y: number) => void
  ) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const norm = clampStick(dx, dy);
    setState(s => ({ ...s, x: norm.x, y: norm.y }));
    onChange(norm.x, norm.y);
  }, []);

  const beginMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setMoveStick({ active: true, pointerId: e.pointerId, x: 0, y: 0 });
    updateStick(e, moveRef.current, setMoveStick, (x, y) => onMoveChange(x, -y));
  }, [onMoveChange, updateStick]);

  const beginLook = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setLookStick({ active: true, pointerId: e.pointerId, x: 0, y: 0 });
    updateStick(e, lookRef.current, setLookStick, (x, y) => onLookChange(x, y));
  }, [onLookChange, updateStick]);

  const movePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!moveStick.active || moveStick.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateStick(e, moveRef.current, setMoveStick, (x, y) => onMoveChange(x, -y));
  }, [moveStick.active, moveStick.pointerId, onMoveChange, updateStick]);

  const lookPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!lookStick.active || lookStick.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateStick(e, lookRef.current, setLookStick, (x, y) => onLookChange(x, y));
  }, [lookStick.active, lookStick.pointerId, onLookChange, updateStick]);

  const endMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (moveStick.pointerId !== e.pointerId) return;
    e.preventDefault();
    setMoveStick({ active: false, pointerId: null, x: 0, y: 0 });
    onMoveChange(0, 0);
  }, [moveStick.pointerId, onMoveChange]);

  const endLook = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookStick.pointerId !== e.pointerId) return;
    e.preventDefault();
    setLookStick({ active: false, pointerId: null, x: 0, y: 0 });
    onLookChange(0, 0);
  }, [lookStick.pointerId, onLookChange]);

  if (!visible) return null;

  return (
    <>
      {/* Portrait warning */}
      {portrait && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 35,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${CYBER.bg}ee`, backdropFilter: 'blur(10px)',
          flexDirection: 'column', gap: '16px',
          fontFamily: "'Orbitron',var(--font)",
          fontSize: '18px', letterSpacing: '3px',
          textTransform: 'uppercase', textAlign: 'center', padding: '24px',
          color: CYBER.textBright,
        }}>
          <div style={{
            fontSize: '40px',
            animation: 'cyberFloatY 2s ease-in-out infinite',
          }}>↻</div>
          <div style={{ color: CYBER.a, textShadow: `0 0 12px ${CYBER.a}` }}>
            Rotate Device
          </div>
          <div style={{ color: CYBER.textDim, fontSize: '10px', letterSpacing: '3px' }}>
            Landscape mode required
          </div>
        </div>
      )}

      {/* Landscape controls */}
      {!portrait && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
          {/* Move stick */}
          <StickBase
            side="left"
            state={moveStick}
            divRef={moveRef}
            onDown={beginMove}
            onMove={movePointer}
            onUp={endMove}
          />

          {/* Fire button */}
          <button
            type="button"
            style={{
              position: 'absolute',
              right: '40px', bottom: '158px',
              width: '84px', height: '84px',
              borderRadius: '999px',
              border: `1px solid ${firing ? CYBER.danger : `${CYBER.danger}77`}`,
              background: firing
                ? `radial-gradient(circle at 35% 35%,${CYBER.textBright},${CYBER.danger} 40%,rgba(80,0,16,0.96))`
                : `radial-gradient(circle at 35% 35%,rgba(255,80,80,0.9),rgba(200,20,44,0.9) 40%,rgba(50,0,10,0.96))`,
              boxShadow: firing
                ? `0 0 28px ${CYBER.danger}aa, inset 0 0 16px rgba(0,0,0,0.3)`
                : `0 0 12px ${CYBER.danger}44, inset 0 0 12px rgba(0,0,0,0.3)`,
              color: '#fff',
              fontFamily: "'Orbitron',var(--font)",
              fontSize: '12px', fontWeight: 700,
              letterSpacing: '1px', textTransform: 'uppercase',
              pointerEvents: 'auto', touchAction: 'none',
              userSelect: 'none', WebkitUserSelect: 'none',
              transition: 'box-shadow .1s, background .1s, border-color .1s',
              cursor: 'pointer',
            }}
            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setFiring(true); onFireChange(true); }}
            onPointerUp={e  => { e.preventDefault(); setFiring(false); onFireChange(false); }}
            onPointerCancel={e => { e.preventDefault(); setFiring(false); onFireChange(false); }}
          >
            FIRE
          </button>

          {/* Look stick */}
          <StickBase
            side="right"
            state={lookStick}
            divRef={lookRef}
            onDown={beginLook}
            onMove={lookPointer}
            onUp={endLook}
          />
        </div>
      )}
    </>
  );
}
