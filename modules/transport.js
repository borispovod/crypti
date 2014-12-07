//require
var Router = require('../helpers/router.js');

//private
var modules, library, self;
var headers = {};

//constructor
function Transport(cb, scope) {
	library = scope;
	self = this;

	cb(null, this);
}

//public
Transport.prototype.run = function (scope) {
	modules = scope;

	headers = {
		os: modules.system.getOS(),
		version: modules.system.getVersion(),
		port: modules.system.getPort(),
		sharePort: modules.system.getSharePort()
	}
}

Transport.prototype.onBlockchainReady = function () {
	var router = new Router();

	router.get('/list', function (req, res) {
		//res.set(headers);
		res.json({success: true});
	});

	library.app.use('/peer', router);

	library.bus.message('peer ready');

	//modules.server.closeRoutes();

	library.logger.info('peer api started')
}

//export
module.exports = Transport;