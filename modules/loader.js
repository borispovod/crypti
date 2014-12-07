var async = require('async');
var Router = require('../helpers/router.js');

//private
var modules, library, self;
var total = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	// need to fix it, last block will exists all time
	router.get('/status', function (req, res) {
		if (modules.blocks.getLastBlock()) {
			return res.json({
				success: true,
				height: modules.blocks.getLastBlock().height,
				blocksCount: total,
				loaded: self.loaded()
			});
		} else {
			return res.json({success: false});
		}
	});

	library.app.use('/api/loader', router);

	cb(null, this);
}

Loader.prototype.loaded = function(){
	return modules.blocks.getLastBlock().height == total;
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 1000;
	modules.blocks.count(function (err, count) {
		total = count;
		library.logger.info('count = ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('offset = ' + offset);
				process.nextTick(function () {
					modules.blocks.loadBlocks(limit, offset, function (err, res) {
						offset = offset + limit;
						cb(err, res)
					});
				})
			}, function (err, res) {
				if (err) {
					library.logger.error(err);
				}
				library.logger.info('loaded');
				modules.blocks.setLoading(false);
			}
		)
	})
}

//export
module.exports = Loader;