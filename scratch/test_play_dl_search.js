const play = require('play-dl');

async function testPlayDlSearch(query) {
  console.time('play-dl search');
  const results = await play.search(query, { limit: 15 });
  console.timeEnd('play-dl search');
  return results;
}

testPlayDlSearch('alan walker faded').then(results => {
  console.log(`Found ${results.length} results.`);
  if (results.length > 0) {
    const first = results[0];
    console.log("First Result Sample:");
    console.log("- ID:", first.id);
    console.log("- Title:", first.title);
    console.log("- Thumbnail:", first.thumbnails?.[0]?.url || first.thumbnail?.url);
    console.log("- Duration:", first.durationRaw || first.durationInSec);
    console.log("- Author/Channel:", first.channel?.name);
    console.log("- Views:", first.views);
    console.log("- Keys:", Object.keys(first));
  }
}).catch(err => {
  console.error("Search Error:", err);
});
