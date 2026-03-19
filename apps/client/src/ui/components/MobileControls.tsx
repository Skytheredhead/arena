import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

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
  const length = Math.hypot(dx, dy);
  if (length <= STICK_RADIUS || length === 0) {
    return { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
  }

  const scale = STICK_RADIUS / length;
  return { x: (dx * scale) / STICK_RADIUS, y: (dy * scale) / STICK_RADIUS };
};

const stickBaseStyle = (side: 'left' | 'right'): CSSProperties => ({
  position: 'absolute',
  bottom: '26px',
  [side]: '24px',
  width: '108px',
  height: '108px',
  borderRadius: '999px',
  border: '1px solid rgba(255,255,255,0.16)',
  background:
    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12), rgba(4,10,18,0.42) 62%, rgba(4,10,18,0.72))',
  boxShadow: '0 10px 28px rgba(0,0,0,0.28), inset 0 0 24px rgba(255,255,255,0.08)',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none'
});

const thumbStyle = (state: JoystickState): CSSProperties => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '44px',
  height: '44px',
  borderRadius: '999px',
  transform: `translate(calc(-50% + ${state.x * STICK_RADIUS}px), calc(-50% + ${state.y * STICK_RADIUS}px))`,
  background:
    'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(255,90,90,0.9) 44%, rgba(120,0,0,0.92))',
  boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
});

export function MobileControls({
  visible,
  portrait,
  onMoveChange,
  onLookChange,
  onFireChange
}: MobileControlsProps): React.JSX.Element | null {
  const [moveStick, setMoveStick] = useState<JoystickState>({
    active: false,
    pointerId: null,
    x: 0,
    y: 0
  });
  const [lookStick, setLookStick] = useState<JoystickState>({
    active: false,
    pointerId: null,
    x: 0,
    y: 0
  });
  const moveRef = useRef<HTMLDivElement | null>(null);
  const lookRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible || portrait) {
      onMoveChange(0, 0);
      onLookChange(0, 0);
      onFireChange(false);
      setMoveStick({ active: false, pointerId: null, x: 0, y: 0 });
      setLookStick({ active: false, pointerId: null, x: 0, y: 0 });
    }
  }, [onFireChange, onLookChange, onMoveChange, portrait, visible]);

  const updateStick = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      element: HTMLDivElement | null,
      setState: React.Dispatch<React.SetStateAction<JoystickState>>,
      onChange: (x: number, y: number) => void
    ) => {
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const normalized = clampStick(dx, dy);
      setState(state => ({
        ...state,
        x: normalized.x,
        y: normalized.y
      }));
      onChange(normalized.x, normalized.y);
    },
    []
  );

  const beginMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setMoveStick({ active: true, pointerId: event.pointerId, x: 0, y: 0 });
      updateStick(event, moveRef.current, setMoveStick, (x, y) => onMoveChange(x, -y));
    },
    [onMoveChange, updateStick]
  );

  const beginLook = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setLookStick({ active: true, pointerId: event.pointerId, x: 0, y: 0 });
      updateStick(event, lookRef.current, setLookStick, (x, y) => onLookChange(x, y));
    },
    [onLookChange, updateStick]
  );

  const movePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!moveStick.active || moveStick.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      updateStick(event, moveRef.current, setMoveStick, (x, y) => onMoveChange(x, -y));
    },
    [moveStick.active, moveStick.pointerId, onMoveChange, updateStick]
  );

  const lookPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!lookStick.active || lookStick.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      updateStick(event, lookRef.current, setLookStick, (x, y) => onLookChange(x, y));
    },
    [lookStick.active, lookStick.pointerId, onLookChange, updateStick]
  );

  const endMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (moveStick.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      setMoveStick({ active: false, pointerId: null, x: 0, y: 0 });
      onMoveChange(0, 0);
    },
    [moveStick.pointerId, onMoveChange]
  );

  const endLook = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (lookStick.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      setLookStick({ active: false, pointerId: null, x: 0, y: 0 });
      onLookChange(0, 0);
    },
    [lookStick.pointerId, onLookChange]
  );

  if (!visible) {
    return null;
  }

  return (
    <>
      {portrait ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 35,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2,8,16,0.82)',
            backdropFilter: 'blur(10px)',
            color: '#f8d4d4',
            fontFamily: "'Rajdhani',sans-serif",
            fontSize: '28px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: '24px'
          }}
        >
          Rotate your phone sideways
        </div>
      ) : null}
      {!portrait ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
          <div
            ref={moveRef}
            style={{ ...stickBaseStyle('left'), pointerEvents: 'auto' }}
            onPointerDown={beginMove}
            onPointerMove={movePointer}
            onPointerUp={endMove}
            onPointerCancel={endMove}
          >
            <div style={thumbStyle(moveStick)} />
          </div>
          <button
            type="button"
            style={{
              position: 'absolute',
              right: '38px',
              bottom: '152px',
              width: '84px',
              height: '84px',
              borderRadius: '999px',
              border: '1px solid rgba(255,110,110,0.5)',
              background:
                'radial-gradient(circle at 35% 35%, rgba(255,220,220,0.96), rgba(255,78,78,0.95) 40%, rgba(120,8,8,0.96))',
              color: '#fff5f5',
              fontFamily: "'Rajdhani',sans-serif",
              fontSize: '24px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
              pointerEvents: 'auto',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            onPointerDown={event => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onFireChange(true);
            }}
            onPointerUp={event => {
              event.preventDefault();
              onFireChange(false);
            }}
            onPointerCancel={event => {
              event.preventDefault();
              onFireChange(false);
            }}
          >
            Fire
          </button>
          <div
            ref={lookRef}
            style={{ ...stickBaseStyle('right'), pointerEvents: 'auto' }}
            onPointerDown={beginLook}
            onPointerMove={lookPointer}
            onPointerUp={endLook}
            onPointerCancel={endLook}
          >
            <div style={thumbStyle(lookStick)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
