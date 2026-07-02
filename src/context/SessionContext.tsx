import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useDevice } from '../hooks/useDevice.js';
import type { DeviceSession } from '../hooks/useDevice.js';

interface SessionContextValue {
    /** Device session (fingerprint, role, device info), or null while registering. */
    session: DeviceSession | null;
    /** True until the device is registered and the role is claimed. */
    loading: boolean;
    /** Convenience: true when this device joined as a spectator. */
    isSpectator: boolean;
}

const SessionContext = createContext<SessionContextValue>({
    session: null,
    loading: true,
    isSpectator: false,
});

/**
 * Session manager — registers this device in Firestore and claims the
 * player/spectator role for the signed-in user (via useDevice), then makes
 * the result available to the whole app.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
    const session = useDevice();

    return (
        <SessionContext.Provider
            value={{
                session,
                loading: session === null,
                isSpectator: session?.role === 'spectator',
            }}
        >
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    return useContext(SessionContext);
}
