import type { Device, DeviceType } from '../types/Device.js';

const ua = navigator.userAgent;
const isMobileUA = /Mobi|Android|iPhone/i.test(ua);
const isTabletUA  = /iPad|Android/i.test(ua) && !/Mobile/i.test(ua);

const type: DeviceType = isMobileUA ? 'mobile' : isTabletUA ? 'tablet' : 'desktop';

export const device: Device = {
    type,
    isMobile:      type === 'mobile',
    isTablet:      type === 'tablet',
    isDesktop:     type === 'desktop',
    isTouchScreen: navigator.maxTouchPoints > 0,
    screenWidth:   window.screen.width,
    screenHeight:  window.screen.height,
};

/** @deprecated use `device.isMobile` instead */
const isMobile = device.isMobile;
export default isMobile;
