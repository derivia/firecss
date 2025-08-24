/**
 * @class CSS Manager
 * @classdesc CSS Management class that works with local storage and tabs
 * Doesn't have access to DOM, but has to events|messages and the external browser API
 */
class CSSManager {
	constructor() {
		this.cssRules = new Map();
		this.regexCache = new Map();
		this.injectedCssByTab = new Map();
		this.setupMessageListener();
		this.setupTabListeners();
		this.loadRules().then(() => {
			this.applyLoadedRules();
		});
	}

	setupMessageListener() {
		browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
			if (message.type === "previewCSS") {
				this.previewCSS(message.css);
			} else if (message.type === "removeRule") {
				this.removeRule(message.rule);
			} else if (message.type === "updateRule") {
				this.updateRule(message.url, message.isWildcard, message.css);
			}
		});
	}

	setupTabListeners() {
		browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
			if (changeInfo.status === "complete" && tab.url) {
				this.applyRulesToTab(tab);
			}
		});

		browser.tabs.onRemoved.addListener((tabId) => {
			this.injectedCssByTab.delete(tabId);
		});
	}

	_forceImportant(css) {
		return css.replace(/\{([^}]+)\}/g, (match, declarations) => {
			const importantDeclarations = declarations
				.split(";")
				.map((declaration) => {
					if (declaration.trim() && !/!important/.test(declaration)) {
						return declaration.trim() + " !important";
					}
					return declaration;
				})
				.join(";");
			return `{${importantDeclarations}}`;
		});
	}

	async _applyCssToTab(tabId, css) {
		const oldCss = this.injectedCssByTab.get(tabId);
		if (oldCss) {
			try {
				await browser.tabs.removeCSS(tabId, { code: oldCss });
			} catch (e) {}
		}

		if (css && css.trim()) {
			try {
				const importantCss = this._forceImportant(css);
				await browser.tabs.insertCSS(tabId, {
					code: importantCss,
					cssOrigin: "user",
				});
				this.injectedCssByTab.set(tabId, importantCss);
			} catch (error) {
				console.error(`Failed to inject CSS to tab ${tabId}:`, error);
				this.injectedCssByTab.delete(tabId);
			}
		} else {
			this.injectedCssByTab.delete(tabId);
		}
	}

	async applyRulesToTab(tab) {
		const combinedCSS = [];
		if (tab.url) {
			for (const [pattern, css] of this.cssRules) {
				if (this.matchesPattern(tab.url, pattern)) {
					combinedCSS.push(css);
				}
			}
		}
		const finalCss = combinedCSS.join("\n");
		await this._applyCssToTab(tab.id, finalCss);
	}

	async applyLoadedRules() {
		const tabs = await browser.tabs.query({ status: "complete" });
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
				this.applyLoadedRules();
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

	async previewCSS(css) {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tabs.length) return;
		const tab = tabs[0];
		await this._applyCssToTab(tab.id, css);
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
			if (tab.url && this.matchesPattern(tab.url, pattern)) {
				await this.applyRulesToTab(tab);
			}
		}
	}
}

const cssManager = new CSSManager();
