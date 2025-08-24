/**
 * @class Popup UI
 * @classdesc Popup UI javascript that handles button click events and keypresses on textarea
 */
class PopupUI {
	constructor() {
		this.currentDomain = null;
		this.initializeElements();
		this.setupEventListeners();
		this.initialize();
	}

	async initialize() {
		try {
			const tabs = await browser.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tabs.length > 0) {
				const url = new URL(tabs[0].url);
				this.currentDomain = url.hostname;
			}
		} catch (error) {
			console.error("Failed to get current domain:", error);
		} finally {
			this.loadPopupState();
		}
	}

	initializeElements() {
		this.urlInput = document.getElementById("url");
		this.wildcardCheck = document.getElementById("wildcard");
		this.cssInput = document.getElementById("css");
		this.saveButton = document.getElementById("save");
		this.viewStylesButton = document.getElementById("view-styles");
		this.applyButton = document.createElement("button");
		this.applyButton.textContent = "Preview";
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

		window.addEventListener("unload", () => this.savePopupState());
	}

	async loadPopupState() {
		if (!this.currentDomain) {
			this.autofillCurrentDomain();
			return;
		}

		try {
			const key = `popupState_${this.currentDomain}`;
			const result = await browser.storage.local.get(key);
			if (result && result[key]) {
				const state = result[key];
				this.urlInput.value = state.url || this.currentDomain;
				this.wildcardCheck.checked = state.isWildcard === true;
				this.cssInput.value = state.css || "";
			} else {
				this.autofillCurrentDomain();
			}
		} catch (error) {
			console.error("Failed to load popup state:", error);
			this.autofillCurrentDomain();
		}
	}

	async savePopupState() {
		if (!this.currentDomain) return;

		const state = {
			url: this.urlInput.value,
			isWildcard: this.wildcardCheck.checked,
			css: this.cssInput.value,
		};
		try {
			const key = `popupState_${this.currentDomain}`;
			await browser.storage.local.set({ [key]: state });
		} catch (error) {
			console.error("Failed to save popup state:", error);
		}
	}

	/**
	 * @param {string} lines All lines from the text area
	 * @param {number} currentLineIndex The current line the cursor is
	 * @returns {number} distance from current closing brace to matching opening brace
	 */
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

	/**
	 * @param {Event} Keyboard input event which carries "keypressed" data
	 */
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

	/**
	 * @param {Event} e Keyboard event
	 *
	 * Tries to handle indentation based on pattern matchin using regex, keeping a
	 * 2-space indentation for css code blocks
	 */
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

	/**
	 * Show all styles saved on localstorage in styles.html
	 */
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

	/**
	 * Autofill domain input based on current domain
	 */
	async autofillCurrentDomain() {
		if (this.currentDomain) {
			this.urlInput.value = this.currentDomain;
			this.loadPreviousCSS(this.currentDomain);
		}
	}

	/**
	 * Load previous css code for this page based on current domain
	 */
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

	/**
	 * Inject temporarily inserted CSS to the page
	 */
	async previewCSS() {
		try {
			await browser.runtime.sendMessage({
				type: "previewCSS",
				css: this.cssInput.value,
			});
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	}

	/**
	 * Save inserted CSS to local storage with domain
	 */
	async saveCSS() {
		const url = this.urlInput.value.trim();
		if (!url) {
			console.error("URL is empty");
			return;
		}
		const isWildcard = this.wildcardCheck.checked;
		const css = this.cssInput.value.trim();

		const ruleKey = isWildcard ? `${url}/*` : url;
		try {
			const result = await browser.storage.local.get("cssRules");
			const cssRules = result.cssRules || {};

			if (!css) {
				delete cssRules[ruleKey];
			} else {
				cssRules[ruleKey] = css;
			}

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
