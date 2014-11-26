//require
var genesis = require('../helpers/genesisblock.js')
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

    /*
	console.time('verifying');
	var blocks = modules.blocks.getAll();
	async.eachLimit(Object.keys(blocks), 10, function (item, cb) {
		var res = modules.blocks.verifySignature(blocks[item]);
		setImmediate(cb)
	}, function(){
		console.timeEnd('verifying');
	});
	*/
}

//export
module.exports = Transport;