var constants = require("../helpers/constants.js"),
	RequestSanitizer = require('../helpers/request-sanitizer'),
	async = require("async"),
	fs = require('fs'),
	path = require('path'),
	git = require('gift'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	Router = require('../helpers/router.js'),
	npm = require('npm'),
	sandbox = require('../helpers/sandbox.js'),
	extend = require('extend'),
	rmdir = require('rimraf').sync,
	errorCode = require('../helpers/errorCodes.js').error,
	Sandbox = require("crypti-sandbox");

var modules, library, self, private = {};

private.unconfirmedNames = {};
private.unconfirmedLinks = {};
private.appPath = process.cwd();
private.sandboxes = {};
private.routes = {};

private.createBasePathes = function () {
	var dAppPath = path.join(private.appPath, "dapps");
	var dAppPublic = path.join(private.appPath, "public", "dapps");

	//need to add check for folder permissions
	if (!fs.existsSync(dAppPath)) {
		fs.mkdirSync(dAppPath);
	}

	if (!fs.existsSync(dAppPublic)) {
		fs.mkdirSync(dAppPublic);
	}
}

private.resumeDApp = function (dApp, cb) {
	var id = dApp.id;

	library.logger.info("Resume " + id + " DApp");

	if (private.sandboxes[id]) {
		private.sandboxes[id].kill(0);
		delete private.sandboxes[id];
		delete private.routes[id];
		library.logger.info("DApp " + id + " resumed");
		return setImmediate(cb);
	} else {
		library.logger.info("DApp " + id + " not launched");
		return setImmediate(cb, "This DApp not launched");
	}
}

private.uninstallDApp = function (dApp, cb) {
	var id = dApp.id;

	private.resumeDApp(dApp, function () {
		var dAppPath = path.join(private.appPath, "dapps", id);

		if (fs.existsSync(dAppPath)) {
			library.logger.info("Removing DApp " + id);

			var dAppPathLink = path.join(private.appPath, "public", "dapps", id);

			if (fs.existsSync(dAppPathLink)) {
				library.logger.info("Removing public folder of DApp " + id);

				fs.unlinkSync(dAppPathLink);

				library.logger.info("Removed DApp " + id + " public path");
			}

			rmdir(dAppPath);
			library.logger.info("Deleted DApp " + id + " path");

			setImmediate(cb);
		} else {
			library.logger.info("DApp " + id + " not installed");
			return setImmediate(cb, "DApp " + id + " not installed");
		}
	});
}

private.installDApp = function (dApp, cb) {
	var id = dApp.id;

	library.logger.info("Installing " + id + " DApp");

	var dAppPath = path.join(private.appPath, "dapps", id);

	if (fs.existsSync(dAppPath)) {
		return setImmediate(cb, "This DApp is already installed");
	}

	git.clone(dApp.git, dAppPath, function (err, repo) {
		if (err) {
			library.logger.error(err.toString());
			return setImmediate(cb, "Git error of cloning repository " + dApp.git + " at " + id);
		}
		var packageJson = path.join(dAppPath, "package.json");
		var config = null;

		try {
			config = JSON.parse(fs.readFileSync(packageJson));
		} catch (e) {
			return setImmediate(cb, "Incorrect package.json file for " + id + " DApp");
		}

		npm.load(config, function (err) {
			if (err) {
				library.logger.error(err.toString());
				setImmediate(cb, "Can't read package.json of " + id + " DApp");
			} else {
				npm.root = path.join(dAppPath, "node_modules");
				npm.prefix = dAppPath;

				npm.commands.install(function (err, data) {
					if (err) {
						library.logger.error(err.toString());
						setImmediate(cb, "Can't install dependencies of " + id + " DApp");
					} else {
						library.logger.info("DApp " + id + " dependencies installed");

						async.series([
							function (cb) {
								var dAppBlockchainFile = path.join(dAppPath, "blockchain.json");
								if (fs.existsSync(dAppBlockchainFile)) {
									library.logger.info("DApp " + id + " database initializing");

									var file = fs.readFileSync(dAppBlockchainFile, 'utf8');

									try {
										var sqlQueries = JSON.parse(file);
									} catch (e) {
										library.logger.error("Can't parse json from blockchain file of DApp " + id + ": " + e.toSring());
									}

									async.eachSeries(sqlQueries.tables, function (table, cb) {
										var query = "CREATE TABLE " + id + "_" + table.name + " " + table.values + ";";
										library.dbLite.query(query, cb);
									}, function (err) {
										if (err) {
											setImmediate(cb, "Error when create blockchain of DApp " + id + ": " + err.toString());
										} else {
											library.logger.info("DApp " + id + " database initializing");
										}
									});
								}
							},
							function (cb) {
								var dAppPublicPath = path.join(dAppPath, "public");

								if (fs.existsSync(dAppPublicPath)) {
									library.logger.info("Initialize public html/js/css folder");

									var dAppPublicLink = path.join(private.appPath, "public", "dapps", id);

									if (fs.existsSync(dAppPublicLink)) {
										fs.unlinkSync(dAppPublicLink);
									}

									fs.symlinkSync(dAppPublicPath, dAppPublicLink);
									library.logger.info("DApp " + id + " public folder shared");
								}

								setImmediate(cb);
							}
						], function (err) {
							if (err) {
								return setImmediate(cb, err);
							} else {
								library.logger.info("DApp " + id + " succesfull installed");
								setImmediate(cb, null, dAppPath);
							}
						});
					}
				});

				npm.on("log", function (message) {
					library.logger.info(message);
				});
			}
		});
	});
}

private.initializeDAppRoutes = function (id, routes) {
	private.routes[id] = new Router();

	if (typeof routes != "object" || !routes.length) {
		return false;
	}

	routes.forEach(function (router) {
		if (router.method == "get" || router.method == "post" || router.method == "put") {
			private.routes[id][router.method](router.path, function (req, res) {
				private.sandboxes[id].sendMessage({
					method: router.method,
					path: router.path,
					query: req.query
				}, function (err, body) {
					body = ((err || typeof body != "object") ? {error: err} : body);
					var resultBody = extend(body, {success: !err});
					res.json(resultBody);
				});
			});
		}
	});

	library.network.app.use('/api/dapps/' + id + '/api/', private.routes[id]);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});

	return true;
}

