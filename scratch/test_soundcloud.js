const https = require('https');

const url = 'https://soundcloud.com/minh-qu-n-o-n-302162036/kho-c-cu-ng-em-remix-1-hours';

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
}, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
        console.log("Status:", res.statusCode);
        console.log("Length:", html.length);
        
        // Let's dump all script tags
        const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        console.log("Total script tags:", scriptTags.length);
        
        // Find if there is any script containing sound or track or duration
        scriptTags.forEach((tag, idx) => {
            if (tag.includes('duration') || tag.includes('hydration') || tag.includes('minh-qu-n')) {
                console.log(`Script[${idx}] (length ${tag.length}):`, tag.slice(0, 1000) + (tag.length > 1000 ? '...' : ''));
            }
        });

        // Check if there are schema.org meta tags or other elements
        const metaTags = html.match(/<meta[^>]+>/gi) || [];
        metaTags.forEach((tag, idx) => {
            if (tag.toLowerCase().includes('duration') || tag.toLowerCase().includes('time') || tag.toLowerCase().includes('audio')) {
                console.log(`Meta[${idx}]:`, tag);
            }
        });
    });
}).on('error', (err) => {
    console.error("Error:", err);
});
