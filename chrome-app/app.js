
console.log('started');

var JSONSafeParse = function (r) {
	try {
		r = JSON.parse(r);
	} catch (e) {
		r = {}
	}
	return r;
};

var Conn = {};

Conn.onExtensionMessage = function (cb) {
	chrome.runtime.onMessageExternal.addListener(function (req, sender, res) {
		cb(req, res);
	});
};

var ab2str = function (buf) {
	var out, i, len, c;
	var char2, char3;
	var bufView = new Uint8Array(buf);

	out = '';
	len = bufView.byteLength;

	i = 0;
	while (i < len) {
		c = bufView[i++];
		switch (c >> 4) { 
			case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
				// 0xxxxxxx
				out += String.fromCharCode(c);
				break;

			case 12: case 13:
				// 110x xxxx   10xx xxxx
				char2 = bufView[i++];
				out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
				break;

			case 14:
				// 1110 xxxx  10xx xxxx  10xx xxxx
				char2 = bufView[i++];
				char3 = bufView[i++];
				out += String.fromCharCode(((c & 0x0F) << 12) |
																 ((char2 & 0x3F) << 6) |
																 ((char3 & 0x3F) << 0));
				break;
		}
	}

	return out;
};

var str2ab = function (str) {
	var utf8 = [];
	for (var i = 0; i < str.length; i++) {
		var charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(0xc0 | (charcode >> 6), 
								0x80 | (charcode & 0x3f));
		}
		else if (charcode < 0xd800 || charcode >= 0xe000) {
			utf8.push(0xe0 | (charcode >> 12), 
								0x80 | ((charcode>>6) & 0x3f), 
								0x80 | (charcode & 0x3f));
		}
		else {
			i++;
			charcode = 0x10000 + (((charcode & 0x3ff)<<10)
				| (str.charCodeAt(i) & 0x3ff))
				utf8.push(0xf0 | (charcode >>18), 
									0x80 | ((charcode>>12) & 0x3f), 
									0x80 | ((charcode>>6) & 0x3f), 
									0x80 | (charcode & 0x3f));
		}
	}

	var buf = new ArrayBuffer(utf8.length);
	var bufView = new Uint8Array(buf);
	for (var i = 0; i < utf8.length; i++) {
		bufView[i] = utf8[i];
	}
	return buf;
};

Conn.createUDPServer = function (host, port, cb) {
	var socketId;

	chrome.sockets.udp.create({}, function (socketInfo) {
		socketId = socketInfo.socketId;

		chrome.sockets.udp.onReceive.addListener(function (info) {
			if (info.socketId != socketId) 
				return;

			cb(info.data);
		});

		chrome.sockets.udp.bind(
			socketId,
			host, port,
			function (r) {
			}
		);
	});

	return {
		sendTo: function (data, host, port, cb) {
			chrome.sockets.udp.send(socketId, str2ab(data), host, port, cb || function () {});
		},
		close: function () {
			chrome.sockets.udp.close(socketId);
		},
	};
};

Conn.createTCPServer = function () {
	var tcpServer = chrome.sockets.tcpServer;
	var tcpSocket = chrome.sockets.tcp;

	tcpServer.create({}, function (socketInfo) {
		var serverSocketId = socketInfo.socketId;

		var reqGetBody = function (req) {
			var i = req.indexOf('\r\n\r\n');
			if (i == -1)
				return '';
			return req.substr(i+4);
		};

		var onAccept = function (acceptInfo) {
			var clientSocketId = acceptInfo.clientSocketId;
			console.log('accept', acceptInfo);

			var onReceive = function (recvInfo) {
				tcpSocket.onReceive.removeListener(onReceive);
				if (recvInfo.socketId != acceptInfo.clientSocketId)
					return;

				var reqBody = reqGetBody(ab2str(recvInfo.data));

				var resBody = 'hello';
				var res = [
					'HTTP/1.1 200 OK',
					'Content-Length: ' + resBody.length,
					'Content-Type: application/json',
				].join('\r\n') + '\r\n\r\n' + resBody;

				console.log(reqBody);

				tcpSocket.send(clientSocketId, str2ab(res), function () {
					tcpSocket.disconnect(clientSocketId);
				});
			};

			tcpSocket.onReceive.addListener(onReceive);
			tcpSocket.setPaused(clientSocketId, false);
		};

		var onReceive = function (receiveInfo) {
			console.log('receive', receiveInfo);
		};

		tcpServer.listen(serverSocketId, '127.0.0.1', 16534, 10, function (r) {
			tcpServer.onAccept.addListener(onAccept);
		});
	});
};

var device = {plat: 'Chrome', name: '', id: ''};
var extensionId = 'cpkhffehjaigohmoimoideoaakkmdicl';

var notificationId = 0;
var notifications = {};
var socket;

var notifyButtons = [{action: 'copy', prop: {title: 'Copy'}}];

var onLoad = function () {
	console.log('loaded');

	chrome.identity.getProfileUserInfo(function (info) {
		console.log('profile', info);
		if (info && info.email && info.id) {
			device.name = info.email;
			device.id = info.id;
		}
	});

	socket = Conn.createUDPServer('0.0.0.0', 16533, function (r) {
		r = JSONSafeParse(ab2str(r));

		if (r.device && r.device.id != device.id && typeof(r.data) == 'string') {
			var id = String(notificationId++);

			var buttons = [];
			for (var i in notifyButtons)
				buttons.push(notifyButtons[i].prop);

			notifications[id] = r;
			chrome.notifications.create(id, {
				type: 'basic',
				title: 'From ' + r.device.name,
				iconUrl: 'icon.png',
				message: r.data,
				buttons: buttons,
			});
		}
	});

	chrome.notifications.onClosed.addListener(function (id) {
		delete notifications[id];
		console.log('closed', id);
	});

	chrome.notifications.onButtonClicked.addListener(function (id, btnId) {
		var r = notifications[id];
		var btn = notifyButtons[btnId];
		chrome.runtime.sendMessage(extensionId, {action: btn.action, data: r}, function () {});
		console.log('button clicked', id);
	});

	chrome.notifications.onClicked.addListener(function (id) {
		var r = notifications[id];
		chrome.runtime.sendMessage(extensionId, {action: 'click', data: r}, function () {});
		console.log('clicked', id);
	});

	Conn.onExtensionMessage(function (r) {
		console.log('extension', r);
		socket.sendTo(JSON.stringify({
			device: device,
			data: r,
		}), '224.0.0.1', 16533);
	});
};

chrome.runtime.onSuspend.addListener(function () {
	socket.close();
});

chrome.runtime.onConnectExternal.addListener(function (p) {
	onLoad();
});

