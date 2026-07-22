// ==========================================
// Interstitial ad gate (balanced frequency) as a reusable hook.
// ==========================================
import { useCallback, useEffect, useRef, useState } from 'react';
import mobileAds, {
	InterstitialAd,
	AdEventType,
} from 'react-native-google-mobile-ads';
import { INTERSTITIAL_AD_UNIT_ID, INTERSTITIAL_EVERY } from './constants';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
	requestNonPersonalizedAdsOnly: true,
});

/**
 * Returns a `gate(run)` function. Call it with a thunk that performs the
 * actual download. On every Nth call it shows an interstitial and runs the
 * thunk once the ad is dismissed; otherwise it runs the thunk immediately.
 */
export function useInterstitialGate() {
	const [loaded, setLoaded] = useState(false);
	const countRef = useRef(0);
	const pendingRef = useRef(null);

	useEffect(() => {
		try {
			mobileAds().initialize();
		} catch (e) {}

		const onLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () =>
			setLoaded(true),
		);
		const onClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
			setLoaded(false);
			try {
				interstitial.load();
			} catch (e) {}
			const fn = pendingRef.current;
			pendingRef.current = null;
			if (fn) fn();
		});
		const onError = interstitial.addAdEventListener(AdEventType.ERROR, () =>
			setLoaded(false),
		);

		try {
			interstitial.load();
		} catch (e) {}

		return () => {
			onLoaded();
			onClosed();
			onError();
		};
	}, []);

	const gate = useCallback(
		(run) => {
			countRef.current += 1;
			const due = loaded && countRef.current % INTERSTITIAL_EVERY === 0;
			if (due) {
				pendingRef.current = run;
				try {
					interstitial.show();
				} catch (e) {
					pendingRef.current = null;
					run();
				}
			} else {
				run();
			}
		},
		[loaded],
	);

	return { gate };
}
