// ==========================================
// Pure helpers: URL handling, format selection, formatting.
// ==========================================

export const normalizeUrl = (raw = '') => {
	const t = raw.trim();
	if (!t) return '';
	return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

export const isHttpUrl = (raw = '') => /^https?:\/\//i.test(raw.trim());

export const isYouTube = (url = '') => {
	const u = url.toLowerCase();
	return u.includes('youtube.com') || u.includes('youtu.be');
};

// Detect a link that looks like a supported social media post (used for
// clipboard auto-fill so we only offer to paste relevant links).
export const looksLikeSupportedLink = (url = '') => {
	const u = url.toLowerCase();
	if (!isHttpUrl(u) || isYouTube(u)) return false;
	return [
		'tiktok.com',
		'instagram.com',
		'facebook.com',
		'fb.watch',
		'twitter.com',
		'x.com',
		'reddit.com',
	].some((d) => u.includes(d));
};

const isMediaFormat = (f) => {
	if (!f || !f.url) return false;
	const mt = (f.mimeType || '').toLowerCase();
	const url = f.url.toLowerCase();
	if (!(mt.startsWith('video/') || mt.startsWith('image/'))) return false;
	if (url.includes('login') || url.includes('playback1.mp4')) return false;
	if (f.contentLength != null && f.contentLength > 0 && f.contentLength < 30000)
		return false;
	return true;
};

// Rank a format by resolution then size.
const formatScore = (f) =>
	(f.height || 0) * 1_000_000_000 + (f.contentLength || 0);

// Build the download options shown to the user.
//  - TikTok: collapse to ONE clean HD option (prefer the no-watermark file).
//  - Everything else: dedupe and keep every real media format.
export const buildFormats = (media) => {
	const raw = (media?.formats || []).filter(isMediaFormat);
	const seen = new Set();
	const deduped = raw.filter((f) => {
		if (seen.has(f.url)) return false;
		seen.add(f.url);
		return true;
	});

	const isTikTok = (media?.platform || '').toUpperCase() === 'TIKTOK';
	if (isTikTok && deduped.length) {
		const noWatermark = deduped.filter((f) =>
			(f.quality || '').toLowerCase().includes('no watermark'),
		);
		const pool = noWatermark.length ? noWatermark : deduped;
		const best = pool.reduce((a, b) => (formatScore(b) > formatScore(a) ? b : a));
		return [
			{
				...best,
				quality: noWatermark.length ? 'HD · No Watermark' : 'HD',
				_key: '0',
			},
		];
	}

	return deduped.map((f, i) => ({ ...f, _key: `${i}` }));
};

export const humanSize = (bytes) => {
	if (!bytes || bytes <= 0) return null;
	const mb = bytes / 1024 / 1024;
	if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	return `${mb.toFixed(1)} MB`;
};

export const extFor = (fmt) => {
	const mt = (fmt?.mimeType || '').toLowerCase();
	if (mt.includes('image')) return 'jpg';
	if (mt.includes('webm')) return 'webm';
	if (mt.includes('quicktime')) return 'mov';
	return 'mp4';
};

export const qualityLabel = (fmt) => {
	if (fmt?.quality && fmt.quality !== 'Network Capture') return fmt.quality;
	if (fmt?.height) return `${fmt.height}p`;
	return 'Original';
};

export const safeName = (title) => {
	const base = (title || 'media')
		.replace(/[^a-zA-Z0-9-_ ]/g, '')
		.trim()
		.replace(/\s+/g, '_')
		.slice(0, 40);
	return base || 'media';
};
