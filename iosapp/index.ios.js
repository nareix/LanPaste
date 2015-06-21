/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 */
'use strict';

var React = require('react-native');
var {
  AppRegistry,
  StyleSheet,
	TouchableHighlight,
  Text,
  View,
	AppStateIOS,
	LinkingIOS,
	Navigator,
} = React;

var {
	NativePasteboard,
	NativeNetwork,
	NativeUIDevice,
} = require('NativeModules');

var DeviceEventEmitter = require('RCTDeviceEventEmitter');

var Network = {
	uuid: 0
};

Network.createUDPServer = function (host, port, onRecv) {
	var uuid = 'udp' + String(this.uuid++);

	var create = function () {
		NativeNetwork.create(uuid, 'udp');
		NativeNetwork.bind(uuid, host, port);
	};

	create();

	DeviceEventEmitter.addListener(uuid, function (r) {
		if (r.type == 'recv')
			onRecv(r.data);
		if (r.type == 'close') {
			// recreate on released
			console.log('UDP server closed, recreate now');
			create();
		}
	});

	return {
		sendto(host, port, data) {
			NativeNetwork.sendto(uuid, host, port, data);
		},
	};
};

var JSONSafeParse = function (r) {
	try {
		r = JSON.parse(r);
	} catch (e) {
		r = {}
	}
	return r;
};

var iosapp = React.createClass({
	getInitialState() {
		return {
			income: {text: '', from: ''}, 
			outcome: {text: '', from: ''},
		};
	},

	_device: {
		plat: 'iOS',
		name: NativeUIDevice.name,
		id: NativeUIDevice.name,
	},

	getPasteboardContent() {
		NativePasteboard.getContent(function (text) {
			this.setState({outcome: {
				text: text,
				from: 'Clipboard',
			}});
		}.bind(this));
	},

	componentDidMount() {
		AppStateIOS.addEventListener('change', function (state) {
			if (state == 'active')
				this.getPasteboardContent();
		}.bind(this));

		this.socket = Network.createUDPServer('0.0.0.0', 16533, function (r) {
			r = JSONSafeParse(r);
			if (r.device && r.device.id != this._device.id && r.data) {
				this.setState({income: {
					text: r.data.data,
					from: r.device.plat + '-' + r.device.name,
				}});

				this.refs.nav.push({id: 'income'});
			}
		}.bind(this));

		this.getPasteboardContent();
	},

	createBtn(title, cb) {
			return <TouchableHighlight style={styles.copyBox.button} onPress={cb}>
				<Text style={styles.copyBox.buttonText}>{title}</Text>
			</TouchableHighlight>
	},

	incomeView() {
		var incomeBtns = [
			this.createBtn('COPY', this._onPressCopy),
		];

		if (this.state.income.text.substr(0, 4) == 'http')
			incomeBtns.push(this.createBtn('OPEN', this._onPressOpen));

		return (
			<View style={styles.copyBox.wrap}>
				<Text style={styles.copyBox.text}>{this.state.income.text}</Text>
				<View style={styles.copyBox.bar}>
					<Text style={styles.copyBox.label}>{'@'+this.state.income.from}</Text>
					<View style={styles.copyBox.btnbar}>{incomeBtns}</View>
				</View>
			</View>
		);
	},

	outcomeView() {
		return (
			<View style={styles.copyBox.wrap}>
				<Text style={styles.copyBox.text}>{this.state.outcome.text}</Text>
				<View style={styles.copyBox.bar}>
					<Text style={styles.copyBox.label}>{'@'+this.state.outcome.from}</Text>
					{this.createBtn('SEND', this._onPressSend)}
				</View>
			</View>
		);
	},

	navRenderScene(route, nav) {
		var view = null;

		if (route.id == 'income') {
			view = this.incomeView();
		} else if (route.id == 'outcome') {
			view = this.outcomeView();
		}
		return <View style={styles.container}>
			{view}
		</View>
	},

  render() {
		return (
			<Navigator
				ref="nav"
				initialRoute={{id: 'outcome'}}
				renderScene={this.navRenderScene}
				configureScene={(route) => Navigator.SceneConfigs.FloatFromRight}
			/>
		);
  },

	_onPressOpen() {
		LinkingIOS.openURL(this.state.income.text);
	},

	_onPressCopy() {
		NativePasteboard.setContent(this.state.income.text);
	},

	_onPressSend() {
		this.socket.sendto('224.0.0.1', 16533, JSON.stringify({
			device: this._device,
			data: this.state.outcome.text,
		}));
	},
});

var copyBoxMargin = 10;

var styles = {
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#ddd',
		paddingVertical: 5,
  },

	copyBox: {
		wrap: {
			backgroundColor: '#ffffff',
			marginHorizontal: 10,
			marginVertical: 5,
			flex: 1,
    	justifyContent: 'space-between',
			alignSelf: 'stretch',
			borderRadius: 10,
			borderColor: '#aaa',
			borderWidth: 1,
			textAlign: 'left',
			padding: 10,
		},
		text: {
			fontFamily: 'Courier',
			color: '#555',
			fontSize: 14,
		},
		bar: {
			alignItems: 'flex-end',
			justifyContent: 'space-between',		
		},
		label: {
			alignSelf: 'flex-start',
			fontFamily: 'Courier',
			fontSize: 12,
			color: '#aaa',
			marginBottom: 5,
		},
		button: {
			backgroundColor: '#ddd',
			borderRadius: 10,
			paddingVertical: 5,
			paddingHorizontal: 10,
			marginLeft: 5,
		},
		btnbar: {
			flexDirection: 'row',
		},
		buttonText: {
			color: '#aaa', 
			fontFamily: 'Arial Rounded MT Bold', 
			fontSize: 15,
		},
	},
};

AppRegistry.registerComponent('iosapp', () => iosapp);
