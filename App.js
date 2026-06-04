import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Image,
	ActivityIndicator,
	StyleSheet,
	Platform,
	KeyboardAvoidingView,
	Modal,
	Dimensions,
	Animated,
	FlatList,
	ToastAndroid,
	Alert,
	AppState,
} from 'react-native';

import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar'; 
import * as Clipboard from 'expo-clipboard'; 

import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
	InterstitialAd,
	AdEventType,
	TestIds,
	BannerAd,
	BannerAdSize,
} from 'react-native-google-mobile-ads';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@downloaded_videos_v4';
const GALLERY_COLUMNS = 3;
const GALLERY_SPACING = 4;
const GALLERY_ITEM_SIZE =
	(width - 32 - GALLERY_SPACING * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS;

// ADS
const interstitialAdUnitId = __DEV__
	? TestIds.INTERSTITIAL
	: Platform.OS === 'ios'
		? 'ca-app-pub-5117316644857484/4813266605'
		: 'ca-app-pub-5117316644857484/7842966656';
const bannerAdUnitId = __DEV__
	? TestIds.BANNER
	: Platform.OS === 'ios'
		? 'ca-app-pub-5117316644857484/1234567890'
		: 'ca-app-pub-5117316644857484/0987654321';
const interstitialAd = InterstitialAd.createForAdRequest(interstitialAdUnitId);

// MEDIA PLAYER SCREEN (Handles both Videos AND Images)
function MediaPlayerScreen({ media, onClose, onShare }) {
	const isImage =
		media.localUri.endsWith('.jpg') || media.localUri.endsWith('.png');

	// Only initialize video player if it's actually an MP4
	const player = useVideoPlayer(isImage ? null : media.localUri, (player) => {
		if (!isImage) player.play();
	});

	return (
		<View style={styles.playerContainer}>
			<View style={styles.playerTopBar}>
				<TouchableOpacity
					onPress={onClose}
					style={styles.playerCloseBtn}>
					<Text style={styles.playerCloseText}>✕ Close</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => onShare(media)}
					style={styles.playerShareBtn}>
					<Text style={styles.playerShareText}>Share ↗</Text>
				</TouchableOpacity>
			</View>

			{isImage ? (
				<Image
					source={{ uri: media.localUri }}
					style={styles.player}
					resizeMode='contain'
				/>
			) : (
				<VideoView
					player={player}
					style={styles.player}
					fullscreenOptions={{ enable: true }}
					allowsPictureInPicture
					nativeControls
				/>
			)}

			<View style={styles.playerInfoBar}>
				<Text
					style={styles.playerInfoTitle}
					numberOfLines={2}>
					{media.title}
				</Text>
				<Text style={styles.playerInfoDate}>Saved: {media.date}</Text>
			</View>
		</View>
	);
}

