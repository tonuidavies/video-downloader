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
    StatusBar,
    Modal,
    Dimensions,
    Animated,
    FlatList,
    Alert,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
    TestIds,
} from 'react-native-google-mobile-ads';

// ─── Constants ───────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const GALLERY_COLUMNS = 3;
const GALLERY_SPACING = 4;
const GALLERY_ITEM_SIZE =
    (width - 32 - GALLERY_SPACING * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS;

const STORAGE_KEY = '@downloaded_videos_v2';

const adUnitId = __DEV__
    ? TestIds.REWARDED
    : Platform.OS === 'ios'
        ? 'ca-app-pub-5117316644857484/4813266605'
        : 'ca-app-pub-5117316644857484/7842966656';

const launchAd = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
});
const downloadAd = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
});
const playerAd = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
});

// ─── Video Player Component ─────────────────────────────────────────────────
function VideoPlayerScreen({ video, onClose, onShare }) {
    const player = useVideoPlayer(video.localUri, (p) => {
        p.play();
    });

    return (
        <View style={styles.playerContainer}>
            <View style={styles.playerTopBar}>
                <TouchableOpacity onPress={onClose} style={styles.playerCloseBtn}>
                    <Text style={styles.playerCloseText}>✕ Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onShare(video)}
                    style={styles.playerShareBtn}>
                    <Text style={styles.playerShareText}>Share ↗</Text>
                </TouchableOpacity>
            </View>

            <VideoView
                player={player}
                style={styles.player}
                allowsFullscreen
                allowsPictureInPicture
                nativeControls
            />

            <View style={styles.playerInfoBar}>
                <Text style={styles.playerInfoTitle} numberOfLines={2}>
                    {video.title}
                </Text>
                {video.date && (
                    <Text style={styles.playerInfoDate}>Saved: {video.date}</Text>
                )}
            </View>
        </View>
    );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
    const [appReady, setAppReady] = useState(false);
    const [activeTab, setActiveTab] = useState('HOME');
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const [videoData, setVideoData] = useState(null);
    const [downloadedVideos, setDownloadedVideos] = useState([]);
    const [playingVideo, setPlayingVideo] = useState(null);

    const [hasPermission, setHasPermission] = useState(false);
    const [mediaPermission, setMediaPermission] = useState(null);

    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
    });

    const [downloadAdLoaded, setDownloadAdLoaded] = useState(false);
    const [playerAdLoaded, setPlayerAdLoaded] = useState(false);

    const currentVideoDataRef = useRef(null);
    const pendingVideoRef = useRef(null);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // ── Helpers ──
    const showAlert = useCallback((title, message) => {
        setAlertConfig({ visible: true, title, message });
    }, []);

    // ── Animations ──
    useEffect(() => {
        if (appReady) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }).start();
        }
    }, [appReady]);

    useEffect(() => {
        if (loading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.95,
                        duration: 500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [loading]);

    // ── Permissions ──
    const requestMediaPermissions = useCallback(async () => {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        setMediaPermission(status === 'granted');
        return status === 'granted';
    }, []);

    // ── Persistence ──
    const loadDownloads = useCallback(async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                const verified = [];
                for (const item of parsed) {
                    if (item.localUri) {
                        const info = await FileSystem.getInfoAsync(item.localUri);
                        if (info.exists) {
                            verified.push(item);
                        }
                    }
                }
                setDownloadedVideos(verified);
                if (verified.length !== parsed.length) {
                    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(verified));
                }
            }
        } catch (e) {
            console.error('Failed to load downloads:', e);
        }
    }, []);

    const persistVideos = useCallback(async (videos) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
        } catch (e) {
            console.error('Failed to persist:', e);
        }
    }, []);

    // ── Ad Setup ──
    useEffect(() => {
        loadDownloads();
        requestMediaPermissions();

        const unsubLaunchLoaded = launchAd.addAdEventListener(
            RewardedAdEventType.LOADED,
            () => launchAd.show(),
        );
        const unsubLaunchReward = launchAd.addAdEventListener(
            RewardedAdEventType.EARNED_REWARD,
            () => setAppReady(true),
        );
        const unsubLaunchError = launchAd.addAdEventListener(
            AdEventType.ERROR,
            () => setAppReady(true),
        );
        const unsubLaunchClosed = launchAd.addAdEventListener(
            AdEventType.CLOSED,
            () => setAppReady(true),
        );
        launchAd.load();

        const unsubDownLoaded = downloadAd.addAdEventListener(
            RewardedAdEventType.LOADED,
            () => setDownloadAdLoaded(true),
        );
        const unsubDownReward = downloadAd.addAdEventListener(
            RewardedAdEventType.EARNED_REWARD,
            () => executeDownload(currentVideoDataRef.current),
        );
        const unsubDownError = downloadAd.addAdEventListener(
            AdEventType.ERROR,
            () => setDownloadAdLoaded(false),
        );
        const unsubDownClosed = downloadAd.addAdEventListener(
            AdEventType.CLOSED,
            () => {
                setDownloadAdLoaded(false);
                downloadAd.load();
            },
        );
        downloadAd.load();

        const unsubPlayerLoaded = playerAd.addAdEventListener(
            RewardedAdEventType.LOADED,
            () => setPlayerAdLoaded(true),
        );
        const unsubPlayerReward = playerAd.addAdEventListener(
            RewardedAdEventType.EARNED_REWARD,
            () => {
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
                playerAd.load();
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

    // ── Analyze URL ──
    const handleAnalyze = async () => {
        if (!url) return showAlert('Link Required', 'Please paste a video link.');
        if (
            url.toLowerCase().includes('youtube.com') ||
            url.toLowerCase().includes('youtu.be')
        ) {
            return showAlert('Not Supported', 'YouTube downloads are not permitted.');
        }

        setLoading(true);
        setVideoData(null);
        setHasPermission(false);
        currentVideoDataRef.current = null;

        try {
            const apiUrl =
                'https://download.usesabu.com/api/v1/downloader/extract';
            const response = await axios.post(apiUrl, { url }, { timeout: 25000 });
            setVideoData(response.data);
            currentVideoDataRef.current = response.data;
            setUrl('');
        } catch (error) {
            showAlert('Error', 'Could not extract video. Please check the link.');
        } finally {
            setLoading(false);
        }
    };

    // ── Download ──
    const handleDownloadPress = async () => {
        if (!currentVideoDataRef.current) return;
        if (!hasPermission) {
            return showAlert(
                'Permission Required',
                'Please confirm content permissions first.',
            );
        }

        const granted = await requestMediaPermissions();
        if (!granted) {
            return showAlert(
                'Permission Denied',
                'Media library access is required to save videos.',
            );
        }

        if (downloadAdLoaded) {
            downloadAd.show();
        } else {
            executeDownload(currentVideoDataRef.current);
        }
    };

    const executeDownload = async (targetData) => {
        if (!targetData || !targetData.downloadUrl) return;
        if (downloading) return;

        setDownloading(true);
        setDownloadProgress(0);

        const fileName = `SaveItAll_${Date.now()}.mp4`;
        const tempUri = `${FileSystem.cacheDirectory}${fileName}`;

        try {
            // Step 1: Download to temp cache
            const downloadResumable = FileSystem.createDownloadResumable(
                targetData.downloadUrl,
                tempUri,
                {},
                (progress) => {
                    const pct =
                        progress.totalBytesWritten /
                        progress.totalBytesExpectedToWrite;
                    setDownloadProgress(pct);
                },
            );

            const result = await downloadResumable.downloadAsync();
            if (!result || !result.uri) {
                throw new Error('Download returned no file.');
            }

            // Step 2: Save to device gallery via MediaLibrary
            const asset = await MediaLibrary.createAssetAsync(result.uri);

            // Step 3: Move to named album
            const album = await MediaLibrary.getAlbumAsync('SaveIt All');
            if (album) {
                await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
            } else {
                await MediaLibrary.createAlbumAsync('SaveIt All', asset, false);
            }

            // Step 4: Get permanent local URI
            const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
            const permanentUri = assetInfo.localUri || asset.uri;

            // Step 5: Save metadata with functional state update
            const newEntry = {
                id: Date.now().toString(),
                title: targetData.title || 'Untitled Video',
                thumbnail: targetData.thumbnail || null,
                localUri: permanentUri,
                assetId: asset.id,
                date: new Date().toLocaleDateString(),
                duration: assetInfo.duration || null,
            };

            setDownloadedVideos((prev) => {
                const updated = [newEntry, ...prev];
                persistVideos(updated);
                return updated;
            });

            // Step 6: Clean up temp file
            await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(
                () => {},
            );

            showAlert(
                'Success! 🎉',
                'Video saved to your gallery in the "SaveIt All" album.',
            );
            setVideoData(null);
            currentVideoDataRef.current = null;
        } catch (err) {
            console.error('Download error:', err);
            showAlert('Download Failed', err.message || 'Something went wrong.');
            await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(
                () => {},
            );
        } finally {
            setDownloading(false);
            setDownloadProgress(0);
        }
    };

    // ── Share ──
    const handleShare = async (item) => {
        try {
            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) {
                return showAlert(
                    'Not Available',
                    'Sharing is not available on this device.',
                );
            }

            let uriToShare = item.localUri;

            const info = await FileSystem.getInfoAsync(uriToShare);
            if (!info.exists) {
                if (item.assetId) {
                    const asset = await MediaLibrary.getAssetInfoAsync(item.assetId);
                    if (asset && asset.localUri) {
                        uriToShare = asset.localUri;
                    } else {
                        return showAlert('Error', 'Video file not found on device.');
                    }
                } else {
                    return showAlert('Error', 'Video file not found on device.');
                }
            }

            await Sharing.shareAsync(uriToShare, {
                mimeType: 'video/mp4',
                dialogTitle: 'Share Video',
                UTI: 'public.movie',
            });
        } catch (err) {
            console.error('Share error:', err);
            showAlert('Share Failed', err.message || 'Could not share the video.');
        }
    };

    // ── Play ──
    const handlePlayPress = (item) => {
        if (playerAdLoaded) {
            pendingVideoRef.current = item;
            playerAd.show();
        } else {
            setPlayingVideo(item);
        }
    };

    const handleClosePlayer = () => {
        setPlayingVideo(null);
    };

    // ── Delete ──
    const handleDeleteVideo = (item) => {
        Alert.alert(
            'Remove Video',
            'Remove from library? (The file will remain in your gallery.)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        setDownloadedVideos((prev) => {
                            const updated = prev.filter((v) => v.id !== item.id);
                            persistVideos(updated);
                            return updated;
                        });
                    },
                },
            ],
        );
    };

    // ── Gallery Item ──
    const renderGalleryItem = useCallback(
        ({ item }) => (
            <TouchableOpacity
                style={styles.galleryItem}
                onPress={() => handlePlayPress(item)}
                onLongPress={() => handleDeleteVideo(item)}
                activeOpacity={0.8}>
                {item.thumbnail ? (
                    <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.galleryThumb}
                    />
                ) : (
                    <View
                        style={[styles.galleryThumb, styles.galleryThumbPlaceholder]}>
                        <Text style={styles.galleryPlaceholderIcon}>🎬</Text>
                    </View>
                )}
                <View style={styles.galleryPlayOverlay}>
                    <View style={styles.galleryPlayCircle}>
                        <Text style={styles.galleryPlayIcon}>▶</Text>
                    </View>
                </View>
                {item.duration != null && (
                    <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>
                            {Math.floor(item.duration / 60)}:
                            {String(Math.floor(item.duration % 60)).padStart(2, '0')}
                        </Text>
                    </View>
                )}
                <View style={styles.galleryItemFooter}>
                    <Text style={styles.galleryItemTitle} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <TouchableOpacity
                        style={styles.shareIconBtn}
                        onPress={() => handleShare(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.shareIconText}>↗</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        ),
        [],
    );

    const galleryKeyExtractor = useCallback((item) => item.id, []);

    // ─── SPLASH ──────────────────────────────────────────────────────────────
    if (!appReady) {
        return (
            <View style={styles.splashContainer}>
                <StatusBar barStyle='light-content' backgroundColor='#020617' />
                <Animated.View style={[styles.splashLogoBox, { opacity: fadeAnim }]}>
                    <Image
                        source={require('./assets/icon.png')}
                        style={styles.splashLogo}
                        resizeMode='contain'
                    />
                    <Text style={styles.splashTitle}>SaveIt All</Text>
                    <Text style={styles.splashSubtitle}>Universal Utility Tool</Text>
                </Animated.View>
                <ActivityIndicator
                    size='large'
                    color='#38BDF8'
                    style={{ marginTop: 30 }}
                />
            </View>
        );
    }

    // ─── MAIN RENDER ─────────────────────────────────────────────────────────
    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.safe}>
                <StatusBar barStyle='light-content' backgroundColor='#020617' />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}>
                    {/* ── HOME TAB ── */}
                    {activeTab === 'HOME' && (
                        <Animated.ScrollView
                            contentContainerStyle={styles.homeScroll}
                            keyboardShouldPersistTaps='handled'
                            showsVerticalScrollIndicator={false}
                            style={{ opacity: fadeAnim }}>
                            <View style={styles.logoContainer}>
                                <Image
                                    source={require('./assets/icon.png')}
                                    style={styles.topLogo}
                                    resizeMode='contain'
                                />
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>SaveIt All</Text>
                                <Text style={styles.cardSubtitle}>
                                    Save videos from anywhere
                                </Text>

                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder='Paste video link here...'
                                        placeholderTextColor='#64748B'
                                        value={url}
                                        onChangeText={setUrl}
                                        autoCapitalize='none'
                                        autoCorrect={false}
                                    />
                                </View>

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
                                        disabled={loading}
                                        activeOpacity={0.85}>
                                        {loading ? (
                                            <ActivityIndicator color='#fff' />
                                        ) : (
                                            <Text style={styles.searchBtnText}>
                                                ✨ Search Video
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </Animated.View>

                                <View style={styles.platforms}>
                                    <Text style={styles.platformsLabel}>
                                        🌐 Supported Platforms
                                    </Text>
                                    <View style={styles.chipRow}>
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
                                            <View key={p} style={styles.chip}>
                                                <Text style={styles.chipText}>{p}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    <Text style={styles.chipExtra}>
                                        + many more public video links
                                    </Text>
                                </View>
                            </View>

                            {/* ── Preview Card ── */}
                            {videoData && (
                                <View style={styles.previewCard}>
                                    <Image
                                        source={{ uri: videoData.thumbnail }}
                                        style={styles.previewImg}
                                    />
                                    <View style={styles.previewBody}>
                                        <Text style={styles.previewTitle} numberOfLines={2}>
                                            {videoData.title}
                                        </Text>

                                        <TouchableOpacity
                                            style={styles.checkRow}
                                            onPress={() => setHasPermission(!hasPermission)}
                                            activeOpacity={0.8}>
                                            <View
                                                style={[
                                                    styles.checkBox,
                                                    hasPermission && styles.checkBoxActive,
                                                ]}>
                                                {hasPermission && (
                                                    <Text style={styles.checkMark}>✓</Text>
                                                )}
                                            </View>
                                            <Text style={styles.checkLabel}>
                                                I confirm I have the owner's permission to
                                                download this content.
                                            </Text>
                                        </TouchableOpacity>

                                        {downloading && (
                                            <View style={styles.progressContainer}>
                                                <View style={styles.progressBar}>
                                                    <View
                                                        style={[
                                                            styles.progressFill,
                                                            {
                                                                width: `${Math.round(downloadProgress * 100)}%`,
                                                            },
                                                        ]}
                                                    />
                                                </View>
                                                <Text style={styles.progressText}>
                                                    {Math.round(downloadProgress * 100)}%
                                                </Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                styles.dlBtn,
                                                (!hasPermission || downloading) &&
                                                    styles.dlBtnDisabled,
                                            ]}
                                            onPress={handleDownloadPress}
                                            disabled={!hasPermission || downloading}
                                            activeOpacity={0.8}>
                                            <Text style={styles.dlBtnText}>
                                                {downloading
                                                    ? '⏳ Saving...'
                                                    : '⬇️ Save to Gallery'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </Animated.ScrollView>
                    )}

                    {/* ── GALLERY TAB ── */}
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
                                    <View style={styles.emptyCircle}>
                                        <Text style={styles.emptyEmoji}>🎬</Text>
                                    </View>
                                    <Text style={styles.emptyTitle}>No videos yet</Text>
                                    <Text style={styles.emptySubtitle}>
                                        Download videos and they'll appear here
                                    </Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={downloadedVideos}
                                    renderItem={renderGalleryItem}
                                    keyExtractor={galleryKeyExtractor}
                                    numColumns={GALLERY_COLUMNS}
                                    columnWrapperStyle={styles.galleryRow}
                                    contentContainerStyle={styles.galleryList}
                                    showsVerticalScrollIndicator={false}
                                    ListFooterComponent={
                                        <Text style={styles.galleryHint}>
                                            Long press to remove from library
                                        </Text>
                                    }
                                />
                            )}
                        </View>
                    )}
                </KeyboardAvoidingView>

                {/* ── Disclaimer ── */}
                <View style={styles.disclaimer}>
                    <Text style={styles.disclaimerText}>
                        <Text style={{ fontWeight: '700' }}>Disclaimer:</Text> SaveIt
                        All is an independent utility tool. Users are responsible for
                        ensuring they have the right to download content.
                    </Text>
                </View>

                {/* ── Bottom Tabs ── */}
                <View style={styles.tabBar}>
                    <TouchableOpacity
                        style={styles.tab}
                        onPress={() => setActiveTab('HOME')}
                        activeOpacity={0.7}>
                        <View
                            style={[
                                styles.tabIconWrap,
                                activeTab === 'HOME' && styles.tabIconWrapActive,
                            ]}>
                            <Text
                                style={[
                                    styles.tabEmoji,
                                    activeTab === 'HOME' && styles.tabEmojiActive,
                                ]}>
                                🔍
                            </Text>
                        </View>
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
                        onPress={() => setActiveTab('FOLDER')}
                        activeOpacity={0.7}>
                        <View
                            style={[
                                styles.tabIconWrap,
                                activeTab === 'FOLDER' && styles.tabIconWrapActive,
                            ]}>
                            <Text
                                style={[
                                    styles.tabEmoji,
                                    activeTab === 'FOLDER' && styles.tabEmojiActive,
                                ]}>
                                🖼️
                            </Text>
                        </View>
                        <Text
                            style={[
                                styles.tabLabel,
                                activeTab === 'FOLDER' && styles.tabLabelActive,
                            ]}>
                            Gallery
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── Custom Alert Modal ── */}
                <Modal
                    visible={alertConfig.visible}
                    transparent
                    animationType='fade'>
                    <View style={styles.alertOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
                            <Text style={styles.alertMsg}>{alertConfig.message}</Text>
                            <TouchableOpacity
                                style={styles.alertBtn}
                                onPress={() =>
                                    setAlertConfig({ ...alertConfig, visible: false })
                                }>
                                <Text style={styles.alertBtnText}>Got it</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* ── Video Player Modal ── */}
                <Modal
                    visible={!!playingVideo}
                    animationType='slide'
                    transparent={false}
                    onRequestClose={handleClosePlayer}>
                    {playingVideo && (
                        <VideoPlayerScreen
                            video={playingVideo}
                            onClose={handleClosePlayer}
                            onShare={handleShare}
                        />
                    )}
                </Modal>
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Splash
    splashContainer: {
        flex: 1,
        backgroundColor: '#020617',
        justifyContent: 'center',
        alignItems: 'center',
    },
    splashLogoBox: { alignItems: 'center' },
    splashLogo: { width: 120, height: 120, marginBottom: 20 },
    splashTitle: {
        fontSize: 44,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: -1,
        marginBottom: 8,
    },
    splashSubtitle: {
        fontSize: 15,
        color: '#38BDF8',
        fontWeight: '600',
        letterSpacing: 0.5,
    },

    // Layout
    safe: { flex: 1, backgroundColor: '#020617' },
    homeScroll: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 20,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 16,
        marginTop: Platform.OS === 'ios' ? 0 : 16,
    },
    topLogo: { width: 64, height: 64 },

    // Card
    card: {
        backgroundColor: '#0F172A',
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1E293B',
        shadowColor: '#38BDF8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
    },
    cardTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '500',
        marginBottom: 24,
    },

    // Input
    inputRow: { width: '100%', marginBottom: 16 },
    input: {
        backgroundColor: '#1E293B',
        borderRadius: 18,
        paddingHorizontal: 18,
        paddingVertical: 14,
        fontSize: 15,
        color: '#FFF',
        fontWeight: '500',
        borderWidth: 1.5,
        borderColor: '#334155',
    },

    // Search button
    searchBtn: {
        backgroundColor: '#38BDF8',
        borderRadius: 22,
        paddingVertical: 15,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#38BDF8',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
        marginBottom: 20,
    },
    searchBtnDisabled: { backgroundColor: '#334155', shadowOpacity: 0 },
    searchBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '800' },

    // Platforms
    platforms: { width: '100%', alignItems: 'center' },
    platformsLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: 10,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    chip: {
        backgroundColor: '#1E293B',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: '#334155',
    },
    chipText: { fontSize: 11, fontWeight: '600', color: '#CBD5E1' },
    chipExtra: { fontSize: 10, color: '#64748B', fontWeight: '500' },

    // Preview
    previewCard: {
        backgroundColor: '#0F172A',
        borderRadius: 24,
        overflow: 'hidden',
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#1E293B',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
    },
    previewImg: { width: '100%', height: 200, resizeMode: 'cover' },
    previewBody: { padding: 18 },
    previewTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFF',
        marginBottom: 14,
        lineHeight: 21,
        textAlign: 'center',
    },

    // Checkbox
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E293B',
        padding: 12,
        borderRadius: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    checkBox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#64748B',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    checkBoxActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
    checkMark: { color: '#020617', fontSize: 14, fontWeight: '900' },
    checkLabel: {
        flex: 1,
        fontSize: 11,
        color: '#CBD5E1',
        lineHeight: 16,
        fontWeight: '500',
    },

    // Progress
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        gap: 10,
    },
    progressBar: {
        flex: 1,
        height: 8,
        backgroundColor: '#1E293B',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#10B981',
        width: 40,
        textAlign: 'right',
    },

    // Download button
    dlBtn: {
        backgroundColor: '#10B981',
        borderRadius: 18,
        paddingVertical: 15,
        alignItems: 'center',
        shadowColor: '#10B981',
        shadowOpacity: 0.4,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 6,
    },
    dlBtnDisabled: { backgroundColor: '#334155', shadowOpacity: 0 },
    dlBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

    // Gallery
    galleryContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    galleryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    galleryHeaderTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: -0.5,
    },
    countBadge: {
        backgroundColor: '#38BDF8',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countText: { fontSize: 13, color: '#020617', fontWeight: '800' },
    galleryList: { paddingBottom: 20 },
    galleryRow: { gap: GALLERY_SPACING, marginBottom: GALLERY_SPACING },
    galleryItem: {
        width: GALLERY_ITEM_SIZE,
        backgroundColor: '#0F172A',
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#1E293B',
    },
    galleryThumb: {
        width: '100%',
        height: GALLERY_ITEM_SIZE,
        resizeMode: 'cover',
    },
    galleryThumbPlaceholder: {
        backgroundColor: '#1E293B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    galleryPlaceholderIcon: { fontSize: 28 },
    galleryPlayOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: GALLERY_ITEM_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    galleryPlayCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(56,189,248,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    galleryPlayIcon: { color: '#FFF', fontSize: 14, marginLeft: 2 },
    durationBadge: {
        position: 'absolute',
        top: GALLERY_ITEM_SIZE - 24,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    durationText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
    galleryItemFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    galleryItemTitle: {
        flex: 1,
        fontSize: 10,
        fontWeight: '600',
        color: '#F8FAFC',
        lineHeight: 14,
    },
    shareIconBtn: { padding: 4 },
    shareIconText: { fontSize: 14, color: '#38BDF8', fontWeight: '700' },
    galleryHint: {
        textAlign: 'center',
        fontSize: 10,
        color: '#475569',
        marginTop: 12,
        fontStyle: 'italic',
        paddingBottom: 10,
    },

    // Empty
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#1E293B',
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#F8FAFC',
        marginBottom: 6,
    },
    emptySubtitle: {
        color: '#64748B',
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 40,
    },

    // Disclaimer
    disclaimer: {
        backgroundColor: '#020617',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#1E293B',
    },
    disclaimerText: {
        fontSize: 9,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 13,
    },

    // Tab bar
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#0F172A',
        paddingBottom: Platform.OS === 'android' ? 36 : 30,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#1E293B',
    },
    tab: { flex: 1, alignItems: 'center' },
    tabIconWrap: { padding: 6, borderRadius: 24, marginBottom: 3 },
    tabIconWrapActive: { backgroundColor: '#1E293B' },
    tabEmoji: { fontSize: 22, opacity: 0.4 },
    tabEmojiActive: { opacity: 1 },
    tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    tabLabelActive: { color: '#38BDF8', fontWeight: '800' },

    // Alert
    alertOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    alertBox: {
        backgroundColor: '#1E293B',
        width: '100%',
        borderRadius: 22,
        padding: 22,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    alertTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#F8FAFC',
        marginBottom: 10,
        textAlign: 'center',
    },
    alertMsg: {
        fontSize: 14,
        color: '#CBD5E1',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    alertBtn: {
        backgroundColor: '#38BDF8',
        paddingVertical: 13,
        paddingHorizontal: 28,
        borderRadius: 18,
        width: '100%',
        alignItems: 'center',
    },
    alertBtnText: { color: '#020617', fontSize: 15, fontWeight: '800' },

    // Player
    playerContainer: { flex: 1, backgroundColor: '#000' },
    playerTopBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 12,
        paddingHorizontal: 16,
        paddingBottom: 10,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    playerCloseBtn: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    playerCloseText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
    playerShareBtn: {
        backgroundColor: 'rgba(56,189,248,0.25)',
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(56,189,248,0.4)',
    },
    playerShareText: { color: '#38BDF8', fontWeight: '700', fontSize: 13 },
    player: { flex: 1, width: '100%' },
    playerInfoBar: {
        backgroundColor: '#0F172A',
        paddingHorizontal: 16,
        paddingVertical: 14,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    playerInfoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#F8FAFC',
        lineHeight: 20,
    },
    playerInfoDate: {
        fontSize: 11,
        color: '#64748B',
        marginTop: 4,
        fontWeight: '500',
    },
});