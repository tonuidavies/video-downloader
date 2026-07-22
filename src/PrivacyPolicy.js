// ==========================================
// In-app Privacy Policy — a local document shown in a modal (no website link).
// ==========================================
import React, { useState } from 'react';
import {
	View,
	Text,
	Modal,
	ScrollView,
	TouchableOpacity,
	StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, PRIVACY_POLICY_TEXT } from './constants';

// A tappable "Privacy Policy" label that opens the policy in a full-screen modal.
export function PrivacyLink({ style, label = 'Privacy Policy' }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<TouchableOpacity onPress={() => setOpen(true)}>
				<Text style={style}>{label}</Text>
			</TouchableOpacity>

			<Modal
				visible={open}
				animationType='slide'
				onRequestClose={() => setOpen(false)}>
				<View style={styles.container}>
					<View style={styles.header}>
						<Text style={styles.title}>Privacy Policy</Text>
						<TouchableOpacity onPress={() => setOpen(false)} style={styles.close}>
							<MaterialIcons name='close' size={26} color={COLORS.textMain} />
						</TouchableOpacity>
					</View>
					<ScrollView
						contentContainerStyle={styles.body}
						showsVerticalScrollIndicator={false}>
						<Text style={styles.text}>{PRIVACY_POLICY_TEXT}</Text>
					</ScrollView>
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 44 },
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: COLORS.border,
	},
	title: { color: COLORS.textMain, fontSize: 20, fontWeight: '900' },
	close: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: COLORS.surface,
		justifyContent: 'center',
		alignItems: 'center',
	},
	body: { padding: 20, paddingBottom: 60 },
	text: { color: COLORS.textMain, fontSize: 14, lineHeight: 22 },
});
