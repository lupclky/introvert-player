function parseKaraokeMetadata(rawTitle, rawArtist) {
  let text = String(rawTitle || '')
    // Strip prefix tags like [Karaoke...], Karaoke Song Ca |, Karaoke Tone Nam |, Karaoke Beat |, etc.
    .replace(/^\s*\[[^\]]*karaoke[^\]]*\]\s*[-–—|:]?\s*/gi, '')
    .replace(/^\s*karaoke(?:\s*(?:song\s*ca|tone\s*(?:nam|nữ|chuẩn)|beat|beat\s*chuẩn|beat\s*gốc|nhạc\s*sống))?\s*[-–—|:]\s*/gi, '')
    .replace(/^\s*karaoke\s+beat\s*[-–—|:]?\s*/gi, '')
    // Strip suffix tags like | "Album..." Album, | Tone Nam, etc.
    .replace(/\s*[-–—|]\s*["'“][^"'”]+["'”]\s*(?:album|ep|single|ost)?\s*$/gi, '')
    .replace(/\s*[-–—|]\s*(?:tone\s*(?:nam|nữ|song\s*ca|chuẩn)|beat\s*chuẩn|beat\s*gốc|nhạc\s*sống|karaoke|official\s*beat).*$/gi, '')
    .replace(/\s*[\[(][^\])]*(?:karaoke|tone\s*(?:nam|nữ|song\s*ca|chuẩn)|hạ\s*tone|tăng\s*tone|beat\s*(?:chuẩn|gốc|nhạc\s*sống)|nhạc\s*sống)[^\])]*[\])]/gi, '')
    .replace(/\s*[\[(](?:official\s*)?(?:music\s*)?(?:audio|video|lyric(?:s)?|visualizer|mv)[^\])]*[\])]/gi, '')
    .replace(/\s*[\[(](?:vietsub|lyrics?\s*video|audio\s*only)[^\])]*[\])]/gi, '')
    .replace(/\s*[-–—|]\s*(?:official\s*)?(?:audio|lyrics?|visualizer)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let title = text;
  let artist = String(rawArtist || '')
    .replace(/\s*[-–—]\s*(topic|chủ\s*đề)\s*$/i, '')
    .trim();

  const parts = text.split(/\s*[-–—|]\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const isKaraokeChannel = /karaoke|beat|nhac\s*song|instrumental|cover|studio|am\s*thanh|tps/i.test(String(rawArtist || ''));
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
  }

  return { title, artist, original: rawTitle };
}

const testTitles = [
  ['Karaoke Song Ca | EXIT SIGN | HIEUTHUHAI ft. marzuz | "Ai Cũng Phải Bắt Đầu Từ Đâu Đó" Album', 'TPSKara'],
  ['[Karaoke] Mưa Đợi Chờ - Miu Lê | Tone Nữ', 'Karaoke Beat Chuẩn'],
  ['Mưa Đợi Chờ - Miu Lê (Karaoke Beat Gốc)', 'Nhạc Karaoke Hay'],
  ['KARAOKE | Nỗi Nhớ Mang Tên Em - Lương Gia Huy', 'Gia Huy Official'],
  ['Ai Đưa Em Về - TIA x Lê Thiện Hiếu (Karaoke)', 'Beat Karaoke HD'],
  ['Karaoke Beat: Nơi Này Có Anh - Sơn Tùng M-TP', 'Sơn Tùng Karaoke'],
  ['[KARAOKE TONE NỮ] Cắt Đôi Nỗi Sầu - Tăng Duy Tân', 'Karaoke Tone Nữ'],
  ['Mưa Đợi Chờ (Karaoke)', 'Miu Lê - Topic']
];

for (const [t, a] of testTitles) {
  console.log(t, '=>', parseKaraokeMetadata(t, a));
}
