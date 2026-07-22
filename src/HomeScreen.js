// ==========================================
// Browse: centered launcher → in-app browser with live video preview.
//   • Landing state: the Neon-style input box, centered, + clipboard prompt.
//   • Browser state: WebView that auto-detects media and previews it in a sheet.
// ==========================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
	Keyboard,
	Alert,
	AppState,
	Animated,
	FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import {
	getInfoAsync,
	deleteAsync,
	documentDirectory,
	createDownloadResumable,
} from 'expo-file-system/legacy';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { COLORS, APP_NAME, SUPPORTED_PLATFORMS } from './constants';
import {
	buildFormats,
	humanSize,
	extFor,
	qualityLabel,
	safeName,
	normalizeUrl,
	isHttpUrl,
	isYouTube,
	looksLikeSupportedLink,
} from './utils';
import { extractMedia } from './api';
import { useInterstitialGate } from './ads';
import { Logo, Thumb } from './ui';
import { toast } from './toast';

const MOBILE_UA =
	'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36';

export default function HomeScreen({ apiUrl, logo, onSaved }) {
	// null = landing launcher, string = browser is open on that URL
	const [browserUrl, setBrowserUrl] = useState(null);
	const [urlInput, setUrlInput] = useState('');
	const [clipSuggestion, setClipSuggestion] = useState(null);

	// extraction / preview
	const [fetching, setFetching] = useState(false);
	const [media, setMedia] = useState(null);
	const [showSheet, setShowSheet] = useState(false);
	const [ack, setAck] = useState(false);

	// download
	const [downloading, setDownloading] = useState(false);
	const [progress, setProgress] = useState(0);

	const lastExtractedUrl = useRef('');
	const lastClip = useRef('');
	const downloadRef = useRef(null);
	const cancelledRef = useRef(false);
	const slideAnim = useRef(new Animated.Value(600)).current;

	const { gate } = useInterstitialGate();

	// ---- clipboard detection ----
	useEffect(() => {
		checkClipboard();
		const sub = AppState.addEventListener('change', (s) => {
			if (s === 'active') checkClipboard();
		});
		return () => sub.remove();
	}, []);

	const checkClipboard = async () => {
		try {
			const text = (await Clipboard.getStringAsync())?.trim();
			if (!text || text === lastClip.current) return;
			if (looksLikeSupportedLink(text) && text !== browserUrl) {
				lastClip.current = text;
				setClipSuggestion(text);
			}
		} catch (e) {}
	};

	useEffect(() => {
		Animated.spring(slideAnim, {
			toValue: showSheet ? 0 : 600,
			friction: 9,
			tension: 55,
			useNativeDriver: true,
		}).start();
	}, [showSheet]);

	// ---- open / navigate the browser ----
	const openBrowser = useCallback((raw) => {
		const url = normalizeUrl(raw);
		if (!isHttpUrl(url)) return toast('Paste a valid link first.');
		Keyboard.dismiss();
		lastExtractedUrl.current = '';
		setMedia(null);
		setShowSheet(false);
		setAck(false);
		setUrlInput(url);
		setClipSuggestion(null);
		setBrowserUrl(url);
	}, []);

	const goLanding = () => {
		setBrowserUrl(null);
		setMedia(null);
		setShowSheet(false);
	};

	const pasteIntoInput = async () => {
		try {
			const text = (await Clipboard.getStringAsync())?.trim();
			if (!text) return toast('Clipboard is empty.');
			setUrlInput(text);
		} catch (e) {
			toast('Could not read clipboard.');
		}
	};

	// ---- extraction ----
	const triggerExtraction = useCallback(
		async (targetUrl, { manual = false } = {}) => {
			if (!targetUrl || targetUrl.startsWith('about:')) return;
			if (isYouTube(targetUrl)) {
				if (manual) toast('YouTube is not supported.');
				return;
			}
			if (!manual && targetUrl === lastExtractedUrl.current) return;

			lastExtractedUrl.current = targetUrl;
			setFetching(true);
			if (manual) {
				setMedia(null);
				setShowSheet(false);
			}
			try {
				const raw = await extractMedia(apiUrl, targetUrl);
				const formats = buildFormats(raw);
				if (!formats.length) {
					if (manual) toast('No downloadable media found on this page.');
					setMedia(null);
					return;
				}
				setAck(false);
				setMedia({ ...raw, formats });
				if (manual) setShowSheet(true);
				toast(`Media ready — ${formats.length} option${formats.length > 1 ? 's' : ''}`);
			} catch (e) {
				if (manual) toast(e.message || 'Could not find media here.');
			} finally {
				setFetching(false);
			}
		},
		[apiUrl],
	);

	// ---- download ----
	const onPick = (fmt) => {
		if (downloading) return;
		if (!ack) return toast('Please confirm you have the right to download.');
		gate(() => runDownload(fmt));
	};

	const runDownload = async (fmt) => {
		try {
			const perm = await MediaLibrary.requestPermissionsAsync();
			if (perm.status !== 'granted') {
				Alert.alert(
					'Permission needed',
					'Allow media access so downloads can be saved to your gallery.',
				);
				return;
			}
		} catch (e) {
			Alert.alert('Permission error', e.message);
			return;
		}

		cancelledRef.current = false;
		setDownloading(true);
		setProgress(0);

		const ext = extFor(fmt);
		const isImage = ext === 'jpg';
		const fileUri = `${documentDirectory}${safeName(media?.title)}_${Date.now()}.${ext}`;

		try {
			const existing = await getInfoAsync(fileUri);
			if (existing.exists) await deleteAsync(fileUri, { idempotent: true });

			downloadRef.current = createDownloadResumable(fmt.url, fileUri, {}, (p) => {
				if (p.totalBytesExpectedToWrite > 0)
					setProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
			});

			const result = await downloadRef.current.downloadAsync();
			if (cancelledRef.current || !result) return;

			const localUri = result.uri;
			const info = await getInfoAsync(localUri, { size: true });
			if (!info.exists || (info.size != null && info.size < 10000)) {
				await deleteAsync(localUri, { idempotent: true });
				Alert.alert(
					'Download failed',
					'The server returned an invalid or empty file. The link may have expired — reload the page and try again.',
				);
				return;
			}

			try {
				const asset = await MediaLibrary.createAssetAsync(localUri);
				const album = await MediaLibrary.getAlbumAsync(APP_NAME);
				if (!album) await MediaLibrary.createAlbumAsync(APP_NAME, asset, false);
				else await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
			} catch (e) {}

			onSaved({
				id: Date.now().toString(),
				title: media?.title || 'Saved media',
				thumbnail: media?.thumbnail || null,
				uri: localUri,
				type: isImage ? 'image' : 'video',
				date: new Date().toLocaleDateString(),
				bytes: info.size || 0,
				size: humanSize(info.size) || '—',
			});

			try {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			} catch (e) {}
			toast('Saved to your library');
			setShowSheet(false);
		} catch (e) {
			if (!cancelledRef.current)
				Alert.alert('Download failed', e.message || 'Unknown error');
		} finally {
			downloadRef.current = null;
			setDownloading(false);
			setProgress(0);
		}
	};

	const cancelDownload = async () => {
		cancelledRef.current = true;
		try {
			if (downloadRef.current) await downloadRef.current.pauseAsync();
		} catch (e) {}
		setDownloading(false);
		setProgress(0);
		toast('Download cancelled');
	};

	// ---- the shared input box (exact Neon address bar) ----
	const AddressBar = ({ leading }) => (
		<View style={styles.addressBar}>
			{leading}
			<TextInput
				style={styles.addressInput}
				placeholder='Search or paste a link…'
				placeholderTextColor={COLORS.textDim}
				value={urlInput}
				onChangeText={setUrlInput}
				onSubmitEditing={() => urlInput && openBrowser(urlInput)}
				autoCapitalize='none'
				autoCorrect={false}
				returnKeyType='go'
			/>
			{urlInput.length > 0 ? (
				<View style={styles.addressActions}>
					<TouchableOpacity onPress={() => setUrlInput('')} style={styles.clearBtn}>
						<MaterialIcons name='close' size={20} color={COLORS.textDim} />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => openBrowser(urlInput)}
						style={styles.goBtn}>
						<MaterialIcons name='arrow-forward' size={20} color='#fff' />
					</TouchableOpacity>
				</View>
			) : (
				<TouchableOpacity onPress={pasteIntoInput} style={styles.pasteBtn}>
					<MaterialIcons name='content-paste' size={18} color={COLORS.primary} />
					<Text style={styles.pasteText}>Paste</Text>
				</TouchableOpacity>
			)}
		</View>
	);

	// =====================================================================
	// LANDING (centered launcher)
	// =====================================================================
	if (!browserUrl) {
		return (
			<ScrollView
				style={styles.container}
				contentContainerStyle={styles.landing}
				keyboardShouldPersistTaps='handled'
				showsVerticalScrollIndicator={false}>
				<Logo source={logo} size={82} />
				<Text style={styles.title}>{APP_NAME}</Text>
				<Text style={styles.subtitle}>
					Paste a link or type a site to preview and save video
				</Text>

				<AddressBar
					leading={
						<MaterialIcons
							name='public'
							size={22}
							color={COLORS.primary}
							style={{ marginLeft: 15 }}
						/>
					}
				/>

				{/* Clipboard prompt — "you copied a link, open it?" */}
				{clipSuggestion && (
					<TouchableOpacity
						activeOpacity={0.9}
						style={styles.clipCard}
						onPress={() => openBrowser(clipSuggestion)}>
						<MaterialIcons name='content-paste-go' size={20} color={COLORS.tertiary} />
						<View style={{ flex: 1, marginHorizontal: 10 }}>
							<Text style={styles.clipTitle}>Open copied link?</Text>
							<Text style={styles.clipUrl} numberOfLines={1}>
								{clipSuggestion.replace(/^https?:\/\//, '')}
							</Text>
						</View>
						<View style={styles.clipOpenBtn}>
							<Text style={styles.clipOpenText}>Open</Text>
						</View>
						<TouchableOpacity
							onPress={() => setClipSuggestion(null)}
							hitSlop={10}
							style={{ marginLeft: 4 }}>
							<MaterialIcons name='close' size={18} color={COLORS.textDim} />
						</TouchableOpacity>
					</TouchableOpacity>
				)}

				<View style={styles.platformsCard}>
					<Text style={styles.sectionLabel}>Works with</Text>
					<View style={styles.platformRow}>
						{SUPPORTED_PLATFORMS.map((p) => (
							<View key={p} style={styles.platformPill}>
								<Text style={styles.platformText}>{p}</Text>
							</View>
						))}
					</View>
				</View>
			</ScrollView>
		);
	}

	// =====================================================================
	// BROWSER
	// =====================================================================
	const formatCount = media?.formats?.length || 0;

	return (
		<View style={styles.container}>
			<View style={styles.addressBarContainer}>
				<AddressBar
					leading={
						<TouchableOpacity onPress={goLanding} style={styles.homeBtn}>
							<MaterialIcons name='home' size={22} color={COLORS.primary} />
						</TouchableOpacity>
					}
				/>
			</View>

			<WebView
				source={{ uri: browserUrl }}
				style={styles.webview}
				userAgent={MOBILE_UA}
				allowsInlineMediaPlayback
				mediaPlaybackRequiresUserAction={false}
				originWhitelist={['*']}
				onShouldStartLoadWithRequest={(req) => req.url.startsWith('http')}
				onNavigationStateChange={(nav) => {
					if (nav.url && nav.url.startsWith('http')) setUrlInput(nav.url);
				}}
				onLoadEnd={(e) => {
					if (!e.nativeEvent.loading) {
						setMedia(null);
						triggerExtraction(e.nativeEvent.url);
					}
				}}
			/>

			{/* Download FAB */}
			<TouchableOpacity
				style={styles.fabWrapper}
				activeOpacity={0.85}
				onPress={() => {
					if (media) setShowSheet(true);
					else if (fetching) toast('Scanning this page…');
					else triggerExtraction(urlInput || browserUrl, { manual: true });
				}}>
				<LinearGradient
					colors={
						media
							? [COLORS.primaryContainer, COLORS.secondary]
							: ['#2c2c33', '#3a3a44']
					}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 0 }}
					style={styles.fabGradient}>
					{fetching ? (
						<ActivityIndicator color='#fff' size='small' />
					) : media ? (
						<View style={styles.fabContent}>
							<MaterialIcons name='cloud-download' size={28} color='#fff' />
							<View style={styles.badge}>
								<Text style={styles.badgeText}>{formatCount}</Text>
							</View>
						</View>
					) : (
						<MaterialIcons name='bolt' size={28} color={COLORS.textDim} />
					)}
				</LinearGradient>
			</TouchableOpacity>

			{/* Preview / download sheet */}
			<Animated.View
				style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
				{media && (
					<View>
						<View style={styles.sheetHeader}>
							<Thumb uri={media.thumbnail} style={styles.sheetThumb} iconSize={22} />
							<View style={{ flex: 1, marginLeft: 12 }}>
								<Text style={styles.sheetTitle} numberOfLines={2}>
									{media.title || 'Media ready'}
								</Text>
								<Text style={styles.sheetSub}>
									{downloading ? 'Saving…' : 'Confirm rights, then tap to save'}
								</Text>
							</View>
							<TouchableOpacity
								onPress={() => setShowSheet(false)}
								style={styles.closeSheet}>
								<MaterialIcons
									name='keyboard-arrow-down'
									size={30}
									color={COLORS.textMain}
								/>
							</TouchableOpacity>
						</View>

						{/* rights acknowledgment */}
						<TouchableOpacity
							style={styles.ackRow}
							activeOpacity={0.8}
							onPress={() => setAck((v) => !v)}>
							<View style={[styles.checkbox, ack && styles.checkboxOn]}>
								{ack && <MaterialIcons name='check' size={15} color='#fff' />}
							</View>
							<Text style={styles.ackText}>
								I have the right to download this content.
							</Text>
						</TouchableOpacity>

						{downloading ? (
							<View style={styles.progressWrap}>
								<View style={styles.progressBar}>
									<View
										style={[styles.progressFill, { width: `${progress * 100}%` }]}
									/>
								</View>
								<View style={styles.progressRow}>
									<Text style={styles.progressLabel}>Downloading…</Text>
									<View style={{ flexDirection: 'row', alignItems: 'center' }}>
										<Text style={styles.progressPct}>
											{Math.round(progress * 100)}%
										</Text>
										<TouchableOpacity onPress={cancelDownload} style={styles.cancelBtn}>
											<Text style={styles.cancelText}>Cancel</Text>
										</TouchableOpacity>
									</View>
								</View>
							</View>
						) : (
							<FlatList
								data={media.formats}
								keyExtractor={(f) => f._key}
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={{ paddingVertical: 2 }}
								renderItem={({ item }) => (
									<TouchableOpacity
										style={[styles.formatBtn, !ack && styles.formatBtnDim]}
										activeOpacity={0.85}
										onPress={() => onPick(item)}>
										<MaterialIcons
											name={
												(item.mimeType || '').includes('image')
													? 'image'
													: 'file-download'
											}
											size={22}
											color={COLORS.background}
										/>
										<View style={{ marginLeft: 8 }}>
											<Text style={styles.formatQuality}>{qualityLabel(item)}</Text>
											{humanSize(item.contentLength) && (
												<Text style={styles.formatSize}>
													{humanSize(item.contentLength)}
												</Text>
											)}
										</View>
									</TouchableOpacity>
								)}
							/>
						)}
					</View>
				)}
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background },

	// Landing
	landing: {
		flexGrow: 1,
		padding: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {
		fontSize: 26,
		fontWeight: '900',
		color: COLORS.textMain,
		letterSpacing: 0.5,
		marginTop: 16,
	},
	subtitle: {
		color: COLORS.textDim,
		fontSize: 14,
		marginTop: 6,
		marginBottom: 24,
		textAlign: 'center',
	},

	// Address bar (exact Neon input)
	addressBarContainer: {
		paddingHorizontal: 15,
		paddingTop: 10,
		paddingBottom: 12,
		backgroundColor: COLORS.background,
	},
	addressBar: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.surface,
		borderRadius: 16,
		height: 55,
		borderWidth: 1,
		borderColor: COLORS.border,
		width: '100%',
	},
	addressInput: { flex: 1, color: COLORS.textMain, marginLeft: 12, fontSize: 16 },
	addressActions: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
	clearBtn: { padding: 8 },
	goBtn: {
		backgroundColor: COLORS.primaryContainer,
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
		marginLeft: 4,
	},
	homeBtn: { paddingHorizontal: 14 },
	pasteBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		paddingVertical: 8,
		marginRight: 8,
		borderRadius: 12,
		backgroundColor: COLORS.surfaceHighlight,
	},
	pasteText: {
		color: COLORS.primary,
		fontWeight: '700',
		fontSize: 13,
		marginLeft: 5,
	},

	// Clipboard prompt
	clipCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.surface,
		borderRadius: 16,
		padding: 14,
		marginTop: 16,
		width: '100%',
		borderWidth: 1,
		borderColor: COLORS.tertiary,
	},
	clipTitle: { color: COLORS.textMain, fontSize: 13, fontWeight: '700' },
	clipUrl: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
	clipOpenBtn: {
		backgroundColor: COLORS.tertiary,
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 12,
	},
	clipOpenText: { color: '#00201f', fontWeight: '800', fontSize: 13 },

	// Supported platforms
	platformsCard: { width: '100%', marginTop: 26 },
	sectionLabel: {
		color: COLORS.textDim,
		fontSize: 12,
		fontWeight: '800',
		letterSpacing: 0.5,
		textTransform: 'uppercase',
		marginBottom: 10,
	},
	platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	platformPill: {
		backgroundColor: COLORS.surface,
		borderRadius: 20,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	platformText: { color: COLORS.textMain, fontSize: 12, fontWeight: '600' },

	// Browser
	webview: { flex: 1, backgroundColor: COLORS.background },
	fabWrapper: {
		position: 'absolute',
		bottom: 25,
		right: 20,
		elevation: 8,
		shadowColor: COLORS.primaryContainer,
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.5,
		shadowRadius: 12,
	},
	fabGradient: {
		width: 64,
		height: 64,
		borderRadius: 32,
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	fabContent: { position: 'relative' },
	badge: {
		position: 'absolute',
		top: -8,
		right: -10,
		minWidth: 18,
		height: 18,
		paddingHorizontal: 4,
		borderRadius: 9,
		backgroundColor: COLORS.tertiary,
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 2,
		borderColor: COLORS.background,
	},
	badgeText: { color: '#000', fontSize: 10, fontWeight: '900' },

	// Sheet
	sheet: {
		position: 'absolute',
		bottom: 15,
		left: 15,
		right: 15,
		backgroundColor: 'rgba(22, 22, 26, 0.97)',
		borderRadius: 24,
		padding: 20,
		borderWidth: 1,
		borderColor: COLORS.primary,
		elevation: 20,
		shadowColor: COLORS.primary,
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.3,
		shadowRadius: 20,
	},
	sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
	sheetThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#000' },
	sheetTitle: {
		color: COLORS.textMain,
		fontSize: 16,
		fontWeight: '700',
		lineHeight: 22,
	},
	sheetSub: { color: COLORS.textDim, fontSize: 13, marginTop: 4 },
	closeSheet: {
		padding: 4,
		backgroundColor: COLORS.surfaceHighlight,
		borderRadius: 20,
	},
	ackRow: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.background,
		padding: 10,
		borderRadius: 12,
		marginBottom: 14,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	checkbox: {
		width: 20,
		height: 20,
		borderRadius: 6,
		borderWidth: 2,
		borderColor: COLORS.textDim,
		marginRight: 10,
		justifyContent: 'center',
		alignItems: 'center',
	},
	checkboxOn: {
		backgroundColor: COLORS.primaryContainer,
		borderColor: COLORS.primaryContainer,
	},
	ackText: { flex: 1, color: COLORS.textMain, fontSize: 12 },
	formatBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.textMain,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 14,
		marginRight: 12,
	},
	formatBtnDim: { opacity: 0.45 },
	formatQuality: { color: COLORS.background, fontSize: 15, fontWeight: '800' },
	formatSize: { color: '#555', fontSize: 11, fontWeight: '600', marginTop: 1 },
	progressWrap: { marginTop: 2 },
	progressBar: {
		height: 8,
		backgroundColor: COLORS.surfaceHighlight,
		borderRadius: 4,
		overflow: 'hidden',
	},
	progressFill: { height: '100%', backgroundColor: COLORS.tertiary, borderRadius: 4 },
	progressRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 10,
	},
	progressLabel: { color: COLORS.textMain, fontSize: 13, fontWeight: '600' },
	progressPct: { color: COLORS.tertiary, fontSize: 14, fontWeight: '800' },
	cancelBtn: {
		marginLeft: 14,
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 10,
		backgroundColor: 'rgba(255,90,118,0.15)',
	},
	cancelText: { color: COLORS.danger, fontSize: 12, fontWeight: '800' },
});
