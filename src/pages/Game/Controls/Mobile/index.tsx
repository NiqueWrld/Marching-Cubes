import { useEffect, useRef } from 'react';

/** Shared input state polled by main.ts each frame */
export const mobileInput = {
    forward: 0,   // -1 to 1
    strafe: 0,    // -1 to 1
    jump: false,
    lookDx: 0,
    lookDy: 0,
    sprint: false,
};

const DEAD_ZONE = 8;
const MAX_RADIUS = 48;

export default function MobileControls() {
    const joystickAreaRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const lookAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const joystickArea = joystickAreaRef.current!;
        const knob = knobRef.current!;
        const lookArea = lookAreaRef.current!;

        // ── Joystick (movement) ─────────────────────────────────────────────
        let joyId: number | null = null;
        let joyOrigin = { x: 0, y: 0 };

        function onJoyStart(e: TouchEvent) {
            e.preventDefault();
            const t = e.changedTouches[0];
            joyId = t.identifier;
            const rect = joystickArea.getBoundingClientRect();
            joyOrigin = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }

        function onJoyMove(e: TouchEvent) {
            e.preventDefault();
            if (joyId === null) return;
            for (const t of Array.from(e.changedTouches)) {
                if (t.identifier !== joyId) continue;
                let dx = t.clientX - joyOrigin.x;
                let dy = t.clientY - joyOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > MAX_RADIUS) {
                    dx = (dx / dist) * MAX_RADIUS;
                    dy = (dy / dist) * MAX_RADIUS;
                }
                knob.style.transform = `translate(${dx}px, ${dy}px)`;
                const norm = Math.max(dist, DEAD_ZONE);
                mobileInput.strafe  = Math.abs(dx) > DEAD_ZONE ? dx / MAX_RADIUS : 0;
                mobileInput.forward = Math.abs(dy) > DEAD_ZONE ? -(dy / MAX_RADIUS) : 0;
                mobileInput.sprint  = dist > MAX_RADIUS * 0.85;
            }
        }

        function onJoyEnd(e: TouchEvent) {
            for (const t of Array.from(e.changedTouches)) {
                if (t.identifier !== joyId) continue;
                joyId = null;
                knob.style.transform = 'translate(0,0)';
                mobileInput.forward = 0;
                mobileInput.strafe  = 0;
                mobileInput.sprint  = false;
            }
        }

        joystickArea.addEventListener('touchstart', onJoyStart, { passive: false });
        joystickArea.addEventListener('touchmove',  onJoyMove,  { passive: false });
        joystickArea.addEventListener('touchend',   onJoyEnd,   { passive: false });
        joystickArea.addEventListener('touchcancel',onJoyEnd,   { passive: false });

        // ── Look area (camera) ──────────────────────────────────────────────
        let lookId: number | null = null;
        let lastLook = { x: 0, y: 0 };

        function onLookStart(e: TouchEvent) {
            e.preventDefault();
            const t = e.changedTouches[0];
            lookId = t.identifier;
            lastLook = { x: t.clientX, y: t.clientY };
        }

        function onLookMove(e: TouchEvent) {
            e.preventDefault();
            if (lookId === null) return;
            for (const t of Array.from(e.changedTouches)) {
                if (t.identifier !== lookId) continue;
                mobileInput.lookDx = t.clientX - lastLook.x;
                mobileInput.lookDy = t.clientY - lastLook.y;
                lastLook = { x: t.clientX, y: t.clientY };
            }
        }

        function onLookEnd(e: TouchEvent) {
            for (const t of Array.from(e.changedTouches)) {
                if (t.identifier !== lookId) continue;
                lookId = null;
                mobileInput.lookDx = 0;
                mobileInput.lookDy = 0;
            }
        }

        // Reset look deltas every frame so they don't accumulate
        let raf: number;
        function resetLook() {
            if (lookId === null) {
                mobileInput.lookDx = 0;
                mobileInput.lookDy = 0;
            }
            raf = requestAnimationFrame(resetLook);
        }
        raf = requestAnimationFrame(resetLook);

        lookArea.addEventListener('touchstart', onLookStart, { passive: false });
        lookArea.addEventListener('touchmove',  onLookMove,  { passive: false });
        lookArea.addEventListener('touchend',   onLookEnd,   { passive: false });
        lookArea.addEventListener('touchcancel',onLookEnd,   { passive: false });

        return () => {
            cancelAnimationFrame(raf);
            joystickArea.removeEventListener('touchstart', onJoyStart);
            joystickArea.removeEventListener('touchmove',  onJoyMove);
            joystickArea.removeEventListener('touchend',   onJoyEnd);
            joystickArea.removeEventListener('touchcancel',onJoyEnd);
            lookArea.removeEventListener('touchstart', onLookStart);
            lookArea.removeEventListener('touchmove',  onLookMove);
            lookArea.removeEventListener('touchend',   onLookEnd);
            lookArea.removeEventListener('touchcancel',onLookEnd);
        };
    }, []);

    function onJumpStart() { mobileInput.jump = true; }
    function onJumpEnd()   { mobileInput.jump = false; }

    return (
        <div
            className="fixed inset-0 pointer-events-none select-none z-10"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingRight: 'env(safe-area-inset-right)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                paddingLeft: 'env(safe-area-inset-left)',
            }}
        >
            {/* Left – joystick */}
            <div className="absolute bottom-10 left-10 pointer-events-auto">
                <div
                    ref={joystickAreaRef}
                    className="relative w-28 h-28 rounded-full bg-white/10 border border-white/20 flex items-center justify-center touch-none"
                >
                    <div
                        ref={knobRef}
                        className="w-12 h-12 rounded-full bg-white/40 border border-white/60 transition-none"
                        style={{ willChange: 'transform' }}
                    />
                </div>
            </div>

            {/* Right – look area */}
            <div
                ref={lookAreaRef}
                className="absolute bottom-0 right-0 w-1/2 h-full pointer-events-auto touch-none"
            />

            {/* Jump button */}
            <div className="absolute bottom-10 right-10 pointer-events-auto">
                <button
                    onTouchStart={onJumpStart}
                    onTouchEnd={onJumpEnd}
                    onTouchCancel={onJumpEnd}
                    className="w-16 h-16 rounded-full bg-blue-500/60 border border-blue-300/60 text-white text-sm font-bold active:bg-blue-400/80 touch-none"
                >
                    JUMP
                </button>
            </div>
        </div>
    );
}
