var	async = require('async');

function Module(modules, cb) {
	var public = {};

	modules.blockchain.open(function(err, blockchain){
		console.log(blockchain.length);
	})

	cb(null, public);
}

module.exports.create = Module;