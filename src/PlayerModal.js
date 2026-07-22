// ==========================================
// Full-screen media player (expo-video).
// Bounded layout keeps the scrubber above the bottom edge so it is easy to drag.
// ==========================================
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from './constants';

export default function PlayerModal({ item, onClose, onShare }) {
	const isImage = item.type === 'image';
	const player = useVideoPlayer(isImage ? null : item.uri, (p) => {
		try {
			p.loop = false;
			p.play();
		} catch (e) {}
	});

	return (
		<View style={styles.container}>
			<StatusBar style='light' hidden />

			{isImage ? (
				<Image
					source={{ uri: item.uri }}
					style={styles.player}
					resizeMode='contain'
				/>
			) : (
				<VideoView
					player={player}
					style={styles.player}
					nativeControls
					contentFit='contain'
					allowsFullscreen
					allowsPictureInPicture
				/>
			)}

			<View style={styles.topBar}>
				<TouchableOpacity onPress={onClose} style={styles.iconBtn}>
					<MaterialIcons name='close' size={26} color='#fff' />
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => onShare(item.uri)}
					style={styles.shareBtn}>
					<MaterialIcons name='share' size={18} color='#fff' />
					<Text style={styles.shareText}>Share</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.infoBar}>
				<Text style={styles.infoTitle} numberOfLines={2}>
					{item.title}
				</Text>
				<Text style={styles.infoMeta}>
					Saved {item.date}
					{item.size ? ` · ${item.size}` : ''}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#000' },
	player: { flex: 1, width: '100%' },
	topBar: {
		position: 'absolute',
		top: 40,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		alignItems: 'center',
	},
	iconBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	shareBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.primaryContainer,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
	},
	shareText: { color: '#fff', fontWeight: '700', marginLeft: 8, fontSize: 15 },
	infoBar: {
		backgroundColor: COLORS.surface,
		paddingHorizontal: 18,
		paddingTop: 14,
		paddingBottom: 30,
	},
	infoTitle: { color: COLORS.textMain, fontWeight: '700', fontSize: 14 },
	infoMeta: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
});
