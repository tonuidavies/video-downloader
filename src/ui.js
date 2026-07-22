// ==========================================
// Small shared UI pieces: Thumb, Logo, AnchoredBanner.
// ==========================================
import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { COLORS, BANNER_AD_UNIT_ID } from './constants';

// Thumbnail with graceful fallback (remote thumbs can expire / fail to load).
export const Thumb = React.memo(function Thumb({
	uri,
	style,
	iconSize = 30,
	icon = 'movie',
}) {
	const [err, setErr] = useState(false);
	if (!uri || err) {
		return (
			<LinearGradient
				colors={[COLORS.surfaceHighlight, COLORS.surface]}
				style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
				<MaterialIcons name={icon} size={iconSize} color={COLORS.textDim} />
			</LinearGradient>
		);
	}
	return (
		<Image
			source={{ uri }}
			style={style}
			onError={() => setErr(true)}
			resizeMode='cover'
		/>
	);
});

// Creative app-icon badge: the real app icon framed in a glowing gradient ring.
export function Logo({ source, size = 88 }) {
	const ring = size / 2 + 8;
	return (
		<View style={styles.logoWrap}>
			<LinearGradient
				colors={[COLORS.primaryContainer, COLORS.secondary, COLORS.tertiary]}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={[styles.logoRing, { borderRadius: ring }]}>
				<View style={[styles.logoInner, { borderRadius: ring - 3 }]}>
					{source ? (
						<Image
							source={source}
							style={{ width: size, height: size, borderRadius: size / 4 }}
							resizeMode='cover'
						/>
					) : (
						<MaterialIcons name='download' size={size * 0.6} color='#fff' />
					)}
				</View>
			</LinearGradient>
		</View>
	);
}

// Persistent anchored banner.
export function AnchoredBanner() {
	return (
		<View style={styles.bottomBanner}>
			<BannerAd
				unitId={BANNER_AD_UNIT_ID}
				size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
				requestOptions={{ requestNonPersonalizedAdsOnly: true }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	logoWrap: {
		alignItems: 'center',
		shadowColor: COLORS.primaryContainer,
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.6,
		shadowRadius: 18,
		elevation: 10,
	},
	logoRing: { padding: 3 },
	logoInner: {
		backgroundColor: COLORS.background,
		padding: 5,
		justifyContent: 'center',
		alignItems: 'center',
	},
	bottomBanner: {
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: COLORS.background,
		borderTopWidth: 1,
		borderTopColor: COLORS.border,
	},
});