private.apiHandler = function (message, callback) {
	debugger
	console.log(message);
	cb();
}

private.launchDApp = function (dApp, cb) {
	var id = dApp.id;

	if (private.sandboxes[id]) {
		return setImmediate(cb, "This dapp is already launched");
	}

	library.logger.info("Launching " + id + " DApp");

	var dAppPath = path.join(private.appPath, "dapps", id);

	if (!fs.existsSync(dAppPath)) {
		return setImmediate(cb, "This DApp is not installed");
	}

	var dAppConfig = null;

	try {
		dAppConfig = require(path.join(dAppPath, "config.json"));
	} catch (e) {
		return setImmediate(cb, "This DApp has no config file, can't launch it");
	}

	var sandbox = private.sandboxes[id] = new Sandbox(path.join("dapps", id, "index.js"), private.apiHandler, true);

	sandbox.on("exit", function () {
		debugger
		delete private.sandboxes[id];
		delete private.routes[id];
		library.logger.info("DApp " + id + " closed");
	});

	sandbox.on("error", function (err) {
		debugger
		delete private.sandboxes[id];
		delete private.routes[id];
		library.logger.info("Error in DApp " + id + " " + err.toString());
	});

	sandbox.run();

	//setInterval(function () {
	//	console.log("send inside", {test: 3})
	//	sandbox.sendMessage({test: 3}, function (err, body) {
	//		console.log("callback inside", err, body)
	//	});
	//}, 1000);

	library.logger.info("DApp " + id + " launched");

	function halt(message) {
		debugger
		sandbox.kill(0);
		delete private.sandboxes[id];
		delete private.routes[id];
		setImmediate(cb, "Can't connect to api of DApp " + id + " , routes file not found");
	}

	var dAppRoutesPath = path.join(dAppPath, "api", "routes.js"),
		dAppRoutes = null;

	if (fs.existsSync(dAppRoutesPath)) {
		try {
			dAppRoutes = require(dAppRoutesPath);
		} catch (e) {
			return halt("Can't connect to api of DApp " + id + " , routes file not found");
		}
	}

	if (dAppRoutes && !private.initializeDAppRoutes(id, dAppRoutes)) {
		return halt("Can't launch api, incorrect routes object of DApp " + id);
	}

	setImmediate(cb);
}

