// ==========================================
// Library: gallery grid with summary, filters and in-feed banner ads.
// ==========================================
import React, { useState } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	FlatList,
	StyleSheet,
	Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import {
	COLORS,
	CARD_W,
	H_PAD,
	LIB_AD_EVERY_ROWS,
	BANNER_AD_UNIT_ID,
} from './constants';
import { humanSize } from './utils';
import { Thumb } from './ui';

export default function LibraryScreen({ items, onOpenSettings, onOpen, onShare, onRemove }) {
	const [filter, setFilter] = useState('ALL');

	const totalBytes = items.reduce((s, i) => s + (i.bytes || 0), 0);
	const videoCount = items.filter((i) => i.type !== 'image').length;
	const imageCount = items.filter((i) => i.type === 'image').length;

	const filtered = items.filter((i) =>
		filter === 'ALL'
			? true
			: filter === 'VIDEO'
				? i.type !== 'image'
				: i.type === 'image',
	);

	// Chunk into pair-rows and inject a banner every few rows.
	const rows = [];
	for (let i = 0; i < filtered.length; i += 2)
		rows.push({ type: 'pair', key: `p${i}`, items: filtered.slice(i, i + 2) });
	const data = [];
	rows.forEach((r, idx) => {
		data.push(r);
		if ((idx + 1) % LIB_AD_EVERY_ROWS === 0 && idx !== rows.length - 1)
			data.push({ type: 'ad', key: `ad${idx}` });
	});

	const longPress = (item) =>
		Alert.alert(item.title || 'Item', 'Choose an action', [
			{ text: 'Play', onPress: () => onOpen(item) },
			{ text: 'Share', onPress: () => onShare(item.uri) },
			{ text: 'Remove', style: 'destructive', onPress: () => onRemove(item) },
			{ text: 'Cancel', style: 'cancel' },
		]);

	const Card = (item) => (
		<TouchableOpacity
			key={item.id}
			style={styles.card}
			activeOpacity={0.9}
			onPress={() => onOpen(item)}
			onLongPress={() => longPress(item)}>
			<View style={styles.thumbWrap}>
				<Thumb
					uri={item.thumbnail || item.uri}
					style={styles.thumb}
					icon={item.type === 'image' ? 'image' : 'movie'}
				/>
				<LinearGradient
					colors={['transparent', 'rgba(0,0,0,0.8)']}
					style={styles.overlay}
				/>
				<View style={styles.play}>
					<MaterialIcons
						name={item.type === 'image' ? 'image' : 'play-arrow'}
						size={22}
						color='#fff'
					/>
				</View>
				{!!item.size && (
					<View style={styles.sizeChip}>
						<Text style={styles.sizeText}>{item.size}</Text>
					</View>
				)}
			</View>
			<Text style={styles.cardTitle} numberOfLines={1}>
				{item.title}
			</Text>
			<Text style={styles.cardDate}>{item.date}</Text>
		</TouchableOpacity>
	);

	const Chip = ({ id, label }) => {
		const active = filter === id;
		return (
			<TouchableOpacity
				onPress={() => setFilter(id)}
				activeOpacity={0.8}
				style={[styles.chip, active && styles.chipOn]}>
				<Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
			</TouchableOpacity>
		);
	};

	const header = (
		<View>
			<View style={styles.summary}>
				<View style={styles.summaryItem}>
					<Text style={styles.summaryNum}>{items.length}</Text>
					<Text style={styles.summaryLabel}>Items</Text>
				</View>
				<View style={styles.summaryDivider} />
				<View style={styles.summaryItem}>
					<Text style={styles.summaryNum}>{humanSize(totalBytes) || '0 MB'}</Text>
					<Text style={styles.summaryLabel}>Total size</Text>
				</View>
				<View style={styles.summaryDivider} />
				<View style={styles.summaryItem}>
					<Text style={styles.summaryNum}>{videoCount}</Text>
					<Text style={styles.summaryLabel}>Videos</Text>
				</View>
			</View>
			<View style={styles.chipRow}>
				<Chip id='ALL' label={`All (${items.length})`} />
				<Chip id='VIDEO' label={`Videos (${videoCount})`} />
				<Chip id='IMAGE' label={`Images (${imageCount})`} />
			</View>
		</View>
	);

	const renderRow = ({ item: row }) => {
		if (row.type === 'ad') {
			return (
				<View style={styles.inFeedAd}>
					<BannerAd
						unitId={BANNER_AD_UNIT_ID}
						size={BannerAdSize.MEDIUM_RECTANGLE}
						requestOptions={{ requestNonPersonalizedAdsOnly: true }}
					/>
				</View>
			);
		}
		return (
			<View style={styles.row}>
				{row.items.map(Card)}
				{row.items.length === 1 && <View style={{ width: CARD_W }} />}
			</View>
		);
	};

	return (
		<View style={styles.container}>
			<View style={styles.headerBar}>
				<Text style={styles.headerTitle}>My Library</Text>
				<TouchableOpacity style={styles.settingsIcon} onPress={onOpenSettings}>
					<MaterialIcons name='settings' size={22} color={COLORS.textDim} />
				</TouchableOpacity>
			</View>

			{items.length === 0 ? (
				<View style={styles.empty}>
					<MaterialIcons
						name='video-library'
						size={80}
						color={COLORS.surfaceHighlight}
					/>
					<Text style={styles.emptyTitle}>No files yet</Text>
					<Text style={styles.emptySub}>
						Paste a link on the Home tab and your saved media appears here.
					</Text>
				</View>
			) : (
				<FlatList
					data={data}
					keyExtractor={(r) => r.key}
					renderItem={renderRow}
					ListHeaderComponent={header}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: 24 }}
					ListFooterComponent={
						<Text style={styles.hint}>
							Long-press an item to play, share, or remove it.
						</Text>
					}
					ListEmptyComponent={
						<Text style={styles.hint}>Nothing in this filter yet.</Text>
					}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, paddingHorizontal: H_PAD, paddingTop: 10 },
	headerBar: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	headerTitle: {
		fontSize: 28,
		fontWeight: '900',
		color: COLORS.textMain,
		letterSpacing: -0.5,
	},
	settingsIcon: { backgroundColor: COLORS.surface, padding: 10, borderRadius: 12 },

	summary: {
		flexDirection: 'row',
		backgroundColor: COLORS.glassBg,
		borderRadius: 18,
		paddingVertical: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: 16,
	},
	summaryItem: { flex: 1, alignItems: 'center' },
	summaryNum: { color: COLORS.textMain, fontSize: 18, fontWeight: '900' },
	summaryLabel: { color: COLORS.textDim, fontSize: 11, marginTop: 3 },
	summaryDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

	chipRow: { flexDirection: 'row', marginBottom: 16 },
	chip: {
		paddingHorizontal: 16,
		paddingVertical: 9,
		borderRadius: 20,
		backgroundColor: COLORS.surface,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginRight: 10,
	},
	chipOn: { backgroundColor: COLORS.primaryContainer, borderColor: COLORS.primaryContainer },
	chipText: { color: COLORS.textDim, fontSize: 12, fontWeight: '700' },
	chipTextOn: { color: '#fff' },

	row: { flexDirection: 'row', justifyContent: 'space-between' },
	card: { width: CARD_W, marginBottom: 18 },
	thumbWrap: {
		width: CARD_W,
		height: CARD_W * 1.25,
		borderRadius: 18,
		overflow: 'hidden',
		backgroundColor: COLORS.surface,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	thumb: { width: '100%', height: '100%' },
	overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
	play: {
		position: 'absolute',
		top: 10,
		left: 10,
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: 'rgba(0,0,0,0.45)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	sizeChip: {
		position: 'absolute',
		bottom: 10,
		right: 10,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 8,
		backgroundColor: 'rgba(0,0,0,0.6)',
	},
	sizeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
	cardTitle: { color: COLORS.textMain, fontSize: 13, fontWeight: '700', marginTop: 8 },
	cardDate: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },

	inFeedAd: {
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 18,
		paddingVertical: 8,
		backgroundColor: COLORS.surface,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	hint: {
		color: COLORS.textDim,
		fontSize: 12,
		textAlign: 'center',
		marginTop: 8,
	},
	empty: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingBottom: 80,
		paddingHorizontal: 20,
	},
	emptyTitle: {
		color: COLORS.textMain,
		fontSize: 20,
		fontWeight: '800',
		marginTop: 16,
	},
	emptySub: {
		color: COLORS.textDim,
		fontSize: 14,
		marginTop: 8,
		textAlign: 'center',
		lineHeight: 20,
	},
});
