class CSSManager {
	constructor() {
		this.cssRules = new Map();
		this.loadRules().then(() => {
			this.applyLoadedRules();
			this.setupTabListeners();
		});
		this.setupMessageListener();
	}

	setupTabListeners() {
		browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
			if (changeInfo.status === "complete") {
				this.applyRulesToTab(tab);
			}
		});
		browser.tabs.onCreated.addListener((tab) => {
			this.applyRulesToTab(tab);
		});
	}

	async applyRulesToTab(tab) {
		for (const [pattern, css] of this.cssRules) {
			if (this.matchesPattern(tab.url, pattern)) {
				try {
					await browser.tabs.insertCSS(tab.id, {
						code: css,
						cssOrigin: "user",
					});
					console.log(`Applied CSS to ${tab.url} using pattern: ${pattern}`);
				} catch (error) {
					console.error(`Failed to apply CSS to ${tab.url}:`, error);
				}
			}
		}
	}

	async applyLoadedRules() {
		console.log("Applying loaded CSS rules to existing tabs...");
		const tabs = await browser.tabs.query({});
		for (const tab of tabs) {
			this.applyRulesToTab(tab);
		}
	}

	async loadRules() {
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};
			console.log("Loaded CSS rules from storage:", cssRules);
			this.cssRules = new Map(Object.entries(cssRules));
			console.log("CSS rules converted to Map:", this.cssRules);
		} catch (error) {
			console.error("Failed to load CSS rules:", error);
		}
	}

	setupMessageListener() {
		browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
			if (message.type === "previewCSS") {
				this.previewCSS(message.url, message.isWildcard, message.css);
			}
		});
	}

	async previewCSS(url, isWildcard, css) {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tabs.length) return;
		const tab = tabs[0];
		const pattern = isWildcard ? `${url}/*` : url;
		try {
			if (this.matchesPattern(tab.url, pattern)) {
				await browser.tabs.insertCSS(tab.id, {
					code: css,
					cssOrigin: "user",
				});
				console.log("CSS applied successfully to:", tab.url);
			} else {
				console.log("Tab URL does not match the pattern:", tab.url);
			}
		} catch (error) {
			console.error("CSS insertion failed:", error);
		}
	}

	matchesPattern(tabUrl, pattern) {
		try {
			const urlPattern = pattern
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*");
			const regex = new RegExp(`^https?:\/\/${urlPattern}`);
			return regex.test(tabUrl);
		} catch (error) {
			console.error("Pattern matching failed:", error);
			return false;
		}
	}
}
const cssManager = new CSSManager();
