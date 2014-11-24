//require
var genesis = require('../block/genesisblock.js')
var util = require('util');
var async = require('async');

//private
var modules, library;

//constructor
function Transport(cb, scope) {
	library = scope;
	cb(null, this);
}

//public
Transport.prototype.run = function (scope) {
	modules = scope;

	var blocks = modules.blocks.getAll();
	console.log(Object.keys(blocks).length)
	async.eachLimit(Object.keys(blocks), 10, function (item, cb) {
		if (blocks[item].rowId == 1) return cb();
		var res = modules.blocks.verifySignature(blocks[item]);
		console.log(res)
		setImmediate(cb)
	})
}

//export
module.exports = Transport;