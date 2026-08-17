async function main() {
  const res = await fetch('https://lrclib.net/api/get/23866170');
  const data = await res.json();
  console.log(data.syncedLyrics);
}
main();
