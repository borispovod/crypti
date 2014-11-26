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

	modules.blocks.loadBlocks(function (err) {
		if (err){
			console.log(err)
		}
	});
}

//export
module.exports = Loader;