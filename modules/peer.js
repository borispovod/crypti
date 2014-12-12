var async = require('async');
var util = require('util');
var ip = require('ip');

//private
var modules, library, self;

//constructor
function Peer(cb, scope) {
	library = scope;
	self = this;

	cb(null, this);
}
//public
Peer.prototype.run = function (scope) {
	modules = scope;
}

Peer.prototype.list = function (limit, cb) {
	limit = limit || 100;
	var params = {$limit: limit};

	library.db.all("select ip, port, state, os, sharePort, version from peers where state != 0 and sharePort = 1 ORDER BY RANDOM() LIMIT $limit", params, cb);
}

Peer.prototype.state = function (ip, port, state, cb) {
	var st = library.db.prepare("UPDATE peers SET state = $state WHERE ip = $ip and port = $port;");
	st.bind({$state: state, $ip: ip, $port: port});
	st.run(function (err) {
		err && console.log(err);
		cb && cb()
	});
}

Peer.prototype.update = function (peer, cb) {
	library.db.serialize(function () {

		var params = {
			$ip: peer.ip,
			$port: peer.port,
			$state: peer.state,
			$os: peer.os,
			$sharePort: peer.sharePort,
			$version: peer.version
		}

		var st = library.db.prepare("INSERT OR IGNORE INTO peers (ip, port, state, os, sharePort, version) VALUES ($ip, $port, $state, $os, $sharePort, $version);");
		st.bind(params);
		st.run();

		var st = library.db.prepare("UPDATE peers SET state = $state, os = $os, sharePort = $sharePort, version = $version WHERE ip = $ip and port = $port;");
		st.bind(params);
		st.run();

		st.finalize(function (err) {
			err && console.log(err);
			cb && cb()
		});
	});
}

Peer.prototype.count = function (cb) {
	var params = {};

	library.db.get("select count(rowid) as count from peers", params, function (err, res) {
		cb(err, res.count)
	})
}

//export
module.exports = Peer;
