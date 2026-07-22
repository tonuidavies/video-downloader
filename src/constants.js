// ==========================================
// Central configuration, theme and ad units.
// ==========================================
import { Dimensions, Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

export const { width: SCREEN_W } = Dimensions.get('window');

// Layout
export const H_PAD = 20;
export const GRID_GAP = 14;
export const CARD_W = (SCREEN_W - H_PAD * 2 - GRID_GAP) / 2;

// Backend defaults (editable in Settings)
export const DEFAULT_HOST = '192.168.100.12';
export const DEFAULT_PORT = '8080';
export const buildApiUrl = (host, port) => `http://${host}:${port}/api/v1/extract`;

// Replace with a real, publicly reachable privacy policy before publishing.
export const PRIVACY_POLICY_URL = 'https://example.com/privacy';

// Ad pacing
export const INTERSTITIAL_EVERY = 2; // show an interstitial on every Nth download
export const LIB_AD_EVERY_ROWS = 3; // in-feed banner after every N library rows

// Persistence keys
export const STORAGE_KEYS = {
	consent: '@vd_consent_v1',
	gallery: '@vd_gallery_v1',
	host: '@vd_host',
	port: '@vd_port',
	recent: '@vd_recent',
};

// AdMob unit IDs — TEST ids in development, your real unit ids in production.
export const INTERSTITIAL_AD_UNIT_ID = __DEV__
	? TestIds.INTERSTITIAL
	: Platform.OS === 'ios'
		? 'ca-app-pub-5117316644857484/4813266605'
		: 'ca-app-pub-5117316644857484/7842966656';

export const BANNER_AD_UNIT_ID = __DEV__
	? TestIds.BANNER
	: Platform.OS === 'ios'
		? 'ca-app-pub-5117316644857484/1234567890'
		: 'ca-app-pub-5117316644857484/0987654321';

export const APP_NAME = 'Video Downloader';

export const SUPPORTED_PLATFORMS = [
	'TikTok',
	'Instagram',
	'Facebook',
	'Twitter / X',
	'Reddit',
];

export const DISCLAIMER =
	'This app helps you save media that you own or have explicit permission to ' +
	'download. You are solely responsible for complying with the Terms of Service ' +
	'of each website and with all applicable copyright laws. Do not download or ' +
	'redistribute content you do not have the rights to.';

// ==========================================
// Design system
// ==========================================
export const COLORS = {
	background: '#0d0d0f',
	surface: '#1a1a1f',
	surfaceHighlight: '#26262d',
	glassBg: 'rgba(30, 30, 34, 0.65)',
	primary: '#ecb2ff',
	primaryContainer: '#bd00ff',
	secondary: '#ff24e4',
	tertiary: '#00dbe9',
	success: '#22c55e',
	danger: '#ff5a76',
	textMain: '#ffffff',
	textDim: '#a39ca6',
	border: 'rgba(255, 255, 255, 0.06)',
};
