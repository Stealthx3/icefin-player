"""details_check.py — what Enter on an item should open, by the item's type (9.18), for the theme tests.

The engine's details screen (native/icefin/detailsScreen.js) takes the item types in its PLAYABLE and CONTAINER sets;
any other (a book, a photo) keeps jellyfin-web's own details page, styled by the theme's tokens. Which item a theme's
first row starts with depends on the server's data (with an empty Continue Watching and Next Up it is often the newest
book), so a test asks this instead of assuming one or the other.
"""

# Keep in step with PLAYABLE and CONTAINER in native/icefin/detailsScreen.js.
THEMED = ["Movie", "Episode", "Video", "MusicVideo", "Trailer", "Audio",
          "Series", "Season", "MusicAlbum", "MusicArtist", "BoxSet", "Playlist", "Folder", "CollectionFolder", "Person"]

# A promise of {ok, type, themed}: on #/details, the themed screen is up for a themed type, or jellyfin-web's page is
# (no themed route, the page themed by tokens) for any other.
DETAILS_OK = """(async () => {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  const it = id ? await window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), id) : null;
  const want = !!it && %s.includes(it.Type);
  const route = (window.icefinTheme.active() || {}).route;
  const screen = !!document.querySelector('#icefin-theme-root:not([hidden]) .icefin-details');
  const ok = want ? route === '#/details' && screen : route === null && !screen && document.documentElement.classList.contains('icefin-themed');
  return {ok, type: it && it.Type, themed: want};
})()""" % THEMED
