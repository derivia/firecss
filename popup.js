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
		this.cssInput.addEventListener(
			"keydown",
			this.handleIndentation.bind(this),
		);
		this.cssInput.addEventListener("input", this.handleClosingBrace.bind(this));
	}

	findMatchingOpenBrace(lines, currentLineIndex) {
		let braceCount = 1;
		for (let i = currentLineIndex - 1; i >= 0; i--) {
			const line = lines[i];
			if (line.includes("}")) braceCount++;
			if (line.includes("{")) braceCount--;
			if (braceCount === 0) return i;
		}
		return -1;
	}

	handleClosingBrace(e) {
		if (e.data === "}") {
			const { selectionStart, value } = e.target;
			const lines = value.split("\n");
			const currentLineIndex = lines.findIndex(
				(_, index) =>
					value.substring(0, selectionStart).split("\n").length - 1 === index,
			);

			if (lines[currentLineIndex].trim() === "}") {
				const openBraceIndex = this.findMatchingOpenBrace(
					lines,
					currentLineIndex,
				);
				if (openBraceIndex !== -1) {
					const openBraceLine = lines[openBraceIndex];
					const baseIndent = (openBraceLine.match(/^[ ]*/) || [""])[0];

					lines[currentLineIndex] = baseIndent + "}";
					e.target.value = lines.join("\n");

					const newPosition =
						lines.slice(0, currentLineIndex).join("\n").length +
						baseIndent.length +
						1;
					e.target.selectionStart = e.target.selectionEnd = newPosition;
				}
			}
		}
	}

	handleIndentation(e) {
		if (e.key === "Enter") {
			e.preventDefault();
			const { selectionStart, selectionEnd, value } = e.target;
			const currentLine =
				value.substring(0, selectionStart).split("\n").pop() || "";
			const indentMatch = currentLine.match(/^[ ]*/);
			const indentation = indentMatch ? indentMatch[0] : "";

			const lastChar = currentLine.trim().slice(-1);
			const extraIndent = lastChar === "{" ? "  " : "";
			const removeIndent = currentLine.trim() === "}";

			const newIndent = removeIndent
				? indentation.slice(0, -2)
				: indentation + extraIndent;
			const newValue =
				value.substring(0, selectionStart) +
				"\n" +
				newIndent +
				value.substring(selectionEnd);

			e.target.value = newValue;
			const newPosition = selectionStart + newIndent.length + 1;
			e.target.selectionStart = e.target.selectionEnd = newPosition;
		}
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
				return;
			}

			const wildcardKey = `${domain}/*`;
			if (cssRules[wildcardKey]) {
				this.cssInput.value = cssRules[wildcardKey];
				return;
			}
		} catch (error) {
			console.error("Failed to load previous CSS:", error);
		}
	}

	async previewCSS() {
		const url = this.urlInput.value.trim();
		if (!url) return;
		try {
			await browser.runtime.sendMessage({
				type: "previewCSS",
				url,
				isWildcard: this.wildcardCheck.checked,
				css: this.cssInput.value,
			});
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

			cssRules[ruleKey] = css;

			await browser.storage.local.set({ cssRules });
			await browser.runtime.sendMessage({
				type: "updateRule",
				url,
				isWildcard,
				css,
			});
		} catch (error) {
			console.error("Failed to save CSS rule:", error);
		}
	}
}
const popup = new PopupUI();
