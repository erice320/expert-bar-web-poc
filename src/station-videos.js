/**
 * Station Interact playlists — Rev.io HQ YouTube embeds (no local video files).
 * Station keys: a = Billing/payments, d = Tickets/support.
 */
export const STATION_VIDEOS = {
  a: {
    title: 'Billing / payments',
    videos: [
      { id: 'DZ8BU0gtNIM', title: 'Automated Billing', length: '~1m' },
      { id: '4zrvt0hs8Bs', title: 'Rev.io Payments', length: '~1m' },
      { id: 'kmzrY_O12_8', title: 'Problems we solve for finance and billing', length: '~2m' },
    ],
  },
  d: {
    title: 'Tickets / support',
    videos: [
      { id: 'h-R-0czb7MI', title: 'How to Create & Assign Tickets feat. Revii', length: '~6m' },
      { id: 'UWeo2UPbD7M', title: 'Ticket Management & Custom Views', length: '~4m' },
      { id: 'LS8iM-UWRE4', title: 'How Technicians Work Tickets', length: '~6m' },
    ],
  },
};

/** Build a privacy-enhanced YouTube embed URL for a video + optional playlist of the rest. */
export function embedUrl(videoId, playlistIds = []) {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (playlistIds.length) params.set('playlist', playlistIds.join(','));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function getStationPlaylist(stationKey) {
  const key = String(stationKey || '').toLowerCase();
  return STATION_VIDEOS[key] || null;
}
