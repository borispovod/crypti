var async = require('async');
var Router = require('../helpers/router.js');
var util = require('util');

//private
var modules, library, self, loaded;
var total = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	loaded = false;
	self = this;

	var router = new Router();

	router.get('/status', function (req, res) {
		if (modules.blocks.getLastBlock()) {
			return res.json({
				success: true,
				loaded: self.loaded(),
				now: modules.blocks.getLastBlock().height,
				blocksCount: total
			});
		} else {
			return res.json({success: false});
		}
	})

	library.app.use('/api/loader', router);

	cb(null, this);
}

Loader.prototype.loaded = function () {
	return loaded;
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 1000;
	modules.blocks.count(function (err, count) {
		total = count;
		library.logger.info('blocks ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('current ' + offset);
				process.nextTick(function () {
					modules.blocks.loadBlocksPart(limit, offset, function (err, res) {
						offset = offset + limit;
						cb(err, res)
					});
				})
			}, function (err, res) {
				if (err) {
					library.logger.error(err);
				}

				loaded = true;
				library.logger.info('blockchain ready');

				library.bus.message('blockchain ready');
			}
		)
	})
}

Loader.prototype.updatePeerList = function (cb) {
	modules.transport.request(1, '/list', function (err, list) {
		list = list && JSON.parse(list);
		if (!err && util.isArray(list)) {
			modules.peer.add(list, cb);
		} else {
			cb(err)
		}
	});
}

Loader.prototype.onPeerReady = function () {
	setTimeout(function next() {
		self.updatePeerList(function () {
			setTimeout(next, 10000)
		})
	}, 0)
}

//export
module.exports = Loader;