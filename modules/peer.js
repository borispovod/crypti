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

	library.db.all("select ip, port from peers where blocked = 0 ORDER BY RANDOM() LIMIT $limit", params, cb)
}

Peer.prototype.count = function (cb) {
	var params = {};

	library.db.get("select count(rowid) as count from peers", params, function (err, res) {
		cb(err, res.count)
	})
}

Peer.prototype.ban = function (list, cb) {
	list = util.isArray(list) ? list : [list];

	var stmt = library.db.prepare("update peers set blocked = 1 where ip = $ip");

	for (var i = 0, length = list.length; i < length; i++) {
		stmt.run({
			$ip: list[i].ip
		});
	}

	stmt.finalize(cb);
}

Peer.prototype.add = function (list, cb) {
	list = util.isArray(list) ? list : [list];

	var stmt = library.db.prepare("insert or ignore into peers (ip, port, blocked) values ($ip, $port, 0)");

	for (var i = 0, length = list.length; i < length; i++) {
		stmt.run({
			$ip: list[i].ip,
			$port: list[i].port
		});
	}

	stmt.finalize(cb);
}

Peer.prototype.remove = function (list, cb) {
	list = util.isArray(list) ? list : [list];

	var stmt = library.db.prepare("delete from peers where ip = $ip and port = $port");

	for (var i = 0, length = list.length; i < length; i++) {
		stmt.run({
			$ip: list[i].ip,
			$port: list[i].port
		});
	}

	stmt.finalize(cb);
}

//export
module.exports = Peer;
