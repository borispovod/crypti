var async = require('async'),
	util = require('util'),
	ip = require('ip'),
	Router = require('../helpers/router.js'),
	extend = require('extend'),
	fs = require('fs'),
	path = require('path'),
	errorCode = require('../helpers/errorCodes.js').error;

require('array.prototype.find'); //old node fix

//private fields
var modules, library, self, private = {};

//constructor
function Peer(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				state: {
					type: "integer",
					minimum: 0,
					maximum: 3
				},
				os: {
					type: "string"
				},
				version: {
					type: "string"
				},
				limit: {
					type: "integer",
					minimum: 0,
					maximum: 100
				},
				shared: {
					type: "integer",
					minimum: 0,
					maximum: 1
				},
				orderBy: {
					type: "string"
				},
				offset: {
					type: "integer",
					minimum: 0
				},
				port: {
					type: "integer",
					minimum: 1,
					maximum: 65535
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			if (!query.limit) {
				query.limit = 100;
			}

			private.getByFilter(query, function (err, peers) {
				if (err) {
					return res.json({success: false, error: errorCode("PEERS.PEER_NOT_FOUND")});
				}

				for (var i = 0; i < peers.length; i++) {
					peers[i].ip = ip.fromLong(peers[i].ip);
				}

				res.json({success: true, peers: peers});
			});
		});
	});

	router.get('/version', function (req, res) {
		return res.json({success: true, version: library.config.version, build: library.build});
	})

	router.get('/get', function (req, res) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				ip_str: {
					type: "string",
					minLength: 1
				},
				port: {
					type: "integer",
					minimum: 0,
					maximum: 65535
				}
			},
			required: ['ip_str', 'port']
		}, function (err, report, query) {
			try {
				var ip_str = ip.toLong(query.ip_str);
			} catch (e) {
				return res.json({success: false, error: errorCode("PEERS.INVALID_PEER")});
			}

			private.getByFilter({
				ip: ip_str,
				port: port
			}, function (err, peers) {
				if (err) {
					return res.json({success: false, error: errorCode("PEERS.PEER_NOT_FOUND")});
				}

				var peer = peers.length ? peers[0] : null;

				if (peer) {
					peer.ip = ip.fromLong(peer.ip);
				}

				res.json({success: true, peer: peer || {}});
			});
		});
	});

	router.use(function (req, res) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/peers', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.updatePeerList = function (cb) {
	modules.transport.getFromRandomPeer({
		api: '/list',
		method: 'GET'
	}, function (err, data) {
		if (err) {
			return cb();
		}

		var report = library.scheme.validate(data.body, {type: "object", properties: {
			peers: {
				type: "array"
			}
		}, required: ['peers']});

		if (!report) {
			return cb();
		}

		var peers = data.body.peers;

		//var peers = RequestSanitizer.array(data.body.peers);
		async.eachLimit(peers, 2, function (peer, cb) {
			var report = library.scheme.validate(peer, {
				type: "object",
				properties: {
					ip: {
						type: 'string'
					},
					port: {
						type: "integer",
						minimum: 1,
						maximum: 65535
					},
					state: {
						type: "integer",
						minimum: 0,
						maximum: 3
					},
					os: {
						type: "string"
					},
					sharePort: {
						type: "integer"
					},
					version: {
						type: "string"
					}
				},
				required: ['ip', 'port', 'state', 'sharePort']
			});

			if (!report) {
				setImmediate(cb, "Peers incorrect");
				return;
			}

			if (ip.toLong("127.0.0.1") == peer.ip || peer.port == 0 || peer.port > 65535) {
				setImmediate(cb);
				return;
			}

			self.update(peer, cb);
		}, cb);
	});
}

private.count = function (cb) {
	library.dbLite.query("select count(rowid) from peers", {"count": Number}, function (err, rows) {
		if (err) {
			library.logger.error('Peer#count', err);
			return cb(err);
		}
		var res = rows.length && rows[0].count;
		cb(null, res)
	})
}

private.banManager = function (cb) {
	library.dbLite.query("UPDATE peers SET state = 1, clock = null where (state = 0 and clock - $now < 0)", {now: Date.now()}, cb);
}

