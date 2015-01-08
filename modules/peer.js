var async = require('async'),
	util = require('util'),
	ip = require('ip'),
	Router = require('../helpers/router.js'),
	params = require('../helpers/params.js'),
	arrayHelper = require('../helpers/array.js'),
	normalize = require('../helpers/normalize.js');

//private fields
var modules, library, self;

//constructor
function Peer(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		var state = params.int(req.query.state),
			os = params.string(req.query.os),
			version = params.string(req.query.version),
			limit = params.string(req.query.limit),
			shared = params.bool(req.query.shared),
			orderBy = params.string(req.query.orderBy),
			offset = params.int(req.query.offset);

		if (limit < 0 || limit > 100) {
			return res.json({success: false, error: "Max limit is 100"});
		}

		getByFilter({
			state: state,
			os: os,
			version: version,
			limit: limit,
			shared: shared,
			orderBy: orderBy,
			offset: offset
		}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peers: peers});
		});
	});

	router.get('/get', function (req, res) {
		var ip = params.string(req.query.ip);
		var port = params.int(req.query.port);

		if (!ip) {
			return res.json({success: false, error: "Provide ip in url"});
		}

		if (!port) {
			return res.json({success: false, error: "Provide port in url"});
		}

		getByFilter({
			ip: ip,
			port: port
		}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peer: peers.length ? peers[0] : {}});
		});
	})

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/peers', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/peers', err)
		res.status(500).send({success: false, error: err});
	});
}

function updatePeerList(cb) {
	modules.transport.getFromRandomPeer('/list', function (err, data) {
		if (err) {
			return cb();
		}

		var peers = params.array(data.body.peers);
		async.eachLimit(peers, 2, function (peer, cb) {
			peer = normalize.peer(peer);

			if (ip.toLong("127.0.0.1") == peer.ip || peer.port == 0 || peer.port > 65535) {
				setImmediate(cb);
				return;
			}

			self.update(peer, cb);
		}, cb);
	});
}

function count(cb) {
	var params = {};

	library.db.get("select count(rowid) as count from peers", params, function (err, res) {
		if (err) {
			library.logger.error('Peer#count', err);
			return cb(err);
		}
		cb(null, res.count)
	})
}

function banManager(cb) {
	library.db.serialize(function () {
		library.db.get("select count(*) as ban from peers where (state = 0 and clock - $now < 0)", {$now: Date.now()}, function (err, res) {
			if (err) {
				library.logger.error(err);
			}

			var st = library.db.prepare("UPDATE peers SET state = 1, clock = null where (state = 0 and clock - $now < 0)");
			st.bind({$now: Date.now()});
			st.run(function () {
				library.db.get("select count(*) as ban from peers where (state = 0 and clock - $now > 0)", {$now: Date.now()}, function (err, res) {
					if (err) {
						library.logger.error(err);
					}
				})
				cb()
			});
		});
	});
}

function getByFilter(filter, cb) {
	var limit = filter.limit || 100;
	var offset = filter.offset;
	delete filter.limit;
	delete filter.offset;

	var where = [];
	var params = {};
	Object.keys(filter).forEach(function (key) {
		where.push(key + " = " + '$' + key);
		params['$' + key] = filter[key];
	});

	params['$limit'] = limit;
	offset && (params['$offset'] = offset);

	library.db.all("select ip, port, state, os, sharePort, version from peers" + (where.length ? (' where ' + where.join(' and ')) : '') + ' limit $limit' + (offset ? ' offset $offset ' : ''), params, cb);
}

//public methods
Peer.prototype.list = function (limit, cb) {
	limit = limit || 100;
	var params = {$limit: limit};

	library.db.all("select ip, port, state, os, sharePort, version from peers where state > 0 and sharePort = 1 ORDER BY RANDOM() LIMIT $limit", params, cb);
}

Peer.prototype.state = function (ip, port, state, timeoutSeconds, cb) {
	if (state == 0) {
		var clock = (timeoutSeconds || 1) * 1000;
		clock = Date.now() + clock;
	} else {
		clock = null;
	}
	library.db.serialize(function () {
		var st = library.db.prepare("UPDATE peers SET state = $state, clock = $clock WHERE ip = $ip and port = $port;");
		st.bind({$state: state, $clock: clock, $ip: ip, $port: port});
		st.run(function (err) {
			err && library.logger.error('Peer#state', err);

			cb && cb()
		});
	});
}

Peer.prototype.update = function (peer, cb) {
	library.db.serialize(function () {
		var params = {
			$ip: peer.ip,
			$port: peer.port,
			$os: peer.os,
			$sharePort: peer.sharePort,
			$version: peer.version
		}
		var st = library.db.prepare("INSERT OR IGNORE INTO peers (ip, port, state, os, sharePort, version) VALUES ($ip, $port, $state, $os, $sharePort, $version);");
		st.bind(arrayHelper.extend({}, params, {$state: 1}));
		st.run();

		st = library.db.prepare("UPDATE peers SET os = $os, sharePort = $sharePort, version = $version" + (peer.state !== undefined ? ", state = $state " : "") + " WHERE ip = $ip and port = $port;");
		if (peer.state !== undefined) {
			params.$state = peer.state;
		}
		st.bind(params);
		st.run();


		st.finalize(function (err) {
			err && library.logger.error('Peer#update', err);
			cb && cb()
		});
	});
}

//events
Peer.prototype.onBind = function (scope) {
	modules = scope;
}

Peer.prototype.onBlockchainReady = function () {
	async.forEach(library.config.peers.list, function (peer, cb) {
		var st = library.db.prepare("INSERT OR IGNORE INTO peers(ip, port, state, sharePort) VALUES($ip, $port, $state, $sharePort)");
		st.bind({
			$ip: ip.toLong(peer.ip),
			$port: peer.port,
			$state: 2,
			$sharePort: Number(true)
		});
		st.run(cb);
	}, function (err) {
		if (err) {
			library.logger.error('onBlockchainReady', err);
		}

		count(function (err, count) {
			if (count) {
				updatePeerList(function (err) {
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
	debugger;
	process.nextTick(function nextUpdatePeerList() {
		updatePeerList(function (err) {
			err && library.logger.error('updatePeerList timer', err);
			setTimeout(nextUpdatePeerList, 60 * 1000);
		})
	});

	process.nextTick(function nextBanManager() {
		banManager(function (err) {
			err && library.logger.error('banManager timer', err);
			setTimeout(nextBanManager, 65 * 1000)
		});
	});
}

//export
module.exports = Peer;
