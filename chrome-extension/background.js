
var appId = 'afpjjnppambkebhdoejlpnjcebklfegl';

var sendToApp = function (r, cb) {
	chrome.runtime.sendMessage(appId, r, function(response) {
		console.log(response);
	});
};

chrome.notifications.onClicked.addListener(function () {
	chrome.tabs.create({url: 'tab.html'});
});

chrome.runtime.connect(appId, {name: 'xxx'});

chrome.runtime.onMessageExternal.addListener(function (r, sender, res) {
	var text = r.data.data;

	if (r.action == 'copy') {
		copyTextToClipboard(text);
	} else {
		if (text.substr(0, 4) == 'http')
			chrome.tabs.create({url: text});
		else
			openNewTabView(text);
	}
});

var tabId = 0;

var openNewTabView = function (text) {
	chrome.tabs.create({url: 'view.html'}, function (tab) {
		chrome.runtime.sendMessage(text);
	});
};

var copyTextToClipboard = function (text) {
	var t = document.createElement('textarea');
	t.textContent = text;
	document.body.appendChild(t);
	t.select();
	document.execCommand('copy');
	document.body.removeChild(t);
};

/*
chrome.contextMenus.create({
	title: 'Testing',
	contexts: ['all'],
	onclick: function (info) {
		chrome.notifications.create({
			iconUrl: 'icon.png',
			type: 'basic',
			title: 'Test',
			message: 'test',
			buttons: [{title: 'Click Copy'}],
		});
	},
});
*/

var sendText = function (info) {
	var data = '';
	if (info.linkUrl)
		data = info.linkUrl;
	else if (info.selectionText)
		data = info.selectionText;
	else if (info.pageUrl)
		data = info.pageUrl;
	sendToApp({type: 'text', data: data});
};

chrome.contextMenus.create({
	title: 'Send current tab url to device',
	contexts: ['page'],
	onclick: sendText,
});

chrome.contextMenus.create({
	title: 'Send selected text to device',
	contexts: ['selection'],
	onclick: sendText,
});

chrome.contextMenus.create({
	title: 'Send url to device',
	contexts: ['link'],
	onclick: sendText,
});

