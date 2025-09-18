require("dotenv").config();
const express = require("express");
const app = express();

const API_KEY = process.env.YT_API_KEY;
const PORT = process.env.PORT || 3000;
const YT = "https://www.googleapis.com/youtube/v3";

if (!API_KEY) {
  console.error("ERROR: Missing YT_API_KEY in .env");
  process.exit(1);
}

app.use(express.json());
app.use(express.static("public"));

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`YouTube API error ${r.status}: ${text}`);
  }
  return r.json();
}

// 1) Search channels by text query OR resolve by @handle
app.get("/api/channels", async (req, res) => {
  try {
    const { q, handle } = req.query;

    if (handle) {
      const url = `${YT}/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${API_KEY}`;
      const data = await getJSON(url);
      const items = (data.items || []).map(ch => ({
        channelId: ch.id,
        title: ch.snippet?.title,
        description: ch.snippet?.description,
        thumbnails: ch.snippet?.thumbnails,
        subscriberCount: ch.statistics?.subscriberCount
      }));
      return res.json({ items });
    }

    if (!q) {
      return res.status(400).json({ error: "Provide ?q=channel+name or ?handle=@handle" });
    }

    const url = new URL(`${YT}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "channel");
    url.searchParams.set("maxResults", "25");
    url.searchParams.set("key", API_KEY);

    const data = await getJSON(url);
    const items = (data.items || []).map(it => ({
      channelId: it.id?.channelId,
      title: it.snippet?.channelTitle || it.snippet?.title,
      description: it.snippet?.description,
      thumbnails: it.snippet?.thumbnails
    }));
    res.json({ items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 2) List playlists for a channel
app.get("/api/playlists", async (req, res) => {
  try {
    const { channelId } = req.query;
    if (!channelId) return res.status(400).json({ error: "Provide ?channelId=UC..." });

    const items = [];
    let pageToken;
    do {
      const url = new URL(`${YT}/playlists`);
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("channelId", channelId);
      url.searchParams.set("maxResults", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      url.searchParams.set("key", API_KEY);

      const data = await getJSON(url);
      items.push(
        ...(data.items || []).map(pl => ({
          playlistId: pl.id,
          title: pl.snippet?.title,
          description: pl.snippet?.description,
          thumbnails: pl.snippet?.thumbnails,
          itemCount: pl.contentDetails?.itemCount
        }))
      );
      pageToken = data.nextPageToken;
    } while (pageToken);

    res.json({ items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 3) Search inside a playlist by guest name (title/description)
app.get("/api/playlist-search", async (req, res) => {
  try {
    const { playlistId, q } = req.query;
    if (!playlistId || !q) {
      return res.status(400).json({ error: "Provide ?playlistId=PL...&q=Guest+Name" });
    }

    const all = [];
    let pageToken;
    do {
      const url = new URL(`${YT}/playlistItems`);
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("maxResults", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      url.searchParams.set("key", API_KEY);

      const data = await getJSON(url);
      all.push(...(data.items || []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    const needle = q.toLowerCase();
    const results = all
      .map((it, idx) => ({
        title: it.snippet?.title || "",
        description: it.snippet?.description || "",
        videoId: it.contentDetails?.videoId,
        index: idx + 1
      }))
      .filter(v =>
        v.title.toLowerCase().includes(needle) ||
        v.description.toLowerCase().includes(needle)
      )
      .map(v => ({
        title: v.title,
        url: `https://www.youtube.com/watch?v=${v.videoId}&list=${playlistId}&index=${v.index}`
      }));

    res.json({ count: results.length, results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Running on http://localhost:${PORT}`);
});
