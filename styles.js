let savedMessage = null;

function displayStyles(cssRules) {
	const stylesContainer = document.getElementById("styles-container");

	stylesContainer.innerHTML = "";

	for (const [url, css] of Object.entries(cssRules)) {
		const styleRule = document.createElement("div");
		styleRule.className = "style-rule";

		const uniqueId = `rule-${url.replace(/[^\w]/g, "-")}`;

		styleRule.id = uniqueId;

		const styleRemoveButton = document.createElement("button");
		styleRemoveButton.className = "style-remove-button";
		styleRemoveButton.textContent = "Delete style";
		const handleRemoveClick = async (e) => {
			e.preventDefault();
			const parent = styleRemoveButton.closest("div");
			const styleUrlElement = parent.querySelector(".style-url");
			const rule = styleUrlElement.innerHTML.replace(/^URL: /, "");

			browser.runtime.sendMessage({
				type: "removeRule",
				rule,
			});
		};
		styleRemoveButton.onclick = handleRemoveClick;

		const styleUrl = document.createElement("div");
		styleUrl.className = "style-url";
		styleUrl.textContent = `URL: ${url}`;

		const styleCss = document.createElement("div");
		styleCss.className = "style-css";
		styleCss.textContent = css;

		styleRule.appendChild(styleUrl);
		styleRule.appendChild(styleRemoveButton);
		styleRule.appendChild(styleCss);
		stylesContainer.appendChild(styleRule);
	}
}

browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	if (message.type === "displayStyles") {
		if (document.readyState === "complete") {
			displayStyles(message.cssRules);
		} else {
			savedMessage = message;
		}
	} else if (message.type === "removedRule") {
		const rule = message.rule;
		const ruleDivString = rule.replace(/[^\w]/g, "-");
		const ruleDiv = document.getElementById(`rule-${ruleDivString}`);
		if (ruleDiv) {
			ruleDiv.innerHTML =
				"<div class='removed-rule-message'>Rule removed</div>";
		}
	}
});

window.addEventListener("load", () => {
	if (savedMessage) {
		displayStyles(savedMessage.cssRules);
		savedMessage = null;
	}
});
