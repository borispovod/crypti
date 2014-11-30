//require

//private
var modules, library;

//constructor
function Loader(cb, scope) {
	library = scope;

	cb(null, this);
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 10000;
	modules.blocks.count(function (err, count) {
		library.logger.info('count = ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('offset = ' + offset)
				modules.blocks.loadBlocks(limit, offset, function (err, res) {
					offset = offset + limit;
					cb(err, res)
				});
			}, function (err, res) {
				if (err) {
					library.logger.error(err);
				}
				library.logger.info('loaded')
			}
		)
	})
}

//export
module.exports = Loader;