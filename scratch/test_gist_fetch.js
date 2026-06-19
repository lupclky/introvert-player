const url = 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json';

async function testFetch() {
    const cacheBusterUrl = url.trim() + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    console.log("Fetching: " + cacheBusterUrl);
    try {
        const response = await fetch(cacheBusterUrl);
        console.log("Status: " + response.status + " " + response.statusText);
        if (response.ok) {
            const text = await response.text();
            console.log("--- RAW CONTENT ---");
            console.log(text);
            console.log("--- END RAW CONTENT ---");
            const data = JSON.parse(text);
            console.log("Data parsed successfully!");
        } else {
            console.log("Failed to load");
        }
    } catch (e) {
        console.error("Error: " + e.message);
    }
}

testFetch();