private.get = function (id, cb) {
	library.dbLite.query("SELECT name, description, tags, git FROM dapps WHERE transactionId=$id", {
		id: id
	}, ['name', 'description', 'tags', 'git'], function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Can't find dapp with id " + id);
		}
		var dapp = rows[0];
		dapp.id = id;
		cb(null, dapp);
	})
}

function DApp() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.dapp = {
			name: data.name,
			description: data.description,
			git: data.git,
			tags: data.tags
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 100 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.dapp.name || trs.asset.dapp.name.length > 16) {
			return cb("Incorrect dapp name length");
		}

		if (trs.asset.dapp.description && trs.asset.dapp.description.length > 160) {
			return cb("Incorrect dapp description length");
		}

		if (trs.asset.dapp.tags && trs.asset.dapp.tags.length > 160) {
			return cb("Incorrect dapp tags length");
		}

		if (!trs.asset.dapp.git || !(/^git\@github.com\:.+.git$/.test(trs.asset.dapp.git))) {
			return cb("Incorrect dapp git address, example git@github.com:author/project.git");
		}

		if (trs.amount != 0) {
			return cb("Invalid transaction amount");
		}

		cb(null, trs);
	}

	this.process = function (dbLite, trs, sender, cb) {
		dbLite.query("SELECT name, git FROM dapps WHERE name = $name or git = $git", {
			name: trs.asset.dapp.name,
			git: trs.asset.dapp.git
		}, ['name', 'git'], function (err, rows) {
			if (err) {
				return cb("Sql error");
			}
			if (rows.length) {
				if (rows[0].git) {
					return cb("This git repository already using in DApp Store");
				} else {
					return cb("This name already using in DApp Store");
				}
			}
			setImmediate(cb, null, trs);
		});
	}

	this.getBytes = function (trs) {
		try {
			var name = new Buffer(trs.asset.dapp.name, 'utf8');
			var description = new Buffer(trs.asset.dapp.description || '', 'utf8');
			var tags = new Buffer(trs.asset.dapp.tags || '', 'utf8');
			var git = new Buffer(trs.asset.dapp.git, 'utf8');

			var buffer = Buffer.concat([name, description, tags, git]);
		} catch (e) {
			throw Error(e.toString());
		}

		return buffer;
	}

	this.apply = function (trs, sender) {
		sender.isUnconfirmedDAppAccount = false;
		sender.isDAppAccount = true;
		return true;
	}

	this.undo = function (trs, sender) {
		sender.isUnconfirmedDAppAccount = true;
		sender.isDAppAccount = false;
		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (private.unconfirmedNames[trs.asset.dapp.name]) {
			return setImmediate(cb, "dapp name exists");
		}

		if (private.unconfirmedLinks[trs.asset.dapp.git]) {
			return setImmediate(cb, "dapp link exists");
		}

		if (sender.isDAppAccount || sender.isUnconfirmedDAppAccount) {
			return setImmediate(cb, "account is not dapp");
		}

		private.unconfirmedNames[trs.asset.dapp.name] = true;
		private.unconfirmedLinks[trs.asset.dapp.git] = true;
		sender.isUnconfirmedDAppAccount = true;

		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		private.unconfirmedNames[trs.asset.dapp.name] = false;
		private.unconfirmedLinks[trs.asset.dapp.git] = false;
		sender.isUnconfirmedDAppAccount = false;
		return true;
	}

	this.objectNormalize = function (trs) {
		var report = RequestSanitizer.validate(trs.asset.dapp, {
			object: true,
			properties: {
				name: "string!",
				description: "string",
				tags: "string",
				git: "string!"
			}
		});

		if (!report.isValid) {
			throw Error(report.issues);
		}

		trs.asset.dapp = report.value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.da_name) {
			return null;
		} else {
			var dapp = {
				transactionId: raw.t_id,
				name: raw.da_name,
				description: raw.da_description,
				tags: raw.da_tags,
				git: raw.da_git
			}

			return {dapp: dapp};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO dapps(transactionId, name, description, tags, git) VALUES($transactionId, $name, $description, $tags, $git)", {
			transactionId: trs.id,
			name: trs.asset.dapp.name,
			description: trs.asset.dapp.description ? trs.asset.dapp.description : null,
			tags: trs.asset.dapp.tags ? trs.asset.dapp.tags : null,
			git: trs.asset.dapp.git
		}, cb);
	}

	this.ready = function (trs) {
		return true;
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			secondSecret: "string",
			publicKey: "hex?",
			name: "string!",
			description: "string",
			tags: "string",
			git: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
			}

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
			}

			var secondKeypair = null;

			if (account.secondSignature) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.DAPP,
				name: body.name,
				description: body.description,
				tags: body.tags,
				git: body.git,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair
			});

			library.sequence.add(function (cb) {
				modules.transactions.receiveTransactions([transaction], cb);
			}, function (err) {
				if (err) {
					return res.json({success: false, error: err});
				}

				res.json({success: true, transaction: transaction});
			});
		});
	});

	router.post("/install", function (req, res) {
		req.sanitize("body", {
			id: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.dapps.access.whiteList.length > 0 && library.config.dapps.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}
				library.sequence.add(function (cb) {
					private.installDApp(dapp, cb);
				}, function (err, path) {
					if (err) {
						return res.json({success: false, error: err});
					}
					res.json({success: true, path: path});
				});
			})

		});
	});

	router.post("/launch", function (req, res) {
		req.sanitize("body", {
			id: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.dapps.access.whiteList.length > 0 && library.config.dapps.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}
				library.sequence.add(function (cb) {
					private.launchDApp(dapp, cb);
				}, function (err, sandbox) {
					if (err) {
						return res.json({success: false, error: err});
					}
					res.json({success: true});
				});
			});
		});
	});

	router.post("/resume", function (req, res) {
		req.sanitize("body", {
			id: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.dapps.access.whiteList.length > 0 && library.config.dapps.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}
				library.sequence.add(function (cb) {
					private.resumeDApp(dapp, cb);
				}, function (err, sandbox) {
					if (err) {
						return res.json({success: false, error: err});
					}
					res.json({success: true});
				});
			});

		});
	});

	router.post("/uninstall", function (req, res) {
		req.sanitize("body", {
			id: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.dapps.access.whiteList.length > 0 && library.config.dapps.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			private.get(body.id, function (err, dapp) {
				if (err) {
					return res.json({success: false, error: err});
				}
				library.sequence.add(function (cb) {
					private.uninstallDApp(dapp, cb);
				}, function (err, sandbox) {
					if (err) {
						return res.json({success: false, error: err});
					}
					res.json({success: true});
				});
			});
		});
	});

	library.network.app.use('/api/dapps', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

function DApps(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	private.createBasePathes();

	library.logic.transaction.attachAssetType(TransactionTypes.DAPP, new DApp());

	setImmediate(cb, null, self);
}

DApps.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = DApps;