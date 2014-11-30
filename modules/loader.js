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
		console.log('count = ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				console.log('offset = ' + offset)
				modules.blocks.loadBlocks(limit, offset, function(err, res){
					offset = offset + limit;
					cb(err, res)
				});
			}, function (err, res) {
				console.log(err, res)
			}
		)
	})
}

//export
module.exports = Loader;