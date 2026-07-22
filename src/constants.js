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

// The privacy policy is displayed in-app from local text (PRIVACY_POLICY_TEXT below) —
// no website needed. Edit that text to match your details before publishing.

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

// In-app privacy policy (shown locally, not linked to a website).
// Edit the contact line and any specifics before publishing.
export const PRIVACY_POLICY_TEXT = `${APP_NAME} — Privacy Policy

Last updated: 2026

1. Overview
${APP_NAME} is a personal media tool. It is designed to store as little
information as possible and to keep your data on your own device.

2. Information we store on your device
• Links you fetch and the media files you choose to save.
• Your app settings (server address, consent status).
This information is stored locally on your device and is not uploaded to us.
Removing an item, or uninstalling the app, deletes it.

3. Permissions
• Media/Storage: used only to save the files you choose to download into your
  gallery and to play them back.
• Network: used to contact the extraction server you configure and to download
  the media you request.

4. The extraction server
Links you fetch are sent to the server address configured in Settings so it can
locate the media. Point the app only at a server you trust.

5. Advertising
This app shows ads through Google AdMob. To serve ads, Google may collect and
process device identifiers and usage data in accordance with Google's own
privacy policy. Where required, the app requests non-personalized ads.

6. Content responsibility
${APP_NAME} does not host content. You are responsible for ensuring you have the
right to download and use any media you save, and for complying with the terms
of the sites you visit and with applicable copyright law.

7. Children
This app is not directed to children under 18.

8. Changes
We may update this policy; material changes will be reflected in the app.

9. Contact
Questions about this policy: your-email@example.com`;

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
