//require
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

	console.log(Object.keys(modules.blocks.getAll()).length);
}

//export
module.exports = Transport;