// MAIN APP
export default function App() {
	const [activeTab, setActiveTab] = useState('HOME');
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [videoData, setVideoData] = useState(null);
	const [downloadedVideos, setDownloadedVideos] = useState([]);
	const [playingMedia, setPlayingMedia] = useState(null);
	const [hasPermission, setHasPermission] = useState(false);

	const currentVideoDataRef = useRef(null);
	const scrollViewRef = useRef(null); // <-- REF FOR AUTO-SCROLLING
	const fadeAnim = useRef(new Animated.Value(0)).current;
	const pulseAnim = useRef(new Animated.Value(1)).current;
	const [interstitialAdLoaded, setInterstitialAdLoaded] = useState(false);

	const showToast = (message) => {
		if (Platform.OS === 'android')
			ToastAndroid.show(message, ToastAndroid.SHORT);
		else Alert.alert('Notice', message);
	};

	const persistVideos = useCallback(async (videos) => {
		try {
			await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
		} catch (e) {
			console.log(e);
		}
	}, []);

	const loadDownloads = useCallback(async () => {
		try {
			const saved = await AsyncStorage.getItem(STORAGE_KEY);
			if (!saved) return;
			setDownloadedVideos(JSON.parse(saved));
		} catch (e) {
			console.log(e);
		}
	}, []);

	const requestMediaPermissions = useCallback(async () => {
		const { status } = await MediaLibrary.requestPermissionsAsync();
		return status === 'granted';
	}, []);

	// 1. AUTO-CLIPBOARD FETCHER
	const checkClipboard = async () => {
		try {
			const text = await Clipboard.getStringAsync();
			if (
				text &&
				(text.includes('tiktok.com') ||
					text.includes('instagram.com') ||
					text.includes('x.com') ||
					text.includes('twitter.com'))
			) {
				if (url !== text) {
					setUrl(text);
					showToast('🔗 Link auto-pasted from clipboard!');
				}
			}
		} catch (e) {
			console.log('Clipboard read error');
		}
	};

	useEffect(() => {
		loadDownloads();
		checkClipboard(); // Check on launch

		// Check again whenever user opens the app from background
		const appStateSub = AppState.addEventListener('change', (nextAppState) => {
			if (nextAppState === 'active') checkClipboard();
		});

		Animated.timing(fadeAnim, {
			toValue: 1,
			duration: 500,
			useNativeDriver: true,
		}).start();

		const unsubAdLoaded = interstitialAd.addAdEventListener(
			AdEventType.LOADED,
			() => setInterstitialAdLoaded(true),
		);
		const unsubAdClosed = interstitialAd.addAdEventListener(
			AdEventType.CLOSED,
			() => {
				setInterstitialAdLoaded(false);
				interstitialAd.load();
				if (currentVideoDataRef.current)
					executeDownload(currentVideoDataRef.current);
			},
		);

		interstitialAd.load();
		return () => {
			unsubAdLoaded();
			unsubAdClosed();
			appStateSub.remove();
		};
	}, []);

	useEffect(() => {
		if (loading) {
			Animated.loop(
				Animated.sequence([
					Animated.timing(pulseAnim, {
						toValue: 0.96,
						duration: 500,
						useNativeDriver: true,
					}),
					Animated.timing(pulseAnim, {
						toValue: 1,
						duration: 500,
						useNativeDriver: true,
					}),
				]),
			).start();
		} else {
			pulseAnim.setValue(1);
		}
	}, [loading]);

	const handleAnalyze = async () => {
		if (!url) {
			showToast('Paste a video link');
			return;
		}
		if (url.includes('youtube.com') || url.includes('youtu.be')) {
			showToast('YouTube not supported');
			return;
		}

		setLoading(true);
		setVideoData(null);
		setHasPermission(false);

		try {
			// UPDATE THIS TO YOUR LOCAL IP FOR TESTING!
			const response = await axios.post(
				'https://download.usesabu.com/api/v1/downloader/extract',
				{ url },
			);
			setVideoData(response.data);
			currentVideoDataRef.current = response.data;
			setUrl('');

			// 2. AUTO-SCROLL TO DOWNLOAD BUTTON
			setTimeout(() => {
				scrollViewRef.current?.scrollToEnd({ animated: true });
			}, 300);
		} catch (e) {
			showToast('Could not fetch video');
		} finally {
			setLoading(false);
		}
	};

	const handleDownloadPress = async () => {
		if (!currentVideoDataRef.current) return;
		if (!hasPermission) {
			showToast('Confirm permission first');
			return;
		}
		const granted = await requestMediaPermissions();
		if (!granted) {
			showToast('Gallery permission denied');
			return;
		}

		if (interstitialAdLoaded) interstitialAd.show();
		else executeDownload(currentVideoDataRef.current);
	};

	const executeDownload = async (targetData) => {
		if (!targetData || !targetData.originalUrl) return;
		if (downloading) return;

		setDownloading(true);
		setDownloadProgress(0);

		// 3. IMAGE SUPPORT DETECTION
		let ext = 'mp4';
		const dUrl = targetData.downloadUrl?.toLowerCase() || '';
		const oUrl = targetData.originalUrl?.toLowerCase() || '';
		if (
			dUrl.includes('.jpg') ||
			dUrl.includes('.webp') ||
			oUrl.includes('/p/')
		) {
			ext = 'jpg';
		}

		const fileName = `SaveItAll_${Date.now()}.${ext}`;
		const tempUri = `${FileSystem.cacheDirectory}${fileName}`;

		try {
			const localStreamUrl = `https://download.usesabu.com/api/v1/downloader/stream?url=${encodeURIComponent(targetData.originalUrl)}`;

			const downloadResumable = FileSystem.createDownloadResumable(
				localStreamUrl,
				tempUri,
				{ headers: {} },
				(progress) => {
					// LIVE PROGRESS BAR FIX
					if (progress.totalBytesExpectedToWrite > 0) {
						const pct =
							progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
						setDownloadProgress(pct);
					} else {
						// Pass negative value to trigger the MB streaming UI
						setDownloadProgress(-progress.totalBytesWritten);
					}
				},
			);

			const result = await downloadResumable.downloadAsync();

			if (result.status !== 200 && result.status !== 206) {
				await FileSystem.deleteAsync(tempUri, { idempotent: true });
				throw new Error(
					`Platform blocked the download (HTTP ${result.status})`,
				);
			}

			if (!result || !result.uri) throw new Error('Download failed');

			const asset = await MediaLibrary.createAssetAsync(result.uri);
			let album = await MediaLibrary.getAlbumAsync('SaveIt All');

			if (!album)
				album = await MediaLibrary.createAlbumAsync('SaveIt All', asset, false);
			else await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);

			const newEntry = {
				id: Date.now().toString(),
				title: targetData.title || 'Untitled Media',
				thumbnail: targetData.thumbnail || null,
				localUri: result.uri,
				assetId: asset.id,
				date: new Date().toLocaleDateString(),
			};

			setDownloadedVideos((prev) => {
				const updated = [newEntry, ...prev];
				persistVideos(updated);
				return updated;
			});

			showToast('Saved to gallery ✨');
			setVideoData(null);
			currentVideoDataRef.current = null;
		} catch (e) {
			console.log(e);
			showToast(
				e.message.includes('Platform blocked') ? e.message : 'Download failed',
			);
		} finally {
			setDownloading(false);
			setDownloadProgress(0);
		}
	};

	const handleShare = async (item) => {
		try {
			const available = await Sharing.isAvailableAsync();
			if (!available) {
				showToast('Sharing unavailable');
				return;
			}
			const isImg =
				item.localUri.endsWith('.jpg') || item.localUri.endsWith('.png');
			await Sharing.shareAsync(item.localUri, {
				mimeType: isImg ? 'image/jpeg' : 'video/mp4',
				dialogTitle: 'Share to...',
				UTI: isImg ? 'public.jpeg' : 'public.movie',
			});
		} catch (e) {
			showToast('Could not share file');
		}
	};

	const handlePlayPress = (item) => setPlayingMedia(item);

	const handleDelete = (item) => {
		Alert.alert(
			'Remove File',
			'Delete this permanently from your device gallery?',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							if (item.assetId)
								await MediaLibrary.deleteAssetsAsync([item.assetId]);
							if (item.localUri)
								await FileSystem.deleteAsync(item.localUri, {
									idempotent: true,
								});
							setDownloadedVideos((prev) => {
								const updated = prev.filter((v) => v.id !== item.id);
								persistVideos(updated);
								return updated;
							});
							showToast('Deleted');
						} catch (error) {
							showToast('Failed to delete file from gallery');
						}
					},
				},
			],
		);
	};

	const renderGalleryItem = ({ item }) => {
		const isImg =
			item.localUri.endsWith('.jpg') || item.localUri.endsWith('.png');
		return (
			<TouchableOpacity
				style={styles.galleryItem}
				onPress={() => handlePlayPress(item)}
				onLongPress={() => handleDelete(item)}
				activeOpacity={0.85}>
				<Image
					source={{ uri: item.thumbnail || item.localUri }}
					style={styles.galleryThumb}
				/>
				{!isImg && (
					<View style={styles.galleryPlayOverlay}>
						<View style={styles.galleryPlayCircle}>
							<Text style={styles.galleryPlayIcon}>▶</Text>
						</View>
					</View>
				)}
				<View style={styles.galleryFooter}>
					<Text
						style={styles.galleryTitle}
						numberOfLines={1}>
						{item.title}
					</Text>
					<TouchableOpacity onPress={() => handleShare(item)}>
						<Text style={styles.galleryShare}>↗</Text>
					</TouchableOpacity>
				</View>
			</TouchableOpacity>
		);
	};

	return (
		<SafeAreaProvider>
			<SafeAreaView style={styles.container}>
				{/* REPLACED RAW REACT NATIVE STATUS BAR WITH EXPO STATUS BAR */}
				<StatusBar
					style='light'
					backgroundColor='#020617'
					translucent={false}
				/>

				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					style={{ flex: 1 }}>
					<View style={styles.bannerContainerTop}>
						<BannerAd
							unitId={bannerAdUnitId}
							size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
							requestOptions={{ requestNonPersonalizedAdsOnly: true }}
						/>
					</View>

					{activeTab === 'HOME' && (
						<Animated.ScrollView
							ref={scrollViewRef} // <-- ATTACHED SCROLL REF HERE
							contentContainerStyle={styles.scrollContent}
							style={{ opacity: fadeAnim }}
							showsVerticalScrollIndicator={false}>
							<View style={styles.logoWrap}>
								<Image
									source={require('./assets/icon.png')}
									style={styles.topLogo}
								/>
							</View>

							<View style={styles.card}>
								<Text style={styles.appName}>SaveIt All</Text>
								<Text style={styles.subtitle}>Save videos from anywhere</Text>
								<TextInput
									style={styles.input}
									placeholder='Paste link here...'
									placeholderTextColor='#64748B'
									value={url}
									onChangeText={setUrl}
									autoCapitalize='none'
								/>
								<Animated.View
									style={{ width: '100%', transform: [{ scale: pulseAnim }] }}>
									<TouchableOpacity
										style={[
											styles.searchBtn,
											loading && styles.searchBtnDisabled,
										]}
										onPress={handleAnalyze}
										disabled={loading}>
										{loading ? (
											<ActivityIndicator color='#fff' />
										) : (
											<Text style={styles.searchBtnText}>✨ Search</Text>
										)}
									</TouchableOpacity>
								</Animated.View>
								<View style={styles.platformWrap}>
									<Text style={styles.platformTitle}>
										🌐 Supported Platforms
									</Text>
									<View style={styles.chips}>
										{[
											'Instagram',
											'Facebook',
											'Twitter/X',
											'TikTok',
											'Reddit',
											'Twitch',
											'Vimeo',
											'Dailymotion',
										].map((item) => (
											<View
												key={item}
												style={styles.chip}>
												<Text style={styles.chipText}>{item}</Text>
											</View>
										))}
									</View>
									<Text style={styles.extraText}>+ many more public links</Text>
								</View>
							</View>

							{videoData && (
								<View style={styles.previewCard}>
									<Image
										source={{ uri: videoData.thumbnail }}
										style={styles.previewImage}
									/>
									<View style={styles.previewContent}>
										<Text
											style={styles.previewTitle}
											numberOfLines={2}>
											{videoData.title}
										</Text>
										<TouchableOpacity
											style={styles.permissionRow}
											onPress={() => setHasPermission(!hasPermission)}>
											<View
												style={[
													styles.checkbox,
													hasPermission && styles.checkboxActive,
												]}>
												{hasPermission && (
													<Text style={styles.checkmark}>✓</Text>
												)}
											</View>
											<Text style={styles.permissionText}>
												I confirm I have the owner's permission to download this
												content.
											</Text>
										</TouchableOpacity>

										{downloading && (
											<View style={styles.progressWrap}>
												<View style={styles.progressBar}>
													<View
														style={[
															styles.progressFill,
															{
																// DYNAMIC STREAMING PROGRESS BAR
																width:
																	downloadProgress >= 0
																		? `${Math.round(downloadProgress * 100)}%`
																		: '100%',
																backgroundColor:
																	downloadProgress >= 0 ? '#10B981' : '#38BDF8',
															},
														]}
													/>
												</View>
												<Text style={styles.progressText}>
													{downloadProgress >= 0
														? `${Math.round(downloadProgress * 100)}%`
														: `Live Stream: ${(Math.abs(downloadProgress) / (1024 * 1024)).toFixed(1)} MB`}
												</Text>
											</View>
										)}

										<TouchableOpacity
											style={[
												styles.downloadBtn,
												(!hasPermission || downloading) &&
													styles.downloadBtnDisabled,
											]}
											onPress={handleDownloadPress}
											disabled={!hasPermission || downloading}>
											<Text style={styles.downloadBtnText}>
												{downloading ? '⏳ Saving...' : '⬇️ Save to Gallery'}
											</Text>
										</TouchableOpacity>
									</View>
								</View>
							)}
						</Animated.ScrollView>
					)}

					{activeTab === 'FOLDER' && (
						<View style={styles.galleryContainer}>
							<View style={styles.galleryHeader}>
								<Text style={styles.galleryHeaderTitle}>My Gallery</Text>
								<View style={styles.countBadge}>
									<Text style={styles.countText}>
										{downloadedVideos.length}
									</Text>
								</View>
							</View>

							{downloadedVideos.length === 0 ? (
								<View style={styles.emptyState}>
									<Text style={styles.emptyEmoji}>🎬</Text>
									<Text style={styles.emptyTitle}>No files yet</Text>
									<Text style={styles.emptySubtitle}>
										Downloads will appear here
									</Text>
								</View>
							) : (
								<FlatList
									data={downloadedVideos}
									renderItem={renderGalleryItem}
									keyExtractor={(item) => item.id}
									numColumns={GALLERY_COLUMNS}
									columnWrapperStyle={styles.galleryRow}
									contentContainerStyle={styles.galleryList}
								/>
							)}
						</View>
					)}

					<View style={styles.bannerContainerBottom}>
						<BannerAd
							unitId={bannerAdUnitId}
							size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
							requestOptions={{ requestNonPersonalizedAdsOnly: true }}
						/>
					</View>
				</KeyboardAvoidingView>

				<View style={styles.bottomBar}>
					<TouchableOpacity
						style={styles.tab}
						onPress={() => setActiveTab('HOME')}>
						<Text
							style={[
								styles.tabIcon,
								activeTab === 'HOME' && styles.tabIconActive,
							]}>
							🔍
						</Text>
						<Text
							style={[
								styles.tabLabel,
								activeTab === 'HOME' && styles.tabLabelActive,
							]}>
							Search
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.tab}
						onPress={() => setActiveTab('FOLDER')}>
						<Text
							style={[
								styles.tabIcon,
								activeTab === 'FOLDER' && styles.tabIconActive,
							]}>
							🖼️
						</Text>
						<Text
							style={[
								styles.tabLabel,
								activeTab === 'FOLDER' && styles.tabLabelActive,
							]}>
							Gallery
						</Text>
					</TouchableOpacity>
				</View>

				<Modal
					visible={!!playingMedia}
					animationType='slide'>
					{playingMedia && (
						<MediaPlayerScreen
							media={playingMedia}
							onClose={() => setPlayingMedia(null)}
							onShare={handleShare}
						/>
					)}
				</Modal>
			</SafeAreaView>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#020617' },
	bannerContainerTop: {
		alignItems: 'center',
		marginTop: Platform.OS === 'ios' ? 4 : 0,
		backgroundColor: '#020617',
		zIndex: 10,
	},
	bannerContainerBottom: {
		alignItems: 'center',
		backgroundColor: '#0F172A',
		paddingTop: 8,
		borderTopWidth: 1,
		borderColor: '#1E293B',
	},
	scrollContent: { padding: 16, paddingBottom: 30 },
	logoWrap: { alignItems: 'center', marginVertical: 16 },
	topLogo: { width: 70, height: 70 },
	card: {
		backgroundColor: '#0F172A',
		borderRadius: 28,
		padding: 24,
		borderWidth: 1,
		borderColor: '#1E293B',
	},
	appName: {
		fontSize: 30,
		fontWeight: '800',
		color: '#fff',
		textAlign: 'center',
	},
	subtitle: {
		fontSize: 13,
		color: '#94A3B8',
		textAlign: 'center',
		marginBottom: 24,
	},
	input: {
		backgroundColor: '#1E293B',
		borderRadius: 18,
		paddingHorizontal: 18,
		paddingVertical: 15,
		color: '#fff',
		fontSize: 15,
		borderWidth: 1,
		borderColor: '#334155',
		marginBottom: 18,
	},
	searchBtn: {
		backgroundColor: '#38BDF8',
		borderRadius: 20,
		paddingVertical: 15,
		alignItems: 'center',
		marginBottom: 22,
	},
	searchBtnDisabled: { backgroundColor: '#334155' },
	searchBtnText: { fontSize: 16, fontWeight: '800', color: '#020617' },
	platformWrap: { alignItems: 'center' },
	platformTitle: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
	chips: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		justifyContent: 'center',
	},
	chip: {
		backgroundColor: '#1E293B',
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 20,
	},
	chipText: { fontSize: 11, color: '#CBD5E1' },
	extraText: { fontSize: 10, color: '#64748B', marginTop: 10 },
	previewCard: {
		backgroundColor: '#0F172A',
		borderRadius: 24,
		marginTop: 22,
		overflow: 'hidden',
	},
	previewImage: { width: '100%', height: 210 },
	previewContent: { padding: 18 },
	previewTitle: {
		fontSize: 15,
		fontWeight: '700',
		color: '#fff',
		textAlign: 'center',
		marginBottom: 14,
	},
	permissionRow: {
		flexDirection: 'row',
		backgroundColor: '#1E293B',
		padding: 12,
		borderRadius: 14,
		alignItems: 'center',
		marginBottom: 16,
	},
	checkbox: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 2,
		borderColor: '#64748B',
		marginRight: 10,
		justifyContent: 'center',
		alignItems: 'center',
	},
	checkboxActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
	checkmark: { fontWeight: '900', color: '#020617' },
	permissionText: { flex: 1, fontSize: 11, color: '#CBD5E1' },
	progressWrap: { marginBottom: 14 },
	progressBar: {
		height: 8,
		backgroundColor: '#1E293B',
		borderRadius: 4,
		overflow: 'hidden',
	},
	progressFill: { height: '100%', backgroundColor: '#10B981' },
	progressText: {
		marginTop: 6,
		fontSize: 11,
		color: '#10B981',
		fontWeight: '700',
		textAlign: 'right',
	},
	downloadBtn: {
		backgroundColor: '#10B981',
		borderRadius: 18,
		paddingVertical: 15,
		alignItems: 'center',
	},
	downloadBtnDisabled: { backgroundColor: '#334155' },
	downloadBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
	galleryContainer: { flex: 1, padding: 16 },
	galleryHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 18,
	},
	galleryHeaderTitle: { fontSize: 28, fontWeight: '800', color: '#fff' },
	countBadge: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: '#38BDF8',
		alignItems: 'center',
		justifyContent: 'center',
	},
	countText: { fontWeight: '800', color: '#020617' },
	galleryList: { paddingBottom: 20 },
	galleryRow: { gap: GALLERY_SPACING, marginBottom: GALLERY_SPACING },
	galleryItem: {
		width: GALLERY_ITEM_SIZE,
		backgroundColor: '#0F172A',
		borderRadius: 14,
		overflow: 'hidden',
	},
	galleryThumb: { width: '100%', height: GALLERY_ITEM_SIZE },
	galleryPlayOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: GALLERY_ITEM_SIZE,
		justifyContent: 'center',
		alignItems: 'center',
	},
	galleryPlayCircle: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: 'rgba(56,189,248,0.85)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	galleryPlayIcon: { color: '#fff' },
	galleryFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 8,
		paddingVertical: 6,
	},
	galleryTitle: { flex: 1, fontSize: 10, color: '#fff' },
	galleryShare: { fontSize: 14, color: '#38BDF8' },
	emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	emptyEmoji: { fontSize: 54, marginBottom: 10 },
	emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
	emptySubtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
	bottomBar: {
		flexDirection: 'row',
		backgroundColor: '#0F172A',
		paddingTop: 12,
		paddingBottom: 32,
	},
	tab: { flex: 1, alignItems: 'center' },
	tabIcon: { fontSize: 22, opacity: 0.4 },
	tabIconActive: { opacity: 1 },
	tabLabel: { fontSize: 11, color: '#64748B', marginTop: 4 },
	tabLabelActive: { color: '#38BDF8', fontWeight: '800' },
	playerContainer: { flex: 1, backgroundColor: '#000' },
	playerTopBar: {
		position: 'absolute',
		top: 55,
		left: 0,
		right: 0,
		zIndex: 10,
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
	},
	playerCloseBtn: {
		backgroundColor: 'rgba(255,255,255,0.15)',
		paddingHorizontal: 16,
		paddingVertical: 9,
		borderRadius: 22,
	},
	playerCloseText: { color: '#fff', fontWeight: '700' },
	playerShareBtn: {
		backgroundColor: 'rgba(56,189,248,0.2)',
		paddingHorizontal: 16,
		paddingVertical: 9,
		borderRadius: 22,
	},
	playerShareText: { color: '#38BDF8', fontWeight: '700' },
	player: { flex: 1, width: '100%', justifyContent: 'center' },
	playerInfoBar: { backgroundColor: '#0F172A', padding: 16, paddingBottom: 30 },
	playerInfoTitle: { color: '#fff', fontWeight: '700' },
	playerInfoDate: { fontSize: 11, color: '#64748B', marginTop: 4 },
});
