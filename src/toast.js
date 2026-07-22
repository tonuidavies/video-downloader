// ==========================================
// Tiny cross-platform toast helper.
// ==========================================
import { Platform, ToastAndroid, Alert } from 'react-native';
import { APP_NAME } from './constants';

export const toast = (msg) => {
	if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
	else Alert.alert(APP_NAME, msg);
};
