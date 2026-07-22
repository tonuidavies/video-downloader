// ==========================================
// Backend extraction call.
// ==========================================

// Resolves to the `media` object on success, or throws an Error with a
// user-friendly message on failure.
export const extractMedia = async (apiUrl, url, { timeoutMs = 45000 } = {}) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response;
	try {
		response = await fetch(apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url }),
			signal: controller.signal,
		});
	} catch (e) {
		clearTimeout(timer);
		throw new Error(
			e.name === 'AbortError'
				? 'Request timed out. Check your server connection in Settings.'
				: 'Cannot reach the server. Check the address in Settings.',
		);
	}
	clearTimeout(timer);

	const raw = await response.text();
	let data;
	try {
		data = JSON.parse(raw);
	} catch (e) {
		throw new Error('The server returned an unexpected response.');
	}

	if (!response.ok || !data.success || !data.media) {
		throw new Error(data?.message || 'Could not find any media at that link.');
	}
	return data.media;
};
