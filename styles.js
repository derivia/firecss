let savedMessage = null;

function displayStyles(cssRules) {
	const stylesContainer = document.getElementById("styles-container");

	stylesContainer.innerHTML = "";

	for (const [url, css] of Object.entries(cssRules)) {
		const styleRule = document.createElement("div");
		styleRule.className = "style-rule";

		const styleUrl = document.createElement("div");
		styleUrl.className = "style-url";
		styleUrl.textContent = `URL: ${url}`;

		const styleCss = document.createElement("div");
		styleCss.className = "style-css";
		styleCss.textContent = css;

		styleRule.appendChild(styleUrl);
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
	}
});

window.addEventListener("load", () => {
	if (savedMessage) {
		displayStyles(savedMessage.cssRules);
		savedMessage = null;
	}
});
