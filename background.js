class CSSManager {
	constructor() {
		this.cssRules = new Map();
		this.regexCache = new Map();
		this.setupMessageListener();
		this.setupTabListeners();
		this.setupWebRequestListener();
		this.loadRules().then(() => {
			this.applyLoadedRules();
		});
	}

	setupMessageListener() {
		browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
			if (message.type === "previewCSS") {
				this.previewCSS(message.url, message.isWildcard, message.css);
			} else if (message.type === "removeRule") {
				this.removeRule(message.rule);
			} else if (message.type === "updateRule") {
				this.updateRule(message.url, message.isWildcard, message.css);
			}
		});
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

	setupWebRequestListener() {
		browser.webRequest.onBeforeRequest.addListener(
			(details) => {
				const tabId = details.tabId;
				if (tabId === -1) return;

				const url = details.url;
				const combinedCSS = [];
				for (const [pattern, css] of this.cssRules) {
					if (this.matchesPattern(url, pattern)) {
						combinedCSS.push(css);
					}
				}
				if (combinedCSS.length > 0) {
					this.injectCSS(tabId, combinedCSS.join("\n"));
				}
			},
			{ urls: ["<all_urls>"], types: ["main_frame"] },
		);
	}

	async injectCSS(tabId, css) {
		try {
			await browser.tabs.insertCSS(tabId, {
				code: css,
				cssOrigin: "user",
				runAt: "document_start",
			});
		} catch (error) {
			console.error(`Failed to inject CSS to tab ${tabId}:`, error);
		}
	}

	async applyRulesToTab(tab) {
		const combinedCSS = [];
		for (const [pattern, css] of this.cssRules) {
			if (this.matchesPattern(tab.url, pattern)) {
				combinedCSS.push(css);
			}
		}
		if (combinedCSS.length > 0) {
			await this.injectCSS(tab.id, combinedCSS.join("\n"));
		}
	}

	async applyLoadedRules() {
		const tabs = await browser.tabs.query({});
		for (const tab of tabs) {
			this.applyRulesToTab(tab);
		}
	}

	async removeRule(ruleString) {
		try {
			const rules = await browser.storage.local.get("cssRules");
			const deleted = delete rules.cssRules[ruleString];
			await browser.storage.local.set(rules);

			if (deleted) {
				this.cssRules.delete(ruleString);
				browser.runtime.sendMessage({
					type: "removedRule",
					rule: ruleString,
				});
			}
		} catch (error) {
			console.error("Failed to remove rule:", ruleString);
		}
	}

	async loadRules() {
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};
			this.cssRules = new Map(Object.entries(cssRules));
		} catch (error) {
			console.error("Failed to load CSS rules:", error);
		}
	}

	async previewCSS(url, isWildcard, css) {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tabs.length) return;
		const tab = tabs[0];
		const pattern = isWildcard ? `${url}/*` : url;
		if (this.matchesPattern(tab.url, pattern)) {
			await this.injectCSS(tab.id, css);
		}
	}

	matchesPattern(tabUrl, pattern) {
		if (!this.regexCache.has(pattern)) {
			try {
				const urlPattern = pattern
					.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
					.replace(/\*/g, ".*");
				const regex = new RegExp(`^https?:\/\/${urlPattern}`);
				this.regexCache.set(pattern, regex);
			} catch (error) {
				console.error("Pattern matching failed:", error);
				return false;
			}
		}
		return this.regexCache.get(pattern).test(tabUrl);
	}

	async updateRule(url, isWildcard, css) {
		const pattern = isWildcard ? `${url}/*` : url;
		this.cssRules.set(pattern, css);
		await this.applyRulesToMatchingTabs(pattern);
	}

	async applyRulesToMatchingTabs(pattern) {
		const tabs = await browser.tabs.query({});
		for (const tab of tabs) {
			if (this.matchesPattern(tab.url, pattern)) {
				await this.applyRulesToTab(tab);
			}
		}
	}
}

const cssManager = new CSSManager();
