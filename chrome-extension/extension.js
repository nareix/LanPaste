
console.log('loaded');

chrome.contextMenus.create({
	title: 'CloudCopy',
	id: 'CloudCopy',
	contexts: ['selection'],
});

chrome.contextMenus.onClicked.addListener(function (info) {
	console.log('clicked');
	chrome.runtime.sendMessage({greeting: "hello"}, function(response) {
			console.log(response.farewell);
	});
});


