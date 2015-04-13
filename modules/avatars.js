var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	constants = require('../helpers/constants.js'),
	crypto = require('crypto'),
	Router = require('../helpers/router.js'),
	imageType = require('image-type');

var modules, library, self, private = {};

function Avatar() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;

		trs.asset.avatar = {
			image: data.image
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 200 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.avatar) {
			return cb("Invalid asset: " + trs.id);
		}

		if (!trs.asset.avatar.image) {
			return cb("Invalid message: " + trs.id);
		}

		if (trs.amount != 0) {
			return cb("Invalid amount: " + trs.id);
		}

		if (trs.recipientId) {
			return cb("Invalid recipient id: " + trs.id);
		}

		try {
			var image = new Buffer(trs.asset.avatar.image, 'hex');

			if (image.length > 10000 || image.length == 0) {
				return cb("Invalid image");
			}

			var type = imageType(image);

			if (type.ext != "png" || type.mime != 'image/png') {
				return cb("Image is not png, upload png image please");
			}
		} catch (e) {
			return cb("Invalid hex image or invalid image");
		}

		return cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var image = new Buffer(trs.asset.avatar.image, 'hex');

			var bb = new ByteBuffer(image.length, true);
			for (var i = 0; i < image.length; i++) {
				bb.writeByte(image[i]);
			}

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}

		return bb.toBuffer()
	}

	this.apply = function (trs, sender) {
		sender.avatar = true;
		sender.unconfirmedAvatar = false;

		return true;
	}

	this.undo = function (trs, sender) {
		sender.avatar = false;
		sender.unconfirmedAvatar = true;

		return true;
	}

	this.applyUnconfirmed = function (trs, sender) {
		if (sender.unconfirmedAvatar || sender.avatar) {
			return false;
		}

		sender.unconfirmedAvatar = true;

		return true;
	}

	this.undoUnconfirmed = function (trs, sender) {
		sender.unconfirmedAvatar = false;
		return true;
	}

	this.objectNormalize = function (trs) {
		trs.asset.avatar = RequestSanitizer.validate(trs.asset.avatar, {
			object: true,
			properties: {
				image: "hex!"
			}
		}).value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.a_image) {
			return null;
		} else {
			var avatar = {
				transactionId: raw.t_id,
				image: raw.a_image
			}

			return {avatar: avatar};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO avatars(image, transactionId) VALUES($image, $transactionId)", {
			image: new Buffer(trs.asset.avatar.image, 'hex'),
			transactionId: trs.id
		}, cb);
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get("/", function (req, res) {
		req.sanitize("query", {
			publicKey: "hex!"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			library.dbLite.query(
				"SELECT lower(hex(image)), transactionId FROM avatars where transactionId=(SELECT id FROM trs where lower(hex(senderPublicKey))=$senderPublicKey and type=" + TransactionTypes.AVATAR + ")",
				['image', 'transactionId'],
				{
					senderPublicKey: query.publicKey
				}, function (err, rows) {
					if (err || rows.length == 0) {
						return res.json({success: false, error: err || "Can't find avatar of this account"});
					}

					var image = new Buffer(rows[0].image, 'hex');

					res.writeHead(200, {'Content-Type': 'image/png'});
					res.writeHead(200, {'Content-Length': image.length});
					res.end(image, 'binary');
				});
		});
	});

	router.put("/", function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			secondSecret: "string?",
			publicKey: "hex?",
			image: "hex!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: "Please, provide valid secret key of your account"});
				}
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account) {
				return res.json({success: false, error: "Account doesn't has balance"});
			}

			if (!account.publicKey) {
				return res.json({success: false, error: "Open account to make transaction"});
			}

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			if (account.secondSignature && body.secondSecret) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				var secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.AVATAR,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair,
				image: body.image
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

	router.use(function (req, res) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.network.app.use('/api/avatars', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

function Avatars(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.AVATAR, new Avatar());

	setImmediate(cb, null, self);
}

Avatars.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Avatars;