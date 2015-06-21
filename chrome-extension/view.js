
chrome.runtime.onMessage.addListener(function (r) {
	document.getElementById('pre').innerHTML = r;
});

