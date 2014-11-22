var	async = require('async');

function Module(modules, cb) {
	var public = {};

	modules.models.blocks.open(function(err, blockchain){
		if (!err) {
			console.log(blockchain.blocks.length);
		}
	})

	cb(null, public);
}

module.exports.create = Module;