// ==========================================
// Thin, crash-safe AsyncStorage wrapper.
// ==========================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, DEFAULT_HOST, DEFAULT_PORT } from './constants';

const getJSON = async (key, fallback) => {
	try {
		const raw = await AsyncStorage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch (e) {
		return fallback;
	}
};

const setJSON = async (key, value) => {
	try {
		await AsyncStorage.setItem(key, JSON.stringify(value));
	} catch (e) {}
};

export const loadConsent = async () => {
	try {
		return (await AsyncStorage.getItem(STORAGE_KEYS.consent)) === 'true';
	} catch (e) {
		return false;
	}
};
export const saveConsent = async () => {
	try {
		await AsyncStorage.setItem(STORAGE_KEYS.consent, 'true');
	} catch (e) {}
};

export const loadGallery = () => getJSON(STORAGE_KEYS.gallery, []);
export const saveGallery = (items) => setJSON(STORAGE_KEYS.gallery, items);

export const loadRecent = () => getJSON(STORAGE_KEYS.recent, []);
export const saveRecent = (links) => setJSON(STORAGE_KEYS.recent, links);

export const loadServer = async () => {
	try {
		const host = (await AsyncStorage.getItem(STORAGE_KEYS.host)) || DEFAULT_HOST;
		const port = (await AsyncStorage.getItem(STORAGE_KEYS.port)) || DEFAULT_PORT;
		return { host, port };
	} catch (e) {
		return { host: DEFAULT_HOST, port: DEFAULT_PORT };
	}
};
export const saveServer = async (host, port) => {
	try {
		await AsyncStorage.setItem(STORAGE_KEYS.host, host);
		await AsyncStorage.setItem(STORAGE_KEYS.port, port);
	} catch (e) {}
};
