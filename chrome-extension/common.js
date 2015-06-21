
document.addEventListener('DOMContentLoaded', function() {
	var listenerDiv = document.getElementById('listener');

	listenerDiv.addEventListener('load', function () {
		console.log('module loaded');
	}, true);
	listenerDiv.addEventListener('message', function (m) {
		console.log('message', m);
	}, true);
	listenerDiv.addEventListener('crash', function () {
	}, true);

	console.log('page loaded');
	var HelloTutorialModule = document.getElementById('hello_tutorial');

	HelloTutorialModule.postMessage('hello')
});

