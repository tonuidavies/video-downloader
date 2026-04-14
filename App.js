import React, { useState, useEffect, useRef } from 'react';
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
	ScrollView,
	StatusBar,
	Modal,
	SafeAreaView,
	Dimensions
} from 'react-native';
import axios from 'axios';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video } from 'expo-av';

// --- ADMOB IMPORTS ---
import {
	RewardedAd,
	RewardedAdEventType,
	AdEventType,
	TestIds,
} from 'react-native-google-mobile-ads';

const { width, height } = Dimensions.get('window');

// Use REWARDED Test ID
const adUnitId = __DEV__
	? TestIds.REWARDED
	: Platform.OS === 'ios'
		? 'ca-app-pub-5117316644857484/4813266605'
		: 'ca-app-pub-5117316644857484/7842966656';
// 3 Separate Rewarded Instances
const launchAd = RewardedAd.createForAdRequest(adUnitId, {
	requestNonPersonalizedAdsOnly: true,
});
const downloadAd = RewardedAd.createForAdRequest(adUnitId, {
	requestNonPersonalizedAdsOnly: true,
});
const playerAd = RewardedAd.createForAdRequest(adUnitId, {
	requestNonPersonalizedAdsOnly: true,
});

export default function App() {
	const [appReady, setAppReady] = useState(false);
	const [activeTab, setActiveTab] = useState('HOME');
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);

	const [videoData, setVideoData] = useState(null);
	const [downloadedVideos, setDownloadedVideos] = useState([]);
	const [playingVideo, setPlayingVideo] = useState(null);

	const [hasPermission, setHasPermission] = useState(false);
	const [alertConfig, setAlertConfig] = useState({
		visible: false,
		title: '',
		message: '',
	});

	// Ad States
	const [downloadAdLoaded, setDownloadAdLoaded] = useState(false);
	const [playerAdLoaded, setPlayerAdLoaded] = useState(false);

	// Refs
	const currentVideoDataRef = useRef(null);
	const pendingVideoRef = useRef(null);
	const scrollViewRef = useRef(null); // Added for Auto-Scroll

	const showAlert = (title, message) => {
		setAlertConfig({ visible: true, title, message });
	};

	useEffect(() => {
		loadDownloads();

		// --- 1. LAUNCH REWARDED AD LOGIC ---
		const unsubLaunchLoaded = launchAd.addAdEventListener(
			RewardedAdEventType.LOADED,
			() => {
				// Show immediately on launch when ready
				launchAd.show();
			},
		);
		const unsubLaunchReward = launchAd.addAdEventListener(
			RewardedAdEventType.EARNED_REWARD,
			() => {
				setAppReady(true);
			},
		);
		const unsubLaunchError = launchAd.addAdEventListener(
			AdEventType.ERROR,
			() => setAppReady(true), // Fallback to let user in if ad fails
		);
		const unsubLaunchClosed = launchAd.addAdEventListener(
			AdEventType.CLOSED,
			() => setAppReady(true), // Let user in even if they close early
		);
		launchAd.load();

		// --- 2. DOWNLOAD REWARDED AD LOGIC ---
		const unsubDownLoaded = downloadAd.addAdEventListener(
			RewardedAdEventType.LOADED,
			() => setDownloadAdLoaded(true),
		);
		const unsubDownReward = downloadAd.addAdEventListener(
			RewardedAdEventType.EARNED_REWARD,
			() => {
				// User finished the video, trigger the actual download
				startFileDownload(currentVideoDataRef.current);
			},
		);
		const unsubDownError = downloadAd.addAdEventListener(
			AdEventType.ERROR,
			() => setDownloadAdLoaded(false),
		);
		const unsubDownClosed = downloadAd.addAdEventListener(
			AdEventType.CLOSED,
			() => {
				setDownloadAdLoaded(false);
				downloadAd.load(); // Reload for next use
			},
		);
		downloadAd.load();

		// --- 3. PLAYER REWARDED AD LOGIC ---
		const unsubPlayerLoaded = playerAd.addAdEventListener(
			RewardedAdEventType.LOADED,
			() => setPlayerAdLoaded(true),
		);
		const unsubPlayerReward = playerAd.addAdEventListener(
			RewardedAdEventType.EARNED_REWARD,
			() => {
				// If there was a video waiting to play, play it now
				if (pendingVideoRef.current) {
					setPlayingVideo(pendingVideoRef.current);
					pendingVideoRef.current = null;
				}
			},
		);
		const unsubPlayerError = playerAd.addAdEventListener(
			AdEventType.ERROR,
			() => setPlayerAdLoaded(false),
		);
		const unsubPlayerClosed = playerAd.addAdEventListener(
			AdEventType.CLOSED,
			() => {
				setPlayerAdLoaded(false);
				playerAd.load(); // Reload for next use
			},
		);
		playerAd.load();

		return () => {
			unsubLaunchLoaded();
			unsubLaunchReward();
			unsubLaunchError();
			unsubLaunchClosed();
			unsubDownLoaded();
			unsubDownReward();
			unsubDownError();
			unsubDownClosed();
			unsubPlayerLoaded();
			unsubPlayerReward();
			unsubPlayerError();
			unsubPlayerClosed();
		};
	}, []);

	const loadDownloads = async () => {
		try {
			const saved = await AsyncStorage.getItem('@downloaded_videos');
			if (saved) setDownloadedVideos(JSON.parse(saved));
		} catch (e) {
			console.error(e);
		}
	};

	const saveToGallery = async (videoItem, localPath) => {
		try {
			const playablePath =
				Platform.OS === 'android' && !localPath.startsWith('file://')
					? `file://${localPath}`
					: localPath;

			const newEntry = {
				id: Date.now().toString(),
				title: videoItem.title,
				thumbnail: videoItem.thumbnail,
				path: playablePath,
			};
			const updated = [newEntry, ...downloadedVideos];
			setDownloadedVideos(updated);
			await AsyncStorage.setItem('@downloaded_videos', JSON.stringify(updated));
		} catch (e) {
			console.error(e);
		}
	};

	const handleAnalyze = async () => {
		if (!url) return showAlert('Link Required', 'Please paste a link.');
		if (
			url.toLowerCase().includes('youtube.com') ||
			url.toLowerCase().includes('youtu.be')
		) {
			return showAlert(
				'Platform Not Supported',
				'YouTube downloads are not permitted.',
			);
		}

		setLoading(true);
		setVideoData(null);
		setHasPermission(false);
		currentVideoDataRef.current = null;

		try {
			const apiUrl = 'https://download.usesabu.com/api/v1/downloader/extract';
			const response = await axios.post(apiUrl, { url }, { timeout: 25000 });

			setVideoData(response.data);
			currentVideoDataRef.current = response.data;
			setUrl('');

			// Auto-scroll to preview card after a short delay to allow UI render
			setTimeout(() => {
				if (scrollViewRef.current) {
					scrollViewRef.current.scrollToEnd({ animated: true });
				}
			}, 300);
		} catch (error) {
			showAlert('Download Failed', 'Could not download video.');
		} finally {
			setLoading(false);
		}
	};

	const handleDownloadPress = () => {
		if (!currentVideoDataRef.current) return;
		if (!hasPermission) {
			return showAlert(
				'Permission Required',
				'Please confirm permissions first.',
			);
		}

		if (downloadAdLoaded) {
			// Show Rewarded Ad. 'startFileDownload' is called in EARNED_REWARD listener
			downloadAd.show();
		} else {
			// If ad failed to load, don't punish the user, just download
			startFileDownload(currentVideoDataRef.current);
		}
	};

	const startFileDownload = (targetData) => {
		if (!targetData || !targetData.downloadUrl) return;

		const { dirs } = ReactNativeBlobUtil.fs;
		const dirToSave =
			Platform.OS === 'ios' ? dirs.DocumentDir : dirs.DownloadDir;
		const fileName = `Video_${Date.now()}.mp4`;
		const fullPath = `${dirToSave}/${fileName}`;

		showAlert('Downloading', 'Check notification bar for progress.');

		ReactNativeBlobUtil.config({
			fileCache: true,
			addAndroidDownloads: {
				useDownloadManager: true,
				notification: true,
				path: fullPath,
				description: 'Downloading Video',
			},
		})
			.fetch('GET', targetData.downloadUrl)
			.then((res) => {
				showAlert('Success!', 'Video saved to gallery.');
				saveToGallery(targetData, res.path());
				setVideoData(null);
			})
			.catch((err) => showAlert('Download Failed', err.message));
	};

	const handlePlayPress = (item) => {
		if (playerAdLoaded) {
			pendingVideoRef.current = item;
			playerAd.show(); // 'setPlayingVideo' is called in EARNED_REWARD listener
		} else {
			setPlayingVideo(item);
		}
	};

	const handleClosePress = () => {
		setPlayingVideo(null);
		if (playerAdLoaded) {
			// Triggers a rewarded ad on close (Note: No reward action needed here, just the ad view)
			playerAd.show();
		}
	};

	if (!appReady) {
		return (
			<View style={styles.splashContainer}>
				<StatusBar
					barStyle='light-content'
					backgroundColor='#020617'
				/>
				<View style={styles.splashLogoBox}>
					<Image
						source={require('./assets/icon.png')}
						style={styles.splashLogoImage}
						resizeMode='contain'
					/>
					<Text style={styles.splashLogoText}>SaveIt All</Text>
					<Text style={styles.splashSubtitle}>Universal Utility Tool</Text>
				</View>
				<ActivityIndicator
					size='large'
					color='#38BDF8'
					style={{ marginTop: 30 }}
				/>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safeContainer}>
			<StatusBar
				barStyle='light-content'
				backgroundColor='#020617'
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				style={{ flex: 1 }}>
				<ScrollView
					ref={scrollViewRef} // Attached Ref for Auto-Scroll
					contentContainerStyle={styles.scrollContent}
					keyboardShouldPersistTaps='handled'
					showsVerticalScrollIndicator={false}>
					{activeTab === 'HOME' && (
						<View style={styles.centeredWrapper}>
							<View style={styles.logoContainer}>
								<Image
									source={require('./assets/icon.png')}
									style={styles.topLogoImage}
									resizeMode='contain'
								/>
							</View>
							<View style={styles.masterCard}>
								<View style={styles.header}>
									<Text style={styles.appName}>SaveIt All</Text>
									<Text style={styles.subtitle}>Save videos from anywhere</Text>
								</View>
								<View style={styles.inputWrapper}>
									<TextInput
										style={styles.input}
										placeholder='Paste video link here...'
										placeholderTextColor='#64748B'
										value={url}
										onChangeText={setUrl}
										autoCapitalize='none'
									/>
								</View>
								<TouchableOpacity
									style={[
										styles.primaryButton,
										loading && styles.buttonDisabled,
									]}
									onPress={handleAnalyze}
									disabled={loading}
									activeOpacity={0.85}>
									{loading ? (
										<ActivityIndicator color='#fff' />
									) : (
										<Text style={styles.buttonText}>Search Video</Text>
									)}
								</TouchableOpacity>
								<View style={styles.platformSection}>
									<Text style={styles.platformTitle}>
										🌐 Supported Platforms
									</Text>
									<View style={styles.platformChips}>
										{[
											'Instagram',
											'Facebook',
											'Twitter/X',
											'TikTok',
											'Reddit',
											'Twitch',
											'Vimeo',
											'Dailymotion',
										].map((p) => (
											<View
												key={p}
												style={styles.chip}>
												<Text style={styles.chipText}>{p}</Text>
											</View>
										))}
									</View>
									<Text style={styles.supportedExtra}>
										+ many more public video links
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
											style={styles.checkboxContainer}
											onPress={() => setHasPermission(!hasPermission)}
											activeOpacity={0.8}>
											<View
												style={[
													styles.checkbox,
													hasPermission && styles.checkboxChecked,
												]}>
												{hasPermission && (
													<Text style={styles.checkmark}>✓</Text>
												)}
											</View>
											<Text style={styles.checkboxLabel}>
												I confirm I have the owner's permission to download this
												content.
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[
												styles.downloadButton,
												!hasPermission && styles.downloadButtonDisabled,
											]}
											onPress={handleDownloadPress}
											activeOpacity={0.8}>
											<Text style={styles.downloadButtonText}>
												⬇️ Download Video
											</Text>
										</TouchableOpacity>
									</View>
								</View>
							)}
						</View>
					)}

					{activeTab === 'FOLDER' && (
						<View style={styles.libraryContainer}>
							<View style={styles.libraryHeader}>
								<Text style={styles.tabHeaderTitle}>My Library</Text>
								<Text style={styles.libraryCount}>
									{downloadedVideos.length} videos
								</Text>
							</View>
							{downloadedVideos.length === 0 ? (
								<View style={styles.emptyState}>
									<Text style={styles.emptyEmoji}>📭</Text>
									<Text style={styles.emptyTitle}>No videos yet</Text>
									<Text style={styles.emptyText}>
										Downloaded videos will appear here
									</Text>
								</View>
							) : (
								downloadedVideos.map((item) => (
									<TouchableOpacity
										key={item.id}
										style={styles.galleryCard}
										onPress={() => handlePlayPress(item)}
										activeOpacity={0.9}>
										<Image
											source={{ uri: item.thumbnail }}
											style={styles.galleryImage}
										/>
										<View style={styles.galleryInfo}>
											<Text
												style={styles.galleryTitle}
												numberOfLines={2}>
												{item.title}
											</Text>
											<View style={styles.playBadge}>
												<Text style={styles.playBadgeText}>▶ Tap to play</Text>
											</View>
										</View>
									</TouchableOpacity>
								))
							)}
						</View>
					)}
				</ScrollView>
			</KeyboardAvoidingView>

			<View style={styles.permanentDisclaimer}>
				<Text style={styles.permanentDisclaimerText}>
					<Text style={{ fontWeight: '700' }}>Disclaimer:</Text> SaveIt All is
					an independent utility tool. Users are responsible for ensuring they
					have the right to download content.
				</Text>
			</View>

			<View style={styles.bottomTabBar}>
				<TouchableOpacity
					style={styles.tabButton}
					onPress={() => setActiveTab('HOME')}
					activeOpacity={0.7}>
					<View
						style={[
							styles.tabIconWrapper,
							activeTab === 'HOME' && styles.activeTabIconWrapper,
						]}>
						<Text
							style={[
								styles.tabIcon,
								activeTab === 'HOME' && styles.activeTabIcon,
							]}>
							🔍
						</Text>
					</View>
					<Text
						style={[
							styles.tabText,
							activeTab === 'HOME' && styles.activeTabText,
						]}>
						Search
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.tabButton}
					onPress={() => setActiveTab('FOLDER')}
					activeOpacity={0.7}>
					<View
						style={[
							styles.tabIconWrapper,
							activeTab === 'FOLDER' && styles.activeTabIconWrapper,
						]}>
						<Text
							style={[
								styles.tabIcon,
								activeTab === 'FOLDER' && styles.activeTabIcon,
							]}>
							📁
						</Text>
					</View>
					<Text
						style={[
							styles.tabText,
							activeTab === 'FOLDER' && styles.activeTabText,
						]}>
						Library
					</Text>
				</TouchableOpacity>
			</View>

			<Modal
				visible={alertConfig.visible}
				transparent={true}
				animationType='fade'>
				<View style={styles.alertOverlay}>
					<View style={styles.alertCard}>
						<Text style={styles.alertTitle}>{alertConfig.title}</Text>
						<Text style={styles.alertMessage}>{alertConfig.message}</Text>
						<TouchableOpacity
							style={styles.alertButton}
							onPress={() =>
								setAlertConfig({ ...alertConfig, visible: false })
							}>
							<Text style={styles.alertButtonText}>Got it</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			<Modal
				visible={!!playingVideo}
				animationType='slide'
				transparent={false}
				onRequestClose={handleClosePress}>
				<View style={styles.videoPlayerContainer}>
					<TouchableOpacity
						style={styles.closeVideoButton}
						onPress={handleClosePress}
						activeOpacity={0.8}>
						<Text style={styles.closeVideoText}>✕ Close Player</Text>
					</TouchableOpacity>
					{playingVideo && (
						<Video
							style={styles.videoStyle}
							source={{ uri: playingVideo.path }}
							useNativeControls
							resizeMode='contain'
							shouldPlay
						/>
					)}
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	splashContainer: {
		flex: 1,
		backgroundColor: '#020617',
		justifyContent: 'center',
		alignItems: 'center',
	},
	splashLogoBox: { alignItems: 'center' },
	splashLogoImage: { width: 120, height: 120, marginBottom: 20 },
	splashLogoText: {
		fontSize: 44,
		fontWeight: '800',
		color: '#FFFFFF',
		letterSpacing: -1,
		marginBottom: 8,
	},
	splashSubtitle: {
		fontSize: 15,
		color: '#38BDF8',
		fontWeight: '600',
		letterSpacing: 0.5,
	},
	safeContainer: { flex: 1, backgroundColor: '#020617' },
	scrollContent: {
		flexGrow: 1,
		paddingHorizontal: 20,
		paddingTop: 10,
		paddingBottom: 10,
	},
	centeredWrapper: { flex: 1, justifyContent: 'center', paddingBottom: 20 },
	logoContainer: {
		alignItems: 'center',
		marginBottom: 20,
		marginTop: Platform.OS === 'ios' ? 0 : 20,
	},
	topLogoImage: { width: 80, height: 80 },
	masterCard: {
		backgroundColor: '#0F172A',
		borderRadius: 32,
		padding: 28,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.3,
		shadowRadius: 20,
		elevation: 8,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#1E293B',
	},
	header: { alignItems: 'center', marginBottom: 28 },
	appName: {
		fontSize: 32,
		fontWeight: '800',
		color: '#FFFFFF',
		letterSpacing: -0.5,
		marginBottom: 6,
	},
	subtitle: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
	inputWrapper: { width: '100%', marginBottom: 20 },
	input: {
		backgroundColor: '#1E293B',
		borderRadius: 20,
		paddingHorizontal: 20,
		paddingVertical: 16,
		fontSize: 16,
		color: '#FFFFFF',
		fontWeight: '500',
		borderWidth: 1,
		borderColor: '#334155',
	},
	primaryButton: {
		backgroundColor: '#38BDF8',
		borderRadius: 24,
		paddingVertical: 16,
		width: '100%',
		alignItems: 'center',
		shadowColor: '#38BDF8',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 15,
		elevation: 6,
		marginBottom: 24,
	},
	buttonDisabled: { backgroundColor: '#334155', shadowOpacity: 0 },
	buttonText: {
		color: '#0F172A',
		fontSize: 16,
		fontWeight: '800',
		letterSpacing: 0.3,
	},
	platformSection: { width: '100%', marginTop: 8, alignItems: 'center' },
	platformTitle: {
		fontSize: 13,
		fontWeight: '600',
		color: '#94A3B8',
		marginBottom: 12,
		letterSpacing: 0.3,
	},
	platformChips: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		gap: 10,
		marginBottom: 12,
	},
	chip: {
		backgroundColor: '#1E293B',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 30,
		borderWidth: 0.5,
		borderColor: '#334155',
	},
	chipText: { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
	supportedExtra: {
		fontSize: 11,
		color: '#64748B',
		fontWeight: '500',
		marginTop: 4,
	},
	previewCard: {
		backgroundColor: '#0F172A',
		borderRadius: 28,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.3,
		shadowRadius: 20,
		elevation: 8,
		marginTop: 24,
		borderWidth: 1,
		borderColor: '#1E293B',
	},
	previewImage: { width: '100%', height: 210, resizeMode: 'cover' },
	previewContent: { padding: 20 },
	previewTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#FFFFFF',
		marginBottom: 15,
		lineHeight: 22,
		textAlign: 'center',
	},
	checkboxContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#1E293B',
		padding: 12,
		borderRadius: 16,
		marginBottom: 18,
		borderWidth: 1,
		borderColor: '#334155',
	},
	checkbox: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 2,
		borderColor: '#64748B',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	checkboxChecked: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
	checkmark: { color: '#020617', fontSize: 14, fontWeight: '900' },
	checkboxLabel: {
		flex: 1,
		fontSize: 12,
		color: '#CBD5E1',
		lineHeight: 18,
		fontWeight: '500',
	},
	downloadButton: {
		backgroundColor: '#10B981',
		borderRadius: 20,
		paddingVertical: 16,
		alignItems: 'center',
		shadowColor: '#10B981',
		shadowOpacity: 0.3,
		shadowRadius: 10,
	},
	downloadButtonDisabled: { backgroundColor: '#334155', shadowOpacity: 0 },
	downloadButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
	libraryContainer: { flex: 1, paddingBottom: 20 },
	libraryHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'baseline',
		marginBottom: 24,
		marginTop: 8,
	},
	tabHeaderTitle: {
		fontSize: 30,
		fontWeight: '800',
		color: '#FFFFFF',
		letterSpacing: -0.5,
	},
	libraryCount: {
		fontSize: 14,
		color: '#94A3B8',
		fontWeight: '600',
		backgroundColor: '#1E293B',
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 20,
	},
	emptyState: { alignItems: 'center', marginTop: 80 },
	emptyEmoji: { fontSize: 64, marginBottom: 16 },
	emptyTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#F8FAFC',
		marginBottom: 8,
	},
	emptyText: { color: '#64748B', fontSize: 15 },
	galleryCard: {
		flexDirection: 'row',
		backgroundColor: '#0F172A',
		borderRadius: 24,
		padding: 12,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: '#1E293B',
	},
	galleryImage: {
		width: 90,
		height: 90,
		borderRadius: 18,
		resizeMode: 'cover',
	},
	galleryInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
	galleryTitle: {
		fontSize: 15,
		fontWeight: '600',
		color: '#F8FAFC',
		marginBottom: 10,
		lineHeight: 20,
	},
	playBadge: {
		alignSelf: 'flex-start',
		backgroundColor: '#1E293B',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 20,
	},
	playBadgeText: { fontSize: 12, fontWeight: '700', color: '#38BDF8' },
	permanentDisclaimer: {
		backgroundColor: '#020617',
		paddingHorizontal: 15,
		paddingVertical: 12,
		borderTopWidth: 1,
		borderTopColor: '#1E293B',
	},
	permanentDisclaimerText: {
		fontSize: 10,
		color: '#64748B',
		textAlign: 'center',
		lineHeight: 14,
	},
	bottomTabBar: {
		flexDirection: 'row',
		backgroundColor: '#0F172A',
		paddingBottom: Platform.OS === 'android' ? 40 : 35,
		paddingTop: 15,
		borderTopWidth: 1,
		borderTopColor: '#1E293B',
	},
	tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	tabIconWrapper: { padding: 8, borderRadius: 30, marginBottom: 4 },
	activeTabIconWrapper: { backgroundColor: '#1E293B' },
	tabIcon: { fontSize: 24, opacity: 0.5 },
	activeTabIcon: { opacity: 1 },
	tabText: {
		fontSize: 12,
		color: '#64748B',
		fontWeight: '600',
		letterSpacing: 0.3,
	},
	activeTabText: { color: '#38BDF8', fontWeight: '800' },
	alertOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.75)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	alertCard: {
		backgroundColor: '#1E293B',
		width: '100%',
		borderRadius: 24,
		padding: 24,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.5,
		shadowRadius: 20,
		elevation: 10,
		borderWidth: 1,
		borderColor: '#334155',
	},
	alertTitle: {
		fontSize: 20,
		fontWeight: '800',
		color: '#F8FAFC',
		marginBottom: 12,
		textAlign: 'center',
	},
	alertMessage: {
		fontSize: 15,
		color: '#CBD5E1',
		textAlign: 'center',
		lineHeight: 22,
		marginBottom: 24,
	},
	alertButton: {
		backgroundColor: '#38BDF8',
		paddingVertical: 14,
		paddingHorizontal: 30,
		borderRadius: 20,
		width: '100%',
		alignItems: 'center',
	},
	alertButtonText: { color: '#020617', fontSize: 16, fontWeight: '800' },
	videoPlayerContainer: { flex: 1, backgroundColor: '#000000' },
	closeVideoButton: {
		position: 'absolute',
		top: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 10,
		left: 20,
		zIndex: 10,
		backgroundColor: 'rgba(255,255,255,0.1)',
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: 30,
	},
	closeVideoText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
	videoStyle: { flex: 1, width: '100%' },
});
