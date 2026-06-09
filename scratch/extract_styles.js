const fs = require('fs');
const path = require('path');

const overlayPath = 'D:/zypage_player/overlay.html';
const styleDestPath = 'D:/zypage_player/landing/style.css';

// Read overlay.html
const htmlContent = fs.readFileSync(overlayPath, 'utf8');

// Extract content between <style> and </style>
const styleRegex = /<style>([\s\S]*?)<\/style>/;
const match = htmlContent.match(styleRegex);

if (!match) {
    console.error('No style block found in overlay.html');
    process.exit(1);
}

let overlayStyles = match[1];

// Use CSS nesting wrapper to perfectly scope all styles inside #theme-preview-container
// Replace "body.theme-" with "&.theme-"
overlayStyles = overlayStyles.replace(/body\.theme-/g, '&.theme-');
// Replace ":root" variables declaration to "&" so they belong to the container
overlayStyles = overlayStyles.replace(/:root/g, '&');

// Wrap everything in a native CSS nesting block
const scopedOverlayStyles = `
#theme-preview-container {
${overlayStyles}
}
`;

// Base landing page styles
const landingStyles = `/* Cute Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&family=Quicksand:wght@300..700&display=swap');

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --brand-bg: #FFFDF0;
    --brand-text: #2B1810;
    --brand-yellow: #FFE169;
    --brand-yellow-dark: #F2C14E;
    --brand-green: #4ADE80;
    --brand-blue: #60A5FA;
    --brand-pink: #FF758F;
    --brand-gray: #F3F4F6;
}

body {
    font-family: 'Quicksand', sans-serif;
    background-color: var(--brand-bg);
    color: var(--brand-text);
    line-height: 1.6;
    overflow-x: hidden;
}

html {
    scroll-behavior: smooth;
}

h1, h2, h3, h4 {
    font-family: 'Fredoka', sans-serif;
    font-weight: 700;
}

.highlight-text {
    background: linear-gradient(120deg, var(--brand-yellow) 0%, #FFD33D 100%);
    padding: 0 0.5rem;
    border: 3.5px solid var(--brand-text);
    border-radius: 12px;
    display: inline-block;
    box-shadow: 4px 4px 0px var(--brand-text);
    transform: rotate(-1deg);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
}

.section {
    padding: 5rem 0;
}

.section-title {
    font-size: 2.2rem;
    text-align: center;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
}

.section-subtitle {
    text-align: center;
    font-size: 1.1rem;
    color: #4B5563;
    max-width: 700px;
    margin: 0 auto 3rem auto;
}

.btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.8rem 1.6rem;
    font-size: 1rem;
    font-weight: 700;
    font-family: 'Fredoka', sans-serif;
    text-decoration: none;
    border-radius: 14px;
    border: 3.5px solid var(--brand-text);
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    cursor: pointer;
}

.btn-primary {
    background-color: var(--brand-yellow);
    color: var(--brand-text);
    box-shadow: 4px 4px 0px var(--brand-text);
}

.btn-primary:hover {
    transform: translate(-3px, -3px);
    box-shadow: 7px 7px 0px var(--brand-text);
}

.btn-primary:active {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px var(--brand-text);
}

.btn-secondary {
    background-color: #FFFFFF;
    color: var(--brand-text);
    box-shadow: 4px 4px 0px var(--brand-text);
}

.btn-secondary:hover {
    transform: translate(-3px, -3px);
    box-shadow: 7px 7px 0px var(--brand-text);
}

.btn-secondary:active {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px var(--brand-text);
}

/* Header & Nav */
.header {
    background-color: #FFFFFF;
    border-bottom: 4px solid var(--brand-text);
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 0.8rem 0;
}

.header-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo-link {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    text-decoration: none;
    color: var(--brand-text);
}

.logo-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--brand-yellow);
    border: 3px solid var(--brand-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
}

.logo-text {
    font-family: 'Fredoka', sans-serif;
    font-weight: 800;
    font-size: 1.35rem;
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
}

.nav-item {
    text-decoration: none;
    color: var(--brand-text);
    font-weight: 700;
    font-size: 0.95rem;
    transition: color 0.2s ease;
}

.nav-item:hover {
    color: var(--brand-yellow-dark);
}

.nav-github {
    background: var(--brand-gray);
    padding: 0.4rem 0.8rem;
    border: 2px solid var(--brand-text);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

/* Hero Section */
.hero-section {
    padding: 5rem 0 3rem 0;
    background: radial-gradient(circle at 10% 20%, rgba(255, 245, 208, 0.5) 0%, rgba(255, 253, 240, 1) 90%);
}

.hero-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.hero-title {
    font-size: 3.5rem;
    line-height: 1.15;
    margin-bottom: 1.5rem;
    max-width: 850px;
}

.hero-subtitle {
    font-size: 1.2rem;
    color: #4B5563;
    max-width: 750px;
    margin-bottom: 2rem;
}

.hero-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 4rem;
    flex-wrap: wrap;
    justify-content: center;
}

/* App Mockup Container */
.app-mockup-wrapper {
    width: 100%;
    max-width: 800px;
    background: #FFFFFF;
    border: 4px solid var(--brand-text);
    border-radius: 20px;
    box-shadow: 10px 10px 0px var(--brand-text);
    overflow: hidden;
}

.app-mockup-header {
    background: #FFFFFF;
    border-bottom: 4px solid var(--brand-text);
    padding: 0.6rem 1rem;
    display: flex;
    align-items: center;
    position: relative;
}

.app-mockup-dots {
    display: flex;
    gap: 0.4rem;
}

.app-mockup-dots span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--brand-text);
}

.app-mockup-dots span:nth-child(1) { background-color: #FF5F56; }
.app-mockup-dots span:nth-child(2) { background-color: #FFBD2E; }
.app-mockup-dots span:nth-child(3) { background-color: #27C93F; }

.app-mockup-title {
    font-size: 0.85rem;
    font-weight: 800;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
}

.app-mockup-body {
    padding: 1.5rem;
    background-color: var(--brand-bg);
}

.mock-dashboard {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 1rem;
}

.mock-db-card {
    background-color: #FFFFFF;
    border: 3px solid var(--brand-text);
    border-radius: 12px;
    padding: 1rem;
    text-align: left;
    height: 100%;
}

.mock-db-card h4 {
    font-size: 0.9rem;
    border-bottom: 2px dashed var(--brand-text);
    padding-bottom: 0.4rem;
    margin-bottom: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.mock-db-song {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.mock-vinyl-disc {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle, #222 30%, #111 100%);
    border: 2px solid var(--brand-text);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: rotate-disc 4s linear infinite;
}

.mock-vinyl-label {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: var(--brand-yellow);
    border: 1px solid var(--brand-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
}

@keyframes rotate-disc {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.mock-db-song-info strong {
    display: block;
    font-size: 0.95rem;
}

.mock-db-song-info span {
    font-size: 0.8rem;
    color: #4B5563;
}

.mock-db-queue-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    padding: 0.4rem;
    border-bottom: 1px solid #E5E7EB;
}

/* Features Grid */
.features-section {
    background-color: #FFFFFF;
    border-top: 4px solid var(--brand-text);
    border-bottom: 4px solid var(--brand-text);
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-top: 2rem;
}

.feature-card {
    background-color: var(--brand-bg);
    border: 3px solid var(--brand-text);
    border-radius: 16px;
    padding: 2rem 1.5rem;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 4px 4px 0px var(--brand-text);
}

.feature-card:hover {
    transform: translate(-3px, -3px);
    box-shadow: 7px 7px 0px var(--brand-text);
}

.feature-icon {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    border: 3px solid var(--brand-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    margin-bottom: 1.2rem;
    box-shadow: 2px 2px 0px var(--brand-text);
}

.bg-yellow { background-color: var(--brand-yellow); }
.bg-blue { background-color: var(--brand-blue); }
.bg-pink { background-color: var(--brand-pink); }
.bg-green { background-color: var(--brand-green); }

.feature-card h3 {
    font-size: 1.25rem;
    margin-bottom: 0.6rem;
}

.feature-card p {
    font-size: 0.95rem;
    color: #4B5563;
}

/* Themes Showcase Section */
.themes-section {
    background-color: #FFFDF0;
}

.theme-showcase-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    align-items: center;
}

.theme-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
}

.theme-tab {
    padding: 0.6rem 1.2rem;
    font-size: 0.95rem;
    font-weight: 700;
    font-family: 'Fredoka', sans-serif;
    background-color: #FFFFFF;
    border: 3px solid var(--brand-text);
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    box-shadow: 3px 3px 0px var(--brand-text);
    transition: all 0.1s ease;
}

.theme-tab.active {
    background-color: var(--brand-yellow);
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0px var(--brand-text);
}

/* Simulated OBS Screen */
.obs-screen-preview {
    width: 100%;
    max-width: 780px;
    aspect-ratio: 16 / 9;
    background-color: #00FF00; /* Chroma Key Green Screen */
    border: 6px solid var(--brand-text);
    border-radius: 20px;
    box-shadow: 10px 10px 0px var(--brand-text);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.chroma-key-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    color: #FFFFFF;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    z-index: 20;
}

/* Base setup for scoping preview wrapper */
#theme-preview-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Guide Section Steps */
.guide-section {
    background-color: #FFFFFF;
    border-top: 4px solid var(--brand-text);
    border-bottom: 4px solid var(--brand-text);
}

.guide-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
}

.guide-step-card {
    background-color: var(--brand-bg);
    border: 3px solid var(--brand-text);
    border-radius: 16px;
    padding: 2.5rem 1.5rem;
    position: relative;
    box-shadow: 6px 6px 0px var(--brand-text);
}

.step-badge {
    position: absolute;
    top: -20px;
    left: 20px;
    width: 45px;
    height: 45px;
    border-radius: 50%;
    border: 3px solid var(--brand-text);
    background-color: var(--brand-yellow);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 1.2rem;
    box-shadow: 2px 2px 0px var(--brand-text);
}

.guide-step-card h3 {
    font-size: 1.3rem;
    margin-bottom: 0.8rem;
    margin-top: 0.5rem;
}

.guide-step-card p {
    font-size: 0.95rem;
    color: #4B5563;
}

/* Footer styling */
.footer {
    background-color: #FFFFFF;
    padding: 3rem 0 1rem 0;
}

.footer-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 2rem;
    border-bottom: 2px dashed #E5E7EB;
    padding-bottom: 2rem;
}

.footer-brand {
    font-family: 'Fredoka', sans-serif;
    font-size: 1.6rem;
    font-weight: 800;
    display: block;
    margin-bottom: 0.5rem;
}

.footer-left p {
    font-size: 0.95rem;
    color: #6B7280;
    max-width: 400px;
}

.footer-right {
    display: flex;
    gap: 1.5rem;
}

.footer-link {
    text-decoration: none;
    color: var(--brand-text);
    font-weight: 700;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.footer-link:hover {
    color: var(--brand-yellow-dark);
}

.footer-bottom {
    text-align: center;
    padding-top: 1.5rem;
    font-size: 0.85rem;
    color: #9CA3AF;
}

@media (max-width: 768px) {
    .hero-title {
        font-size: 2.2rem;
    }
    
    .hero-subtitle {
        font-size: 1rem;
    }
    
    .mock-dashboard {
        grid-template-columns: 1fr;
    }
    
    .header-container {
        flex-direction: column;
        gap: 1rem;
    }
    
    .nav-links {
        flex-wrap: wrap;
        justify-content: center;
        gap: 1rem;
    }
}

/* ==========================================
   Copied and Scoped Overlay Styles Below
   ========================================== */
`;

// Append extracted scoped styles
fs.writeFileSync(styleDestPath, landingStyles + scopedOverlayStyles);
console.log('✅ style.css rebuilt successfully with perfect scopes!');
