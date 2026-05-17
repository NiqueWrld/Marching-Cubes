export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface Device {
    type: DeviceType;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isTouchScreen: boolean;
    screenWidth: number;
    screenHeight: number;
}
