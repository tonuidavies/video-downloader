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
	ScrollView,
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
import * as Haptics from 'expo-haptics';
import {
	PanGestureHandler,
	PanGestureHandlerGestureEvent,
	State,
} from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
	InterstitialAd,
	AdEventType,
	TestIds,
	BannerAd,
	BannerAdSize,
} from 'react-native-google-mobile-ads';

const { width, height } = Dimensions.get('window');
const STORAGE_KEY = '@downloaded_videos_v5';
const HISTORY_KEY = '@recent_links';
const CACHED_FETCH_KEY = '@last_fetched_video';
const GALLERY_COLUMNS = 3;
const GALLERY_SPACING = 4;
const GALLERY_ITEM_SIZE =
	(width - 32 - GALLERY_SPACING * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS;

// Ads
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

// ---------- Media Player with swipe down ----------
function MediaPlayerScreen({ media, onClose, onShare }) {
	const isImage =
		media.localUri.endsWith('.jpg') || media.localUri.endsWith('.png');
	const player = useVideoPlayer(isImage ? null : media.localUri, (p) => {
		if (!isImage) p.pause();
	}); // don't auto-play
	const translateY = useRef(new Animated.Value(0)).current;

	const onGestureEvent = Animated.event(
		[{ nativeEvent: { translationY: translateY } }],
		{ useNativeDriver: true },
	);
	const onHandlerStateChange = (event) => {
		if (event.nativeEvent.state === State.END) {
			if (event.nativeEvent.translationY > 150) {
				onClose();
			} else {
				Animated.spring(translateY, {
					toValue: 0,
					useNativeDriver: true,
				}).start();
			}
		}
	};

	return (
		<PanGestureHandler
			onGestureEvent={onGestureEvent}
			onHandlerStateChange={onHandlerStateChange}>
			<Animated.View
				style={[styles.playerContainer, { transform: [{ translateY }] }]}>
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
			</Animated.View>
		</PanGestureHandler>
	);
}

// ---------- Main App ----------
export default function App() {
	const [activeTab, setActiveTab] = useState('HOME');
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [downloadTotal, setDownloadTotal] = useState(0);
	const [videoData, setVideoData] = useState(null);
	const [downloadedVideos, setDownloadedVideos] = useState([]);
	const [playingMedia, setPlayingMedia] = useState(null);
	const [hasPermission, setHasPermission] = useState(false);
	const [recentLinks, setRecentLinks] = useState([]);
	const [showLinkHistory, setShowLinkHistory] = useState(false);
	const [streamingCallbackWaiting, setStreamingCallbackWaiting] =
		useState(false);
	const [editMode, setEditMode] = useState(false);
	const [selectedItems, setSelectedItems] = useState([]);
	const [interstitialAdLoaded, setInterstitialAdLoaded] = useState(false);

	const currentVideoDataRef = useRef(null);
	const downloadCancelRef = useRef(false);
	const scrollViewRef = useRef(null);
	const fadeAnim = useRef(new Animated.Value(0)).current;
	const pulseAnim = useRef(new Animated.Value(1)).current;

	const showToast = (msg) => {
		if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
		else Alert.alert('Notice', msg);
	};

	// ----- Storage helpers -----
	const persistVideos = useCallback(async (videos) => {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
	}, []);

	const loadDownloads = useCallback(async () => {
		const saved = await AsyncStorage.getItem(STORAGE_KEY);
		if (saved) setDownloadedVideos(JSON.parse(saved));
	}, []);

	const saveRecentLink = async (link) => {
		const updated = [link, ...recentLinks.filter((l) => l !== link)].slice(
			0,
			10,
		);
		setRecentLinks(updated);
		await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
	};

	const loadRecentLinks = async () => {
		const saved = await AsyncStorage.getItem(HISTORY_KEY);
		if (saved) setRecentLinks(JSON.parse(saved));
	};

	const cacheFetchedVideo = async (data) => {
		await AsyncStorage.setItem(CACHED_FETCH_KEY, JSON.stringify(data));
	};

	const loadCachedVideo = async () => {
		const cached = await AsyncStorage.getItem(CACHED_FETCH_KEY);
		if (cached && !videoData) {
			const parsed = JSON.parse(cached);
			setVideoData(parsed);
			currentVideoDataRef.current = parsed;
		}
	};

	const requestMediaPermissions = async () => {
		const { status } = await MediaLibrary.requestPermissionsAsync();
		return status === 'granted';
	};

	// Auto clipboard check
	const checkClipboard = async () => {
		try {
			const text = await Clipboard.getStringAsync();
			if (
				text &&
				(text.includes('tiktok.com') ||
					text.includes('instagram.com') ||
					text.includes('x.com') ||
					text.includes('twitter.com') ||
					text.includes('facebook.com') ||
					text.includes('reddit.com'))
			) {
				if (url !== text) {
					setUrl(text);
					showToast('🔗 Link auto-pasted from clipboard');
				}
			}
		} catch (e) {}
	};

	// Initial load
	useEffect(() => {
		loadDownloads();
		loadRecentLinks();
		loadCachedVideo();
		checkClipboard();
		const appStateSub = AppState.addEventListener('change', (next) => {
			if (next === 'active') checkClipboard();
		});
		Animated.timing(fadeAnim, {
			toValue: 1,
			duration: 500,
			useNativeDriver: true,
		}).start();
		const unsubLoaded = interstitialAd.addAdEventListener(
			AdEventType.LOADED,
			() => setInterstitialAdLoaded(true),
		);
		const unsubClosed = interstitialAd.addAdEventListener(
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
			unsubLoaded();
			unsubClosed();
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

	// Analyze link
	const handleAnalyze = async () => {
		if (!url) {
			showToast('Paste a link');
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
			// Replace with your actual backend IP/port
			const response = await axios.post(
				'http://192.168.100.12:8085/api/v1/downloader/extract',
				{ url },
			);
			setVideoData(response.data);
			currentVideoDataRef.current = response.data;
			await saveRecentLink(url);
			await cacheFetchedVideo(response.data);
			setUrl('');
			setTimeout(
				() => scrollViewRef.current?.scrollToEnd({ animated: true }),
				300,
			);
		} catch (e) {
			showToast('Could not fetch video. Check link or network.');
		} finally {
			setLoading(false);
		}
	};

	const checkStorageSpace = async (requiredMB = 50) => {
		const freeBytes = await FileSystem.getFreeDiskStorageAsync();
		return freeBytes > requiredMB * 1024 * 1024;
	};

	const executeDownload = async (targetData) => {
		if (!targetData || !targetData.originalUrl || downloading) return;
		const hasSpace = await checkStorageSpace();
		if (!hasSpace) {
			showToast('Not enough storage space (need at least 50 MB)');
			return;
		}
		setDownloading(true);
		setDownloadProgress(0);
		setDownloadTotal(0);
		downloadCancelRef.current = false;
		setStreamingCallbackWaiting(true);

		let ext = 'mp4';
		const dUrl = targetData.downloadUrl?.toLowerCase() || '';
		const oUrl = targetData.originalUrl?.toLowerCase() || '';
		if (dUrl.includes('.jpg') || dUrl.includes('.webp') || oUrl.includes('/p/'))
			ext = 'jpg';
		const fileName = `SaveItAll_${Date.now()}.${ext}`;
		const tempUri = `${FileSystem.cacheDirectory}${fileName}`;

		try {
			const localStreamUrl = `http://192.168.100.12:8085/api/v1/downloader/stream?url=${encodeURIComponent(targetData.originalUrl)}`;
			const downloadResumable = FileSystem.createDownloadResumable(
				localStreamUrl,
				tempUri,
				{},
				(progress) => {
					setStreamingCallbackWaiting(false);
					if (progress.totalBytesExpectedToWrite > 0) {
						setDownloadTotal(progress.totalBytesExpectedToWrite);
						const pct =
							progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
						setDownloadProgress(pct);
					} else {
						setDownloadProgress(-progress.totalBytesWritten);
					}
				},
			);
			const result = await downloadResumable.downloadAsync();
			if (downloadCancelRef.current) {
				await FileSystem.deleteAsync(tempUri, { idempotent: true });
				setDownloading(false);
				showToast('Download cancelled');
				return;
			}
			if (result.status !== 200 && result.status !== 206)
				throw new Error(`HTTP ${result.status}`);
			if (!result?.uri) throw new Error('Download failed');

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
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			showToast('Saved to gallery ✨');
			setVideoData(null);
			currentVideoDataRef.current = null;
		} catch (e) {
			showToast(
				e.message.includes('HTTP')
					? 'Platform blocked the download'
					: 'Download failed',
			);
		} finally {
			setDownloading(false);
			setDownloadProgress(0);
			setStreamingCallbackWaiting(false);
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

	const cancelDownload = () => {
		if (downloading) {
			downloadCancelRef.current = true;
		}
	};

	const handleShare = async (item) => {
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
		});
	};

	const handleDelete = async (item) => {
		Alert.alert('Delete', 'Permanently delete from gallery?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					if (item.assetId)
						await MediaLibrary.deleteAssetsAsync([item.assetId]);
					if (item.localUri)
						await FileSystem.deleteAsync(item.localUri, { idempotent: true });
					setDownloadedVideos((prev) => {
						const updated = prev.filter((v) => v.id !== item.id);
						persistVideos(updated);
						return updated;
					});
					showToast('Deleted');
				},
			},
		]);
	};

	// Bulk delete
	const toggleSelect = (id) => {
		setSelectedItems((prev) =>
			prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
		);
	};
	const confirmBulkDelete = () => {
		Alert.alert('Bulk Delete', `Delete ${selectedItems.length} items?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					for (const id of selectedItems) {
						const item = downloadedVideos.find((v) => v.id === id);
						if (item) {
							if (item.assetId)
								await MediaLibrary.deleteAssetsAsync([item.assetId]);
							if (item.localUri)
								await FileSystem.deleteAsync(item.localUri, {
									idempotent: true,
								});
						}
					}
					const remaining = downloadedVideos.filter(
						(v) => !selectedItems.includes(v.id),
					);
					setDownloadedVideos(remaining);
					persistVideos(remaining);
					setEditMode(false);
					setSelectedItems([]);
					showToast('Deleted selected items');
				},
			},
		]);
	};

	const renderGalleryItem = ({ item }) => {
		const isSelected = selectedItems.includes(item.id);
		const isImg =
			item.localUri.endsWith('.jpg') || item.localUri.endsWith('.png');
		return (
			<TouchableOpacity
				style={[styles.galleryItem, isSelected && styles.galleryItemSelected]}
				onPress={
					editMode ? () => toggleSelect(item.id) : () => setPlayingMedia(item)
				}
				onLongPress={() => {
					if (!editMode) {
						setEditMode(true);
						toggleSelect(item.id);
					}
				}}
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
					{!editMode && (
						<TouchableOpacity onPress={() => handleShare(item)}>
							<Text style={styles.galleryShare}>↗</Text>
						</TouchableOpacity>
					)}
					{editMode && (
						<View
							style={[
								styles.checkboxSmall,
								isSelected && styles.checkboxSmallActive,
							]}>
							<Text style={styles.checkmarkSmall}>✓</Text>
						</View>
					)}
				</View>
			</TouchableOpacity>
		);
	};

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<SafeAreaView style={styles.container}>
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
								ref={scrollViewRef}
								contentContainerStyle={styles.scrollContent}
								style={{ opacity: fadeAnim }}>
								<View style={styles.logoWrap}>
									<Image
										source={require('./assets/icon.png')}
										style={styles.topLogo}
									/>
								</View>
								<View style={styles.card}>
									<Text style={styles.appName}>SaveIt All</Text>
									<Text style={styles.subtitle}>
										Save videos & images from anywhere
									</Text>
									<View style={styles.inputRow}>
										<TextInput
											style={styles.input}
											placeholder='Paste link here...'
											placeholderTextColor='#64748B'
											value={url}
											onChangeText={setUrl}
											autoCapitalize='none'
										/>
										<TouchableOpacity
											onPress={checkClipboard}
											style={styles.pasteBtn}>
											<Text style={styles.pasteBtnText}>📋</Text>
										</TouchableOpacity>
									</View>
									{recentLinks.length > 0 && (
										<TouchableOpacity
											onPress={() => setShowLinkHistory(!showLinkHistory)}
											style={styles.historyToggle}>
											<Text style={styles.historyToggleText}>
												📜 Recent links {showLinkHistory ? '▲' : '▼'}
											</Text>
										</TouchableOpacity>
									)}
									{showLinkHistory && (
										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}
											style={styles.historyScroll}>
											{recentLinks.map((link) => (
												<TouchableOpacity
													key={link}
													onPress={() => {
														setUrl(link);
														setShowLinkHistory(false);
													}}
													style={styles.historyItem}>
													<Text style={styles.historyItemText}>
														{link.length > 40 ? link.slice(0, 40) + '…' : link}
													</Text>
												</TouchableOpacity>
											))}
										</ScrollView>
									)}
									<Animated.View
										style={{
											width: '100%',
											transform: [{ scale: pulseAnim }],
										}}>
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
												<Text style={styles.searchBtnText}>✨ Fetch Media</Text>
											)}
										</TouchableOpacity>
									</Animated.View>
									<View style={styles.platformWrap}>
										<Text style={styles.platformTitle}>
											🌐 Supported: TikTok, Instagram, FB, Twitter/X, Reddit,
											Twitch, Vimeo, Dailymotion + more
										</Text>
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
													I have owner's permission to download
												</Text>
											</TouchableOpacity>
											{(downloading || streamingCallbackWaiting) && (
												<View style={styles.progressWrap}>
													<View style={styles.progressBar}>
														<View
															style={[
																styles.progressFill,
																{
																	width:
																		downloadProgress >= 0
																			? `${Math.round(downloadProgress * 100)}%`
																			: '100%',
																	backgroundColor:
																		downloadProgress >= 0
																			? '#10B981'
																			: '#38BDF8',
																},
															]}
														/>
													</View>
													<View style={styles.progressDetails}>
														<Text style={styles.progressText}>
															{streamingCallbackWaiting
																? '⏳ Connecting to stream...'
																: downloadProgress >= 0
																	? `${Math.round(downloadProgress * 100)}%`
																	: `${(Math.abs(downloadProgress) / (1024 * 1024)).toFixed(1)} MB received`}
														</Text>
														{downloadTotal > 0 && downloadProgress >= 0 && (
															<Text
																style={
																	styles.progressText
																}>{`${Math.round((downloadProgress * downloadTotal) / (1024 * 1024))}/${Math.round(downloadTotal / (1024 * 1024))} MB`}</Text>
														)}
													</View>
													{downloading && (
														<TouchableOpacity
															onPress={cancelDownload}
															style={styles.cancelBtn}>
															<Text style={styles.cancelBtnText}>Cancel</Text>
														</TouchableOpacity>
													)}
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
													{downloading ? 'Saving...' : '⬇️ Save to Gallery'}
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
									<View style={styles.galleryHeaderActions}>
										{editMode && selectedItems.length > 0 && (
											<TouchableOpacity
												onPress={confirmBulkDelete}
												style={styles.bulkDeleteBtn}>
												<Text style={styles.bulkDeleteText}>
													Delete ({selectedItems.length})
												</Text>
											</TouchableOpacity>
										)}
										{editMode && (
											<TouchableOpacity
												onPress={() => {
													setEditMode(false);
													setSelectedItems([]);
												}}
												style={styles.cancelEditBtn}>
												<Text style={styles.cancelEditText}>Cancel</Text>
											</TouchableOpacity>
										)}
										{!editMode && downloadedVideos.length > 0 && (
											<TouchableOpacity
												onPress={() => setEditMode(true)}
												style={styles.editBtn}>
												<Text style={styles.editBtnText}>Select</Text>
											</TouchableOpacity>
										)}
										<View style={styles.countBadge}>
											<Text style={styles.countText}>
												{downloadedVideos.length}
											</Text>
										</View>
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
							onPress={() => {
								setActiveTab('HOME');
								setEditMode(false);
							}}>
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
							onPress={() => {
								setActiveTab('FOLDER');
								setEditMode(false);
							}}>
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
		</GestureHandlerRootView>
	);
}

// ---------- Styles (omitted for brevity, keep original plus new ones) ----------
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
	inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
	input: {
		flex: 1,
		backgroundColor: '#1E293B',
		borderRadius: 18,
		paddingHorizontal: 18,
		paddingVertical: 15,
		color: '#fff',
		fontSize: 15,
		borderWidth: 1,
		borderColor: '#334155',
	},
	pasteBtn: {
		backgroundColor: '#334155',
		borderRadius: 18,
		paddingHorizontal: 18,
		justifyContent: 'center',
	},
	pasteBtnText: { fontSize: 22 },
	historyToggle: { alignSelf: 'flex-start', marginBottom: 8 },
	historyToggleText: { color: '#38BDF8', fontSize: 12 },
	historyScroll: { flexDirection: 'row', marginBottom: 12 },
	historyItem: {
		backgroundColor: '#1E293B',
		borderRadius: 16,
		paddingHorizontal: 12,
		paddingVertical: 6,
		marginRight: 8,
	},
	historyItemText: { color: '#CBD5E1', fontSize: 12 },
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
	platformTitle: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
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
	progressWrap: { marginBottom: 14, position: 'relative' },
	progressBar: {
		height: 8,
		backgroundColor: '#1E293B',
		borderRadius: 4,
		overflow: 'hidden',
	},
	progressFill: { height: '100%', backgroundColor: '#10B981' },
	progressDetails: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 6,
	},
	progressText: { fontSize: 11, color: '#10B981', fontWeight: '700' },
	cancelBtn: {
		position: 'absolute',
		right: 0,
		top: -28,
		backgroundColor: '#EF4444',
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 20,
	},
	cancelBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
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
		alignItems: 'center',
	},
	galleryHeaderTitle: { fontSize: 28, fontWeight: '800', color: '#fff' },
	galleryHeaderActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
	editBtn: {
		backgroundColor: '#38BDF8',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	editBtnText: { color: '#020617', fontWeight: '700' },
	bulkDeleteBtn: {
		backgroundColor: '#EF4444',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	bulkDeleteText: { color: '#fff', fontWeight: '700' },
	cancelEditBtn: {
		backgroundColor: '#334155',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
	},
	cancelEditText: { color: '#fff', fontWeight: '700' },
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
	galleryItemSelected: { borderWidth: 3, borderColor: '#38BDF8' },
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
		justifyContent: 'space-between',
	},
	galleryTitle: { flex: 1, fontSize: 10, color: '#fff' },
	galleryShare: { fontSize: 14, color: '#38BDF8' },
	checkboxSmall: {
		width: 20,
		height: 20,
		borderRadius: 4,
		borderWidth: 2,
		borderColor: '#fff',
		backgroundColor: 'transparent',
		alignItems: 'center',
		justifyContent: 'center',
	},
	checkboxSmallActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
	checkmarkSmall: { color: '#020617', fontWeight: 'bold', fontSize: 12 },
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
