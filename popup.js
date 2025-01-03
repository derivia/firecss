class PopupUI {
	constructor() {
		this.initializeElements();
		this.setupEventListeners();
		this.autofillCurrentDomain();
	}

	initializeElements() {
		this.urlInput = document.getElementById("url");
		this.wildcardCheck = document.getElementById("wildcard");
		this.cssInput = document.getElementById("css");
		this.saveButton = document.getElementById("save");
		this.viewStylesButton = document.getElementById("view-styles");
		this.applyButton = document.createElement("button");
		this.applyButton.textContent = "Apply";
		this.saveButton.parentNode.insertBefore(this.applyButton, this.saveButton);
	}

	setupEventListeners() {
		this.applyButton.addEventListener("click", () => this.previewCSS());
		this.saveButton.addEventListener("click", () => this.saveCSS());
		this.viewStylesButton.addEventListener("click", () => this.viewAllStyles());
	}

	async viewAllStyles() {
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};

			const stylesPageUrl = browser.runtime.getURL("styles.html");
			const tab = await browser.tabs.create({ url: stylesPageUrl });

			await new Promise((resolve) => {
				const listener = (tabId, changeInfo) => {
					if (tabId === tab.id && changeInfo.status === "complete") {
						browser.tabs.onUpdated.removeListener(listener);
						resolve();
					}
				};
				browser.tabs.onUpdated.addListener(listener);
			});

			await browser.tabs.sendMessage(tab.id, {
				type: "displayStyles",
				cssRules,
			});
		} catch (error) {
			console.error("Failed to view all styles:", error);
		}
	}

	async autofillCurrentDomain() {
		try {
			const tabs = await browser.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tabs.length > 0) {
				const tab = tabs[0];
				const url = new URL(tab.url);
				const domain = url.hostname;
				this.urlInput.value = domain;
				this.loadPreviousCSS(domain);
			}
		} catch (error) {
			console.error("Failed to autofill current domain:", error);
		}
	}

	async loadPreviousCSS(domain) {
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};

			if (cssRules[domain]) {
				this.cssInput.value = cssRules[domain];
				console.log("Loaded previous CSS for domain:", domain);
				return;
			}

			const wildcardKey = `${domain}/*`;
			if (cssRules[wildcardKey]) {
				this.cssInput.value = cssRules[wildcardKey];
				console.log("Loaded previous CSS for wildcard:", wildcardKey);
				return;
			}
			console.log("No previous CSS found for domain:", domain);
		} catch (error) {
			console.error("Failed to load previous CSS:", error);
		}
	}

	async previewCSS() {
		const url = this.urlInput.value.trim();
		if (!url) return;
		console.log("Sending message to apply CSS for URL:", url);
		try {
			await browser.runtime.sendMessage({
				type: "previewCSS",
				url,
				isWildcard: this.wildcardCheck.checked,
				css: this.cssInput.value,
			});
			console.log("Message sent successfully");
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	}

	async saveCSS() {
		const url = this.urlInput.value.trim();
		if (!url) {
			console.error("URL is empty");
			return;
		}
		const isWildcard = this.wildcardCheck.checked;
		const css = this.cssInput.value.trim();
		if (!css) {
			console.error("CSS is empty");
			return;
		}
		const ruleKey = isWildcard ? `${url}/*` : url;
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};
			console.log("Existing rules before saving:", cssRules);

			cssRules[ruleKey] = css;

			await browser.storage.local.set({ cssRules });
			console.log("CSS rule saved successfully:", ruleKey);

			const updatedResult = await browser.storage.local.get("cssRules");
			console.log("Updated rules after saving:", updatedResult.cssRules);

			this.urlInput.value = "";
			this.cssInput.value = "";
			this.wildcardCheck.checked = false;
		} catch (error) {
			console.error("Failed to save CSS rule:", error);
		}
	}
}
const popup = new PopupUI();
