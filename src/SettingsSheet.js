// ==========================================
// Settings bottom sheet: backend address + legal.
// ==========================================
import React, { useEffect, useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	Modal,
	ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PrivacyLink } from './PrivacyPolicy';
import { COLORS, DISCLAIMER, DEFAULT_HOST, DEFAULT_PORT } from './constants';

export default function SettingsSheet({ visible, host, port, onClose, onSave }) {
	const [draftHost, setDraftHost] = useState(host);
	const [draftPort, setDraftPort] = useState(port);

	// Keep drafts in sync whenever the sheet re-opens.
	useEffect(() => {
		if (visible) {
			setDraftHost(host);
			setDraftPort(port);
		}
	}, [visible, host, port]);

	return (
		<Modal
			visible={visible}
			animationType='slide'
			transparent
			onRequestClose={onClose}>
			<View style={styles.backdrop}>
				<ScrollView
					style={{ flexGrow: 0 }}
					contentContainerStyle={styles.card}
					keyboardShouldPersistTaps='handled'>
					<View style={styles.header}>
						<Text style={styles.title}>Settings</Text>
						<TouchableOpacity onPress={onClose}>
							<MaterialIcons name='close' size={26} color={COLORS.textMain} />
						</TouchableOpacity>
					</View>

					<Text style={styles.label}>Server address</Text>
					<TextInput
						style={styles.input}
						value={draftHost}
						onChangeText={setDraftHost}
						placeholder={DEFAULT_HOST}
						placeholderTextColor={COLORS.textDim}
						autoCapitalize='none'
						autoCorrect={false}
						keyboardType='numbers-and-punctuation'
					/>

					<Text style={styles.label}>Port</Text>
					<TextInput
						style={styles.input}
						value={draftPort}
						onChangeText={setDraftPort}
						placeholder={DEFAULT_PORT}
						placeholderTextColor={COLORS.textDim}
						keyboardType='number-pad'
					/>

					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() =>
							onSave(
								(draftHost || '').trim() || DEFAULT_HOST,
								(draftPort || '').trim() || DEFAULT_PORT,
							)
						}>
						<LinearGradient
							colors={[COLORS.primaryContainer, COLORS.secondary]}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 0 }}
							style={styles.save}>
							<Text style={styles.saveText}>Save</Text>
						</LinearGradient>
					</TouchableOpacity>

					<View style={styles.divider} />
					<Text style={styles.aboutTitle}>About & Legal</Text>
					<Text style={styles.about}>{DISCLAIMER}</Text>
					<PrivacyLink style={styles.link} />
				</ScrollView>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'flex-end',
	},
	card: {
		backgroundColor: COLORS.surface,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		padding: 24,
		paddingBottom: 40,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	title: { color: COLORS.textMain, fontSize: 22, fontWeight: '900' },
	label: {
		color: COLORS.textDim,
		fontSize: 13,
		fontWeight: '700',
		marginBottom: 8,
		marginTop: 12,
	},
	input: {
		backgroundColor: COLORS.background,
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 12,
		color: COLORS.textMain,
		fontSize: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	save: {
		height: 50,
		borderRadius: 14,
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 22,
	},
	saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
	divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 22 },
	aboutTitle: {
		color: COLORS.textMain,
		fontSize: 15,
		fontWeight: '800',
		marginBottom: 10,
	},
	about: { color: COLORS.textDim, fontSize: 13, lineHeight: 20 },
	link: {
		color: COLORS.tertiary,
		fontSize: 13,
		fontWeight: '700',
		marginTop: 14,
		textDecorationLine: 'underline',
	},
});
