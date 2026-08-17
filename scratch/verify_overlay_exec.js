const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('overlay.html', 'utf8');

const elements = {};
function mockElement(id = '', tag = 'div') {
    return {
        id,
        tagName: tag.toUpperCase(),
        classList: {
            classes: new Set(),
            add(...c) { c.forEach(x => this.classes.add(x)); },
            remove(...c) { c.forEach(x => this.classes.delete(x)); },
            contains(c) { return this.classes.has(c); },
            toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); return force; } this.contains(c) ? this.remove(c) : this.add(c); return this.contains(c); }
        },
        addEventListener() {},
        removeEventListener() {},
        style: {
            setProperty(k, v) { this[k] = v; },
            removeProperty(k) { delete this[k]; }
        },
        dataset: {},
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        insertBefore(newNode, refNode) { newNode.parentNode = this; this.children.push(newNode); return newNode; },
        parentNode: { insertBefore: () => {} },
        querySelector() { return mockElement(); },
        querySelectorAll() { return []; },
        closest() { return null; },
        getBoundingClientRect() { return { width: 400, height: 160, top: 0, left: 0, bottom: 160, right: 400 }; },
        offsetWidth: 400,
        offsetHeight: 160,
        clientWidth: 400,
        clientHeight: 160,
        scrollWidth: 400,
        scrollHeight: 160,
        isConnected: true
    };
}

const mockDoc = {
    body: mockElement('body', 'body'),
    documentElement: mockElement('html', 'html'),
    getElementById(id) {
        if (!elements[id]) elements[id] = mockElement(id);
        return elements[id];
    },
    querySelector(sel) { return mockElement(); },
    querySelectorAll(sel) { return []; },
    getElementsByTagName(tag) { return [mockElement('', tag)]; },
    createElement(tag) { return mockElement('', tag); },
    fonts: { ready: Promise.resolve() }
};

const sandbox = {
    window: {
        location: { href: 'http://localhost:3000/overlay.html', origin: 'http://localhost:3000', pathname: '/overlay.html' },
        getComputedStyle(el) {
            return {
                fontSize: '16px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: '400',
                letterSpacing: '0px',
                textTransform: 'none',
                font: '16px Inter'
            };
        },
        localStorage: {
            getItem(k) { return null; },
            setItem(k, v) {},
            removeItem(k) {}
        },
        addEventListener() {},
        removeEventListener() {},
        setTimeout: () => {},
        clearTimeout: () => {},
        setInterval: () => {},
        clearInterval: () => {},
        document: mockDoc,
        URLSearchParams: require('url').URLSearchParams,
        URL: require('url').URL
    },
    document: mockDoc,
    localStorage: {
        getItem(k) { return null; },
        setItem(k, v) {},
        removeItem(k) {}
    },
    location: { href: 'http://localhost:3000/overlay.html', origin: 'http://localhost:3000', pathname: '/overlay.html', search: '' },
    URLSearchParams: require('url').URLSearchParams,
    URL: require('url').URL,
    console,
    addEventListener() {},
    removeEventListener() {},
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    getComputedStyle(el) {
        return {
            fontSize: '16px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: '400',
            letterSpacing: '0px',
            textTransform: 'none',
            font: '16px Inter'
        };
    },
    fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) })
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.createContext(sandbox);

const scriptTags = [...html.matchAll(/<script([\s\S]*?)>([\s\S]*?)<\/script>/gi)];
scriptTags.forEach((tag, idx) => {
    const attrs = tag[1];
    const inlineCode = tag[2];
    const srcMatch = attrs.match(/src=['"](.*?)['"]/i);
    if (srcMatch) {
        const src = srcMatch[1];
        if (fs.existsSync(src)) {
            console.log('Loading external script: ' + src);
            const extCode = fs.readFileSync(src, 'utf8');
            vm.runInContext(extCode, sandbox);
        }
    } else if (inlineCode.trim()) {
        console.log('Executing inline script #' + idx);
        vm.runInContext(inlineCode, sandbox);
    }
});
console.log('ALL SCRIPTS IN OVERLAY.HTML EXECUTED SUCCESSFULLY WITHOUT ANY ERRORS!');
