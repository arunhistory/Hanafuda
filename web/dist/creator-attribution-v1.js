"use strict";
const HANA_ATTR_CREATOR = 'ある〜ん';
const HANA_ATTR_CO_CREATOR = '由咲るい';
const HANA_ATTR_JOINED = `${HANA_ATTR_CREATOR}・${HANA_ATTR_CO_CREATOR}`;
const HANA_ATTR_PATTERN = /ある〜ん(?!・由咲るい)/g;
function hanaCorrectAttribution(root) {
    for (const container of root.querySelectorAll('.cloud-document-body')) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const nodes = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode())
            nodes.push(node);
        for (const node of nodes) {
            const current = node.nodeValue ?? '';
            const corrected = current.replace(HANA_ATTR_PATTERN, HANA_ATTR_JOINED);
            if (corrected !== current)
                node.nodeValue = corrected;
        }
    }
}
const hanaCreatorAttributionApp = document.querySelector('#app');
if (hanaCreatorAttributionApp) {
    const hanaCreatorAttributionObserver = new MutationObserver(() => hanaCorrectAttribution(hanaCreatorAttributionApp));
    hanaCreatorAttributionObserver.observe(hanaCreatorAttributionApp, { subtree: true, childList: true, characterData: true });
    hanaCorrectAttribution(hanaCreatorAttributionApp);
}
