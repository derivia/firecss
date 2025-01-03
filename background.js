class CSSManager {
	constructor() {
		this.cssRules = new Map();
		this.setupMessageListener();
		this.setupTabListeners();
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

	async applyRulesToTab(tab) {
		for (const [pattern, css] of this.cssRules) {
			if (this.matchesPattern(tab.url, pattern)) {
				try {
					await browser.tabs.insertCSS(tab.id, {
						code: css,
						cssOrigin: "user",
					});
				} catch (error) {
					console.error(`Failed to apply CSS to ${tab.url}:`, error);
				}
			}
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
				await this.removeStylesFromMatchingTabs(ruleString);
				browser.runtime.sendMessage({
					type: "removedRule",
					rule: ruleString,
				});
			}
		} catch (error) {
			console.error("Failed to remove rule:", ruleString);
		}
	}

	async removeStylesFromMatchingTabs(pattern) {
		const tabs = await browser.tabs.query({});
		for (const tab of tabs) {
			if (this.matchesPattern(tab.url, pattern)) {
				try {
					await browser.tabs.removeCSS(tab.id, {
						code: this.cssRules.get(pattern),
						cssOrigin: "user",
					});
				} catch (error) {
					console.error(`Failed to remove CSS from ${tab.url}:`, error);
				}
			}
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
		try {
			if (this.matchesPattern(tab.url, pattern)) {
				await browser.tabs.insertCSS(tab.id, {
					code: css,
					cssOrigin: "user",
				});
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
