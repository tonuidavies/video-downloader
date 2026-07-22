// ==========================================
// First-run consent / rights acknowledgment gate.
// ==========================================
import React from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from './ui';
import { COLORS, APP_NAME, DISCLAIMER, PRIVACY_POLICY_URL } from './constants';

export default function ConsentGate({ logo, onAccept }) {
	return (
		<SafeAreaView style={styles.container}>
			<StatusBar style='light' />
			<View style={styles.inner}>
				<Logo source={logo} size={92} />
				<Text style={styles.title}>{APP_NAME}</Text>
				<Text style={styles.sub}>Save the videos you have the right to keep</Text>

				<View style={styles.card}>
					<Text style={styles.body}>{DISCLAIMER}</Text>
				</View>

				<Text style={styles.fine}>
					By continuing you confirm you are 18+ and will only download content
					you own or have permission to save.
				</Text>

				<TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
					<Text style={styles.link}>Privacy Policy</Text>
				</TouchableOpacity>

				<TouchableOpacity
					activeOpacity={0.85}
					onPress={onAccept}
					style={{ width: '100%', marginTop: 20 }}>
					<LinearGradient
						colors={[COLORS.primaryContainer, COLORS.secondary]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={styles.btn}>
						<MaterialIcons name='verified-user' size={20} color='#fff' />
						<Text style={styles.btnText}>I Understand & Agree</Text>
					</LinearGradient>
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background },
	inner: {
		flex: 1,
		paddingHorizontal: 28,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {
		fontSize: 28,
		fontWeight: '900',
		color: COLORS.textMain,
		letterSpacing: 0.5,
		marginTop: 18,
	},
	sub: { color: COLORS.textDim, fontSize: 14, marginTop: 6, textAlign: 'center' },
	card: {
		backgroundColor: COLORS.surface,
		borderRadius: 18,
		padding: 20,
		marginTop: 26,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	body: { color: COLORS.textMain, fontSize: 14, lineHeight: 22 },
	fine: {
		color: COLORS.textDim,
		fontSize: 12,
		lineHeight: 18,
		textAlign: 'center',
		marginTop: 18,
	},
	link: {
		color: COLORS.tertiary,
		fontSize: 13,
		fontWeight: '700',
		marginTop: 14,
		textDecorationLine: 'underline',
	},
	btn: {
		height: 54,
		borderRadius: 16,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
	},
	btnText: { color: '#fff', fontSize: 16, fontWeight: '800', marginLeft: 8 },
});
