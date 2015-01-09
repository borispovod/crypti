var timeHelper = require("../helpers/time.js"),
	async = require('async'),
	ed = require('ed25519'),
	constants = require('../helpers/constants.js'),
	crypto = require('crypto'),
	configHelper = require('../helpers/config.js'),
	params = require('../helpers/params.js'),
	basicAuth = require('basic-auth'),
	Router = require('../helpers/router.js'),
	slots = require('../helpers/slots.js'),
	schedule = require('node-schedule');

//private fileds
var modules, library, self;

var keypair, forgingStarted, timer;
var loaded = false;

//constructor
function Forger(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var auth = function (req, res, next) {
		function unauthorized(res) {
			res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
			return res.send(401);
		}

		var user = basicAuth(req);

		if (!user || !user.name || !user.pass) {
			return unauthorized(res);
		}

		if (user.name === library.config.adminPanel.auth.user && user.pass === library.config.adminPanel.auth.password) {
			return next();
		} else {
			return unauthorized(res);
		}
	};

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	if (library.config.adminPanel && library.config.adminPanel.auth && library.config.adminPanel.auth.user && library.config.adminPanel.auth.password) {
		router.get('/', auth, function (req, res) {
			return res.status(200).json({success: true, enabled: forgingStarted || false});
		})
	} else {
		router.get('/', function (req, res) {

			if (!forgingStarted) {
				return res.status(200).json({success: true, enabled: false});
			} else {
				return res.json({success: true, enabled: true});
			}
		})
	}

	router.post('/enable', function (req, res) {
		var secret = params.string(req.body.secret);
		if (!secret || secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (forgingStarted) {
			return res.json({success: false, error: "Forging already started"});
		}

		keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf').digest());
		startForging(keypair);

		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);


		var saveToConfig = params.bool(req.body.saveToConfig);

		if (saveToConfig) {
			configHelper.saveSecret(secret, function (err) {
				if (err) {
					library.logger.error(err);
				}

				return res.json({success: true, address: address});
			})
		} else {
			return res.json({success: true, address: address});
		}
	});

	router.post('/disable', function (req, res) {
		var secret = params.string(req.body.secret);

		if (!secret || secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (!forgingStarted) {
			return res.json({success: false, error: "Forging already disabled"});
		}

		if (keypair.privateKey.toString('hex') != ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf').digest()).privateKey.toString('hex')) {
			return res.json({success: false, error: "Provide valid secret key to stop forging"});
		}

		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);
		stopForging();

		return res.json({success: true, address: address});
	});


	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/forging', router);
	library.app.use(function (err, req, res, next) {
		library.logger.error('/api/forging', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});
}

function stopForging() {
	forgingStarted = false;
	keypair = null;
	library.logger.info("Forging disabled...");
}

function getNextBlockTime(delegate_ids) {
	var activeDelegates = modules.delegates.getActiveDelegates();

	var nextSlot = slots.getNextSlot();
	var lastSlot = slots.getLastSlot(nextSlot);

	for (; nextSlot < lastSlot; nextSlot += 1) {
		var delegate_pos = nextSlot % slots.delegates;
		var delegate_id = activeDelegates[delegate_pos];

		if (delegate_ids.indexOf(delegate_id) != -1) {
			return slots.getSlotTime(nextSlot);
		}
	}
	return null;
}

function loop(account, cb) {
	if (!loaded || modules.loader.syncing()) {
		return setImmediate(cb);
	}

	if (account.balance < 1000 * constants.fixedPoint) {
		return setImmediate(cb);
	}

	var enabledDelegates = modules.delegates.myDelegates(account.publicKey);
	if (!enabledDelegates.length) {
		return setImmediate(cb);
	}

	var nextBlockTime = getNextBlockTime(enabledDelegates);
	if (nextBlockTime && nextBlockTime <= slots.getTime()) {
		library.sequence.add(function (cb) {
			if (slots.getSlotNumber(nextBlockTime) == slots.getSlotNumber()) {
				modules.blocks.generateBlockv2(keypair, cb);
			} else {
				setImmediate(cb);
			}
		}, function (err) {
			if (err) {
				library.logger.error("Problem in block generation", err);
			}
			setImmediate(cb, err);
		});
	}
}

function startForging(keypair) {
	var delegate = modules.delegates.getDelegate(keypair.publicKey);
	var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);
	var account = modules.accounts.getAccount(address);

	if (!delegate || !account) return;

	library.logger.info("Forging enabled on account: " + address);

	forgingStarted = true;

	process.nextTick(function nextLoop() {
		loop(account, function (err) {
			err && library.logger.error('delegate loop', err);
			if (forgingStarted) {
				var nextSlot = slots.getNextSlot();
				var scheduledTime = slots.getSlotTime(nextSlot);
				scheduledTime = scheduledTime <= slots.getTime() ? scheduledTime + 1 : scheduledTime;
				schedule.scheduleJob(scheduledTime * 1000, nextLoop);
			} else {
				stopForging();
			}
		})
	});
}

//public methods

//events
Forger.prototype.onBind = function (scope) {
	modules = scope;
	var secret = library.config.forging.secret

	if (secret) {
		keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf').digest());
		startForging(keypair);
	}
}

Forger.prototype.onBlockchainReady = function () {
	loaded = true;
}

//export
module.exports = Forger;