private.getByFilter = function (filter, cb) {
	var sortFields = ["ip", "port", "state", "os", "sharePort", "version"];
	var sortMethod = '', sortBy = ''
	var limit = filter.limit || null;
	var offset = filter.offset || null;
	delete filter.limit;
	delete filter.offset;

	var where = [];
	var params = {};

	if (filter.hasOwnProperty('state') && filter.state !== null) {
		where.push("state = $state");
		params.state = filter.state;
	}

	if (filter.hasOwnProperty('os') && filter.os !== null) {
		where.push("os = $os");
		params.os = filter.os;
	}

	if (filter.hasOwnProperty('version') && filter.version !== null) {
		where.push("version = $version");
		params.version = filter.version;
	}

	if (filter.hasOwnProperty('shared') && filter.shared !== null) {
		where.push("sharePort = $sharePort");
		params.sharePort = filter.shared;
	}

	if (filter.hasOwnProperty('ip') && filter.ip !== null) {
		where.push("ip = $ip");
		params.ip = filter.ip;
	}

	if (filter.hasOwnProperty('port') && filter.port !== null) {
		where.push("port = $port");
		params.port = filter.port;
	}

	if (filter.hasOwnProperty('orderBy') && filter.orderBy !== null) {
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		} else {
			sortMethod = 'desc';
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid field to sort");
		}
	}

	if (limit !== null) {
		if (limit > 100) {
			return cb("Maximum limit is 100");
		}
		params['limit'] = limit;
	}

	if (offset !== null) {
		params['offset'] = offset;
	}

	library.dbLite.query("select ip, port, state, os, sharePort, version from peers " +
		(where.length ? (' where ' + where.join(' and ')) : '') +
		(sortBy ? ' order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(limit ? ' limit $limit' : '') +
		(offset ? ' offset $offset ' : ''),
		params, {
			"ip": String,
			"port": Number,
			"state": Number,
			"os": String,
			"sharePort": Number,
			"version": String
		}, function (err, rows) {
			cb(err, rows);
		});
}

//public methods
Peer.prototype.list = function (limit, cb) {
	limit = limit || 100;
	var params = {limit: limit};

	library.dbLite.query("select ip, port, state, os, sharePort, version from peers where state > 0 and sharePort = 1 ORDER BY RANDOM() LIMIT $limit", params, {
		"ip": String,
		"port": Number,
		"state": Number,
		"os": String,
		"sharePort": Number,
		"version": String
	}, function (err, rows) {
		cb(err, rows);
	});
}

Peer.prototype.state = function (pip, port, state, timeoutSeconds, cb) {
	var isFrozenList = library.config.peers.list.find(function (peer) {
		return peer.ip == ip.fromLong(pip) && peer.port == port;
	});
	if (isFrozenList !== undefined) return cb && cb('peer in white list');
	if (state == 0) {
		var clock = (timeoutSeconds || 1) * 1000;
		clock = Date.now() + clock;
	} else {
		clock = null;
	}
	library.dbLite.query("UPDATE peers SET state = $state, clock = $clock WHERE ip = $ip and port = $port;", {
		state: state,
		clock: clock,
		ip: pip,
		port: port
	}, function (err) {
		err && library.logger.error('Peer#state', err);

		cb && cb()
	});
}

Peer.prototype.remove = function (pip, port, cb) {
	var isFrozenList = library.config.peers.list.find(function (peer) {
		return peer.ip == ip.fromLong(pip) && peer.port == port;
	});
	if (isFrozenList !== undefined) return cb && cb('peer in white list');
	library.dbLite.query("DELETE FROM peers WHERE ip = $ip and port = $port;", {
		ip: pip,
		port: port
	}, function (err) {
		err && library.logger.error('Peer#delete', err);

		cb && cb(err)
	});
}

Peer.prototype.update = function (peer, cb) {
	var params = {
		ip: peer.ip,
		port: peer.port,
		os: peer.os || null,
		sharePort: peer.sharePort,
		version: peer.version || null
	}
	async.series([
		function (cb) {
			library.dbLite.query("INSERT OR IGNORE INTO peers (ip, port, state, os, sharePort, version) VALUES ($ip, $port, $state, $os, $sharePort, $version);", extend({}, params, {state: 1}), cb);
		},
		function (cb) {
			if (peer.state !== undefined) {
				params.state = peer.state;
			}
			library.dbLite.query("UPDATE peers SET os = $os, sharePort = $sharePort, version = $version" + (peer.state !== undefined ? ", state = CASE WHEN state = 0 THEN state ELSE $state END " : "") + " WHERE ip = $ip and port = $port;", params, cb);
		}
	], function (err) {
		err && library.logger.error('Peer#update', err);
		cb && cb()
	})
}

//events
Peer.prototype.onBind = function (scope) {
	modules = scope;
}

Peer.prototype.onBlockchainReady = function () {
	async.eachSeries(library.config.peers.list, function (peer, cb) {
		library.dbLite.query("INSERT OR IGNORE INTO peers(ip, port, state, sharePort) VALUES($ip, $port, $state, $sharePort)", {
			ip: ip.toLong(peer.ip),
			port: peer.port,
			state: 2,
			sharePort: Number(true)
		}, cb);
	}, function (err) {
		if (err) {
			library.logger.error('onBlockchainReady', err);
		}

		private.count(function (err, count) {
			if (count) {
				private.updatePeerList(function (err) {
					err && library.logger.error('updatePeerList', err);
					library.bus.message('peerReady');
				})
				library.logger.info('peer ready, stored ' + count);
			} else {
				library.logger.warn('peer list is empty');
			}
		});
	});
}

Peer.prototype.onPeerReady = function () {
	process.nextTick(function nextUpdatePeerList() {
		private.updatePeerList(function (err) {
			err && library.logger.error('updatePeerList timer', err);
			setTimeout(nextUpdatePeerList, 60 * 1000);
		})
	});

	process.nextTick(function nextBanManager() {
		private.banManager(function (err) {
			err && library.logger.error('banManager timer', err);
			setTimeout(nextBanManager, 65 * 1000)
		});
	});
}

//export
module.exports = Peer;
