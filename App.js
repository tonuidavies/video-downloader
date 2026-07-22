// ==========================================
// Video Downloader — root orchestrator.
// ==========================================
import React, { useEffect, useState, useCallback } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	StyleSheet,
	Platform,
	Modal,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, APP_NAME, buildApiUrl } from './src/constants';
import {
	loadConsent,
	saveConsent,
	loadGallery,
	saveGallery,
	loadServer,
	saveServer,
} from './src/storage';
import { toast } from './src/toast';
import { AnchoredBanner } from './src/ui';
import ConsentGate from './src/ConsentGate';
import HomeScreen from './src/HomeScreen';
import LibraryScreen from './src/LibraryScreen';
import SettingsSheet from './src/SettingsSheet';
import PlayerModal from './src/PlayerModal';

const LOGO = require('./assets/icon.png');

export default function App() {
	const [ready, setReady] = useState(false);
	const [consented, setConsented] = useState(false);
	const [tab, setTab] = useState('HOME');

	const [host, setHost] = useState('');
	const [port, setPort] = useState('');
	const [showSettings, setShowSettings] = useState(false);

	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(null);

	// ---- boot ----
	useEffect(() => {
		(async () => {
			const [c, g, s] = await Promise.all([
				loadConsent(),
				loadGallery(),
				loadServer(),
			]);
			setConsented(c);
			setItems(g);
			setHost(s.host);
			setPort(s.port);
			setReady(true);
		})();
	}, []);

	const acceptConsent = useCallback(async () => {
		setConsented(true);
		await saveConsent();
	}, []);

	const addToGallery = useCallback((item) => {
		setItems((prev) => {
			const next = [item, ...prev];
			saveGallery(next);
			return next;
		});
	}, []);

	const removeItem = useCallback((item) => {
		setItems((prev) => {
			const next = prev.filter((d) => d.id !== item.id);
			saveGallery(next);
			return next;
		});
	}, []);

	const shareItem = useCallback(async (uri) => {
		if (!uri) return;
		try {
			if (await Sharing.isAvailableAsync())
				await Sharing.shareAsync(uri, { mimeType: 'video/*' });
			else toast('Sharing is not available.');
		} catch (e) {
			toast('Could not share this item.');
		}
	}, []);

	const saveSettingsHandler = useCallback(async (h, p) => {
		setHost(h);
		setPort(p);
		await saveServer(h, p);
		setShowSettings(false);
		toast('Server updated');
	}, []);

	// ---- render ----
	if (!ready) {
		return (
			<View style={[styles.container, styles.center]}>
				<ActivityIndicator
					color={COLORS.primary}
					size='large'
				/>
			</View>
		);
	}

	if (!consented) {
		return (
			<SafeAreaProvider>
				<ConsentGate
					logo={LOGO}
					onAccept={acceptConsent}
				/>
			</SafeAreaProvider>
		);
	}

	const apiUrl = buildApiUrl(host, port);

	return (
		<SafeAreaProvider>
			<SafeAreaView style={styles.container}>
				<StatusBar style='light' />

				<View style={styles.topNav}>
					<View style={styles.brand}>
						<MaterialIcons
							name='download'
							size={24}
							color={COLORS.primary}
						/>
						<Text style={styles.brandText}>{APP_NAME.toUpperCase()}</Text>
					</View>
					<TouchableOpacity onPress={() => setShowSettings(true)}>
						<MaterialIcons
							name='settings'
							size={24}
							color={COLORS.textDim}
						/>
					</TouchableOpacity>
				</View>

				<View style={{ flex: 1 }}>
					{tab === 'HOME' ? (
						<HomeScreen
							apiUrl={apiUrl}
							logo={LOGO}
							onSaved={addToGallery}
						/>
					) : (
						<LibraryScreen
							items={items}
							onOpenSettings={() => setShowSettings(true)}
							onOpen={setSelected}
							onShare={shareItem}
							onRemove={removeItem}
						/>
					)}
				</View>

				<AnchoredBanner />

				<View style={styles.bottomNav}>
					<TabButton
						icon='explore'
						label='Browse'
						active={tab === 'HOME'}
						onPress={() => setTab('HOME')}
					/>
					<TabButton
						icon='video-library'
						label='Library'
						active={tab === 'LIBRARY'}
						onPress={() => setTab('LIBRARY')}
					/>
				</View>

				<Modal
					visible={!!selected}
					animationType='slide'
					onRequestClose={() => setSelected(null)}>
					{selected && (
						<PlayerModal
							key={selected.id}
							item={selected}
							onClose={() => setSelected(null)}
							onShare={shareItem}
						/>
					)}
				</Modal>

				<SettingsSheet
					visible={showSettings}
					host={host}
					port={port}
					onClose={() => setShowSettings(false)}
					onSave={saveSettingsHandler}
				/>
			</SafeAreaView>
		</SafeAreaProvider>
	);
}

function TabButton({ icon, label, active, onPress }) {
	const color = active ? COLORS.primary : COLORS.textDim;
	return (
		<TouchableOpacity
			style={styles.tab}
			onPress={onPress}>
			<MaterialIcons
				name={icon}
				size={26}
				color={color}
			/>
			<Text style={[styles.tabLabel, { color }]}>{label}</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background },
	center: { justifyContent: 'center', alignItems: 'center' },
	topNav: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingVertical: 14,
		backgroundColor: COLORS.background,
		borderBottomWidth: 1,
		borderBottomColor: COLORS.border,
	},
	brand: { flexDirection: 'row', alignItems: 'center' },
	brandText: {
		fontSize: 17,
		fontWeight: '900',
		color: COLORS.textMain,
		letterSpacing: 1.5,
		marginLeft: 6,
	},
	bottomNav: {
		flexDirection: 'row',
		backgroundColor: COLORS.background,
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
		paddingVertical: 12,
		paddingBottom: Platform.OS === 'ios' ? 24 : 12,
	},
	tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	tabLabel: {
		fontSize: 11,
		marginTop: 6,
		fontWeight: '800',
		letterSpacing: 0.5,
	},
